import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import prisma from '../config/db';
import { logger } from '../lib/logger';

const router = Router();

function maskApiKey(key: string | null | undefined): string | null {
  if (!key) return null;
  if (key.length <= 8) return '****';
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

const profileUpdateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  email: z.string().email().max(255).optional(),
  clinicName: z.string().min(1).max(120).optional(),
});

const webhookCreateSchema = z.object({
  name: z.string().min(1).max(120),
  url: z.string().url().max(2048),
  events: z.array(z.string().min(1).max(64)).min(1).max(50),
});

function requireUser(req: Request, res: Response): { userId: string; clinicId?: string } | null {
  const userId = req.user?.userId;
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }
  return { userId, clinicId: req.user?.clinicId };
}

// GET /api/v1/users/me — current user profile (api key masked)
router.get('/me', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ctx = requireUser(req, res);
    if (!ctx) return;

    const user = await prisma.user.findUnique({
      where: { id: ctx.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        apiKey: true,
        clinicId: true,
        clinic: { select: { name: true } },
      },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({ ...user, apiKey: maskApiKey(user.apiKey) });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/users/me — update profile (and clinic name if admin)
router.patch('/me', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ctx = requireUser(req, res);
    if (!ctx) return;

    const parsed = profileUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }
    const { name, email, clinicName } = parsed.data;

    const user = await prisma.user.findUnique({ where: { id: ctx.userId } });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // If email is changing, ensure it's not in use
    if (email && email !== user.email) {
      const conflict = await prisma.user.findUnique({ where: { email } });
      if (conflict) {
        res.status(409).json({ error: 'Email already in use' });
        return;
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: ctx.userId },
      data: { name, email },
    });

    if (
      clinicName &&
      updatedUser.clinicId &&
      (updatedUser.role === 'ADMIN' || updatedUser.role === 'SUPERADMIN')
    ) {
      await prisma.clinic.update({
        where: { id: updatedUser.clinicId },
        data: { name: clinicName },
      });
    }

    const finalUser = await prisma.user.findUnique({
      where: { id: ctx.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        apiKey: true,
        clinicId: true,
        clinic: { select: { name: true } },
      },
    });

    res.json(finalUser ? { ...finalUser, apiKey: maskApiKey(finalUser.apiKey) } : null);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/users/me/api-key — rotate API key (returned once, plain)
router.post('/me/api-key', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ctx = requireUser(req, res);
    if (!ctx) return;

    const newKey = `df_${crypto.randomBytes(24).toString('hex')}`;
    await prisma.user.update({
      where: { id: ctx.userId },
      data: { apiKey: newKey },
    });
    logger.info({ userId: ctx.userId }, 'api key rotated');
    res.json({ apiKey: newKey, warning: 'Store this key now — it will not be shown again.' });
  } catch (err) {
    next(err);
  }
});

// External Webhooks CRUD
router.get('/webhooks', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ctx = requireUser(req, res);
    if (!ctx?.clinicId) {
      res.status(400).json({ error: 'Clinic association required' });
      return;
    }
    const webhooks = await prisma.externalWebhook.findMany({
      where: { clinicId: ctx.clinicId },
    });
    res.json(webhooks);
  } catch (err) {
    next(err);
  }
});

router.post('/webhooks', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ctx = requireUser(req, res);
    if (!ctx?.clinicId) {
      res.status(400).json({ error: 'Clinic association required' });
      return;
    }
    const parsed = webhookCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }
    const webhook = await prisma.externalWebhook.create({
      data: { ...parsed.data, clinicId: ctx.clinicId },
    });
    res.status(201).json(webhook);
  } catch (err) {
    next(err);
  }
});

router.delete('/webhooks/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ctx = requireUser(req, res);
    if (!ctx?.clinicId) {
      res.status(400).json({ error: 'Clinic association required' });
      return;
    }
    const result = await prisma.externalWebhook.deleteMany({
      where: { id: String(req.params.id), clinicId: ctx.clinicId },
    });
    if (result.count === 0) {
      res.status(404).json({ error: 'Webhook not found or unauthorized' });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
