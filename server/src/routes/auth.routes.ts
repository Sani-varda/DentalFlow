import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import prisma from '../config/db';
import { env } from '../config/env';

const router = Router();
const googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID);

// POST /api/v1/auth/register
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, name, role, clinicName, clinicId } = req.body;
    if (!email || !password || !name) {
      res.status(400).json({ error: 'email, password, and name are required' });
      return;
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }

    let targetClinicId = clinicId;
    if (!targetClinicId) {
      const clinic = await prisma.clinic.create({
        data: { name: clinicName || `${name}'s Clinic` }
      });
      targetClinicId = clinic.id;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { email, passwordHash, name, role: role || 'STAFF', clinicId: targetClinicId },
      select: { id: true, email: true, name: true, role: true, clinicId: true },
    });

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role, clinicId: user.clinicId },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN as any }
    );

    res.status(201).json({ token, user });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/auth/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: 'email and password are required' });
      return;
    }

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

    res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role, clinicId: user.clinicId } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
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

    // 1. Verify token
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

    // 3. Auto-Signup if new user
    if (!user) {
      // Create personal clinic for new SSO users
      const clinic = await prisma.clinic.create({
        data: { name: clinicName || `${name}'s Clinic` }
      });

      // Generate a strong random password since they logged in with Google
      const randomPassword = require('crypto').randomBytes(32).toString('hex');
      const passwordHash = await bcrypt.hash(randomPassword, 12);

      user = await prisma.user.create({
        data: {
          email,
          name,
          passwordHash,
          role: 'ADMIN', // New signups get ADMIN logic by default for their own clinic
          clinicId: clinic.id
        }
      });
    }

    // 4. Issue standard DentaFlow JWT
    const appToken = jwt.sign(
      { userId: user.id, email: user.email, role: user.role, clinicId: user.clinicId },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN as any }
    );

    res.json({ token: appToken, user: { id: user.id, email: user.email, name: user.name, role: user.role, clinicId: user.clinicId } });
  } catch (err: any) {
    console.error('Google Auth Error:', err.message);
    res.status(500).json({ error: 'Google authentication failed' });
  }
});

export default router;
