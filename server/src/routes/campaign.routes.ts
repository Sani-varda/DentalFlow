import { Router, Request, Response } from 'express';
import prisma from '../config/db';
import { requireRole } from '../middleware/auth';
import { campaignService } from '../services/campaign.service';
import { Channel } from '@prisma/client';

const router = Router();

// GET /api/v1/campaigns - List campaign history
router.get('/', requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const campaigns = await prisma.campaign.findMany({
      where: { clinicId: req.user?.clinicId as string },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ data: campaigns });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/campaigns - Trigger a new campaign
router.post('/', requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const { name, type, channel, content } = req.body;
    const clinicId = req.user?.clinicId;

    if (!clinicId) {
      res.status(400).json({ error: 'User not associated with a clinic' });
      return;
    }

    if (!name || !type || !channel || !content) {
      res.status(400).json({ error: 'Missing required campaign fields' });
      return;
    }

    // 1. Create campaign record (DRAFT)
    const campaign = await prisma.campaign.create({
      data: {
        clinicId,
        name,
        type,
        channel: channel as Channel,
        content,
        status: 'DRAFT'
      }
    });

    // 2. Trigger async service execution
    // Note: We don't 'await' here so the API responds immediately
    campaignService.triggerCampaign(
      clinicId,
      campaign.id,
      name,
      type,
      channel as Channel,
      content
    ).catch(err => {
      console.error(`[API] Campaign trigger error:`, err.message);
    });

    res.status(201).json({ 
      message: 'Campaign triggered successfully', 
      campaignId: campaign.id 
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
