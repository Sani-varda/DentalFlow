import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { z } from 'zod';
import prisma from '../config/db';
import { env } from '../config/env';
import { logger } from '../lib/logger';

const log = logger.child({ component: 'auth.routes' });

const router = Router();
const googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID);

// ─── Validation schemas ───
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1),
  // Only ADMIN or STAFF allowed on self-registration — SUPERADMIN/CLINICIAN must be assigned by existing admin
  role: z.enum(['ADMIN', 'STAFF']).optional().default('STAFF'),
  clinicName: z.string().optional(),
  clinicId: z.string().uuid().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// POST /api/v1/auth/register
router.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }

    const { email, password, name, role, clinicName, clinicId } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }

    let targetClinicId = clinicId;
    if (!targetClinicId) {
      const clinic = await prisma.clinic.create({
        data: { name: clinicName || `${name}'s Clinic` },
      });
      targetClinicId = clinic.id;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { email, passwordHash, name, role, clinicId: targetClinicId },
      select: { id: true, email: true, name: true, role: true, clinicId: true },
    });

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role, clinicId: user.clinicId },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN as any }
    );

    res.status(201).json({ token, user });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/login
router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }

    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role, clinicId: user.clinicId },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN as any }
    );

    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, clinicId: user.clinicId },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/google
router.post('/google', async (req: Request, res: Response) => {
  try {
    const { token, clinicName } = req.body;
    if (!token) {
      res.status(400).json({ error: 'Google token is required' });
      return;
    }

    // 1. Verify token with Google
    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      res.status(400).json({ error: 'Invalid Google token payload' });
      return;
    }

    const email = payload.email;
    const name = payload.name || email.split('@')[0];

    // 2. Check if user exists
    let user = await prisma.user.findUnique({ where: { email } });

    // 3. Auto-signup for new Google users
    if (!user) {
      const clinic = await prisma.clinic.create({
        data: { name: clinicName || `${name}'s Clinic` },
      });

      // Random strong password — Google users authenticate via token, not password
      const randomPassword = require('crypto').randomBytes(32).toString('hex');
      const passwordHash = await bcrypt.hash(randomPassword, 12);

      user = await prisma.user.create({
        data: {
          email,
          name,
          passwordHash,
          role: 'ADMIN',
          clinicId: clinic.id,
        },
      });
    }

    // 4. Issue DentaFlow JWT
    const appToken = jwt.sign(
      { userId: user.id, email: user.email, role: user.role, clinicId: user.clinicId },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN as any }
    );

    res.json({
      token: appToken,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, clinicId: user.clinicId },
    });
  } catch (err) {
    log.warn({ err: (err as Error).message }, 'google auth failed');
    res.status(401).json({ error: 'Google authentication failed' });
  }
});

export default router;
