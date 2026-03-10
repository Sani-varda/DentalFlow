import { Router, Request, Response } from 'express';
import prisma from '../config/db';
import { requireRole } from '../middleware/auth';

const router = Router();

// GET /api/v1/templates
router.get('/', async (req: Request, res: Response) => {
  try {
    const templates = await prisma.template.findMany({ 
      where: { clinicId: req.user?.clinicId },
      orderBy: { createdAt: 'desc' } 
    });
    res.json({ data: templates });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/templates
router.post('/', requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const { channel, subject, body, variables } = req.body;
    if (!channel || !body) {
      res.status(400).json({ error: 'channel and body are required' });
      return;
    }
    if (!req.user?.clinicId) {
      res.status(400).json({ error: 'User must belong to a clinic' });
      return;
    }
    const template = await prisma.template.create({
      data: { 
        channel, 
        subject, 
        body, 
        variables: variables || [],
        clinicId: req.user.clinicId
      },
    });
    res.status(201).json(template);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/v1/templates/:id
router.patch('/:id', requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const existing = await prisma.template.findFirst({
      where: { id: String(req.params.id), clinicId: req.user?.clinicId }
    });
    if (!existing) {
      res.status(404).json({ error: 'Template not found or unauthorized' });
      return;
    }
    const template = await prisma.template.update({
      where: { id: String(req.params.id) },
      data: req.body,
    });
    res.json(template);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/v1/templates/:id
router.delete('/:id', requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const existing = await prisma.template.findFirst({
      where: { id: String(req.params.id), clinicId: req.user?.clinicId }
    });
    if (!existing) {
      res.status(404).json({ error: 'Template not found or unauthorized' });
      return;
    }
    await prisma.template.update({
      where: { id: String(req.params.id) },
      data: { isActive: false },
    });
    res.json({ message: 'Template deactivated' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
