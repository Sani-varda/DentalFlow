import { Router, Request, Response } from 'express';
import prisma from '../config/db';
import { requireRole } from '../middleware/auth';
import { recalculateAllPatternScores } from '../services/noShow.service';

const router = Router();

// POST /api/v1/no-show-rules/recalculate — manually trigger scoring (Admin only)
router.post('/recalculate', requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const count = await recalculateAllPatternScores();
    res.json({ message: 'Recalculation complete', updated_count: count });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/no-show-rules — all patterns
router.get('/', async (req: Request, res: Response) => {
  try {
    const { riskLevel, page = '1', limit = '20' } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const where: any = { patient: { clinicId: req.user?.clinicId } };
    if (riskLevel) where.riskLevel = String(riskLevel);

    const [patterns, total] = await Promise.all([
      prisma.noShowPattern.findMany({
        where,
        skip,
        take: Number(limit),
        include: { patient: { select: { id: true, name: true, phone: true, email: true } } },
        orderBy: { patternScore: 'desc' },
      }),
      prisma.noShowPattern.count({ where }),
    ]);

    res.json({ data: patterns, total, page: Number(page), limit: Number(limit) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/no-show-rules/chronic — chronic cancellers only
router.get('/chronic', async (req: Request, res: Response) => {
  try {
    const chronic = await prisma.noShowPattern.findMany({
      where: { chronicFlag: true, patient: { clinicId: req.user?.clinicId } },
      include: { patient: { select: { id: true, name: true, phone: true } } },
      orderBy: { patternScore: 'desc' },
    });
    res.json({ data: chronic, total: chronic.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
