import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../config/db';
import { requireRole } from '../middleware/auth';
import { Channel } from '@prisma/client';

const router = Router();

const createSchema = z.object({
  channel: z.nativeEnum(Channel),
  subject: z.string().max(255).optional(),
  body: z.string().min(1).max(8192),
  variables: z.array(z.string().max(64)).max(64).optional(),
});

const updateSchema = z.object({
  subject: z.string().max(255).optional(),
  body: z.string().min(1).max(8192).optional(),
  variables: z.array(z.string().max(64)).max(64).optional(),
  isActive: z.boolean().optional(),
});

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clinicId = req.user?.clinicId;
    if (!clinicId) {
      res.status(400).json({ error: 'Clinic association required' });
      return;
    }
    const templates = await prisma.template.findMany({
      where: { clinicId },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ data: templates });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/',
  requireRole('ADMIN', 'SUPERADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const clinicId = req.user?.clinicId;
      if (!clinicId) {
        res.status(400).json({ error: 'User must belong to a clinic' });
        return;
      }
      const parsed = createSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten().fieldErrors });
        return;
      }
      const { channel, subject, body, variables } = parsed.data;
      const template = await prisma.template.create({
        data: {
          channel,
          subject,
          body,
          variables: variables ?? [],
          clinicId,
        },
      });
      res.status(201).json(template);
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/:id',
  requireRole('ADMIN', 'SUPERADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const clinicId = req.user?.clinicId;
      if (!clinicId) {
        res.status(400).json({ error: 'Clinic association required' });
        return;
      }
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten().fieldErrors });
        return;
      }
      const existing = await prisma.template.findFirst({
        where: { id: String(req.params.id), clinicId },
      });
      if (!existing) {
        res.status(404).json({ error: 'Template not found or unauthorized' });
        return;
      }
      const template = await prisma.template.update({
        where: { id: existing.id },
        data: parsed.data,
      });
      res.json(template);
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  '/:id',
  requireRole('ADMIN', 'SUPERADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const clinicId = req.user?.clinicId;
      if (!clinicId) {
        res.status(400).json({ error: 'Clinic association required' });
        return;
      }
      const existing = await prisma.template.findFirst({
        where: { id: String(req.params.id), clinicId },
      });
      if (!existing) {
        res.status(404).json({ error: 'Template not found or unauthorized' });
        return;
      }
      await prisma.template.update({
        where: { id: existing.id },
        data: { isActive: false },
      });
      res.json({ message: 'Template deactivated' });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
