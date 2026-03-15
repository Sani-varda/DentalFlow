import { Router, Request, Response } from 'express';
import prisma from '../config/db';
import { requireRole } from '../middleware/auth';
import { parseHL7 } from '../services/integrations/hl7.parser';
import { encrypt, decrypt } from '../lib/crypto';

const router = Router();

// GET /api/v1/integrations
router.get('/', requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const integrations = await prisma.integration.findMany({
      where: { clinicId: req.user?.clinicId },
      // Never return credentials field in list view
      select: { id: true, type: true, name: true, syncStatus: true, lastSyncAt: true, createdAt: true },
    });
    res.json({ data: integrations });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/integrations
router.post('/', requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const { type, name, credentials } = req.body;
    if (!type || !name) {
      res.status(400).json({ error: 'type and name are required' });
      return;
    }
    if (!req.user?.clinicId) {
      res.status(400).json({ error: 'User must belong to a clinic' });
      return;
    }

    // Encrypt credentials before storing
    const encryptedCredentials = encrypt(JSON.stringify(credentials || {}));

    const integration = await prisma.integration.create({
      data: {
        type,
        name,
        credentials: encryptedCredentials,
        clinicId: req.user.clinicId,
      },
      // Return without credentials
      select: { id: true, type: true, name: true, syncStatus: true, createdAt: true },
    });
    res.status(201).json(integration);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/v1/integrations/:id
router.patch('/:id', requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const existing = await prisma.integration.findFirst({
      where: { id: String(req.params.id), clinicId: req.user?.clinicId },
    });
    if (!existing) {
      res.status(404).json({ error: 'Integration not found or unauthorized' });
      return;
    }

    const updateData: any = { ...req.body };

    // If credentials are being updated, re-encrypt them
    if (updateData.credentials) {
      updateData.credentials = encrypt(JSON.stringify(updateData.credentials));
    }

    const integration = await prisma.integration.update({
      where: { id: String(req.params.id) },
      data: updateData,
      select: { id: true, type: true, name: true, syncStatus: true, updatedAt: true },
    });
    res.json(integration);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/integrations/:id/credentials — ADMIN-only, returns decrypted credentials
// Used internally by sync jobs and adapters — never called from the frontend
router.get('/:id/credentials', requireRole('ADMIN', 'SUPERADMIN'), async (req: Request, res: Response) => {
  try {
    const existing = await prisma.integration.findFirst({
      where: { id: String(req.params.id), clinicId: req.user?.clinicId },
    });
    if (!existing) {
      res.status(404).json({ error: 'Integration not found or unauthorized' });
      return;
    }

    const decrypted = decrypt(existing.credentials);
    res.json({ credentials: JSON.parse(decrypted) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/integrations/:id/sync
router.post('/:id/sync', requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const existing = await prisma.integration.findFirst({
      where: { id: String(req.params.id), clinicId: req.user?.clinicId },
    });
    if (!existing) {
      res.status(404).json({ error: 'Integration not found or unauthorized' });
      return;
    }
    const integration = await prisma.integration.update({
      where: { id: String(req.params.id) },
      data: { syncStatus: 'ACTIVE', lastSyncAt: new Date() },
    });
    res.json({ message: 'Sync triggered', integration });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/integrations/webhook/hl7 — ingest HL7 messages from DMS/EMR
router.post('/webhook/hl7', async (req: Request, res: Response) => {
  try {
    const payload = typeof req.body === 'string' ? req.body : req.body.data;
    if (!payload) {
      res.status(400).json({ error: 'HL7 payload is required' });
      return;
    }

    const hl7Message = parseHL7(payload);

    if (hl7Message.messageType === 'SIU^S12' && hl7Message.patientId && hl7Message.appointmentId) {
      console.log(`[HL7 Webhook] New Appointment for Patient ${hl7Message.patientId}`);
    } else if (hl7Message.messageType === 'SIU^S15') {
      console.log(`[HL7 Webhook] Appointment Cancellation for ${hl7Message.appointmentId}`);
    } else {
      console.log(`[HL7 Webhook] Unhandled message type: ${hl7Message.messageType}`);
    }

    res.json({ message: 'HL7 processed successfully', data: hl7Message });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
