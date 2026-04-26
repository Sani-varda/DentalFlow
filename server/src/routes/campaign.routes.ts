import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../config/db';
import { requireRole } from '../middleware/auth';
import { campaignService } from '../services/campaign.service';
import { Channel } from '@prisma/client';
import { logger } from '../lib/logger';

const router = Router();
const log = logger.child({ component: 'campaign.routes' });

const campaignCreateSchema = z.object({
  name: z.string().min(1).max(120),
  type: z.string().min(1).max(64),
  channel: z.nativeEnum(Channel),
  content: z.string().min(1).max(4096),
});

router.get('/', requireRole('ADMIN', 'SUPERADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clinicId = req.user?.clinicId;
    if (!clinicId) {
      res.status(400).json({ error: 'Clinic association required' });
      return;
    }
    const campaigns = await prisma.campaign.findMany({
      where: { clinicId },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ data: campaigns });
  } catch (err) {
    next(err);
  }
});

router.post('/', requireRole('ADMIN', 'SUPERADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clinicId = req.user?.clinicId;
    if (!clinicId) {
      res.status(400).json({ error: 'User not associated with a clinic' });
      return;
    }
    const parsed = campaignCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }
    const { name, type, channel, content } = parsed.data;

    const campaign = await prisma.campaign.create({
      data: { clinicId, name, type, channel, content, status: 'DRAFT' },
    });

    // Fire-and-forget; campaign service handles persistence + retries.
    void campaignService
      .triggerCampaign(clinicId, campaign.id, name, type, channel, content)
      .catch((err) => {
        log.error({ err: (err as Error).message, campaignId: campaign.id }, 'campaign trigger failed');
      });

    res.status(201).json({
      message: 'Campaign accepted',
      campaignId: campaign.id,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
