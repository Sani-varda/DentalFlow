import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middleware/auth';
import crypto from 'crypto';

const router = Router();
const prisma = new PrismaClient();

// Get current user profile + API Key (masked)
router.get('/me', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user?.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        apiKey: true,
        clinicId: true,
        clinic: {
          select: { name: true }
        }
      }
    });

    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Update profile details
router.patch('/me', async (req, res) => {
  const { name, email, clinicName } = req.body;
  try {
    const userId = req.user?.userId;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Update User
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { name, email },
      include: { clinic: true }
    });

    // Update Clinic if clinicName provided and user is ADMIN/SUPERADMIN
    if (clinicName && updatedUser.clinicId && (updatedUser.role === 'ADMIN' || updatedUser.role === 'SUPERADMIN')) {
      await prisma.clinic.update({
        where: { id: updatedUser.clinicId },
        data: { name: clinicName }
      });
    }

    const finalUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        apiKey: true,
        clinicId: true,
        clinic: {
          select: { name: true }
        }
      }
    });

    res.json(finalUser);
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Rotate API Key
router.post('/me/api-key', async (req, res) => {
  try {
    const newKey = `df_${crypto.randomBytes(24).toString('hex')}`;
    await prisma.user.update({
      where: { id: req.user?.userId },
      data: { apiKey: newKey }
    });
    res.json({ apiKey: newKey });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate API key' });
  }
});

// External Webhooks CRUD
router.get('/webhooks', async (req, res) => {
  try {
    const webhooks = await prisma.externalWebhook.findMany({
      where: { clinicId: req.user?.clinicId }
    });
    res.json(webhooks);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch webhooks' });
  }
});

router.post('/webhooks', async (req, res) => {
  const { name, url, events } = req.body;
  try {
    const webhook = await prisma.externalWebhook.create({
      data: {
        name,
        url,
        events,
        clinicId: req.user?.clinicId as string
      }
    });
    res.json(webhook);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create webhook' });
  }
});

router.delete('/webhooks/:id', async (req, res) => {
  try {
    await prisma.externalWebhook.delete({
      where: { 
        id: req.params.id as string,
        clinicId: req.user?.clinicId as string
      }
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete webhook' });
  }
});

export default router;
