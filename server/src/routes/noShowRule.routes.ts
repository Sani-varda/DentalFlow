import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../config/db';
import { requireRole } from '../middleware/auth';
import { recalculateAllPatternScores } from '../services/noShow.service';
import { RiskLevel } from '@prisma/client';

const router = Router();

const listSchema = z.object({
  riskLevel: z.nativeEnum(RiskLevel).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

router.post(
  '/recalculate',
  requireRole('ADMIN', 'SUPERADMIN'),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const count = await recalculateAllPatternScores();
      res.json({ message: 'Recalculation complete', updated_count: count });
    } catch (err) {
      next(err);
    }
  },
);

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clinicId = req.user?.clinicId;
    if (!clinicId) {
      res.status(400).json({ error: 'Clinic association required' });
      return;
    }
    const parsed = listSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }
    const { riskLevel, page, limit } = parsed.data;
    const skip = (page - 1) * limit;
    const where: { patient: { clinicId: string }; riskLevel?: RiskLevel } = {
      patient: { clinicId },
    };
    if (riskLevel) where.riskLevel = riskLevel;

    const [patterns, total] = await Promise.all([
      prisma.noShowPattern.findMany({
        where,
        skip,
        take: limit,
        include: { patient: { select: { id: true, name: true, phone: true, email: true } } },
        orderBy: { patternScore: 'desc' },
      }),
      prisma.noShowPattern.count({ where }),
    ]);

    res.json({ data: patterns, total, page, limit });
  } catch (err) {
    next(err);
  }
});

router.get('/chronic', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clinicId = req.user?.clinicId;
    if (!clinicId) {
      res.status(400).json({ error: 'Clinic association required' });
      return;
    }
    const chronic = await prisma.noShowPattern.findMany({
      where: { chronicFlag: true, patient: { clinicId } },
      include: { patient: { select: { id: true, name: true, phone: true } } },
      orderBy: { patternScore: 'desc' },
    });
    res.json({ data: chronic, total: chronic.length });
  } catch (err) {
    next(err);
  }
});

export default router;
