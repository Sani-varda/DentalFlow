import { Router, Request, Response } from 'express';
import prisma from '../config/db';
import { requireRole } from '../middleware/auth';
import { parseHL7 } from '../services/integrations/hl7.parser';

const router = Router();

// GET /api/v1/integrations
router.get('/', requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const integrations = await prisma.integration.findMany({
      where: { clinicId: req.user?.clinicId },
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
    // In production, encrypt credentials before storing
    const integration = await prisma.integration.create({
      data: { type, name, credentials: JSON.stringify(credentials || {}), clinicId: req.user.clinicId },
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
      where: { id: String(req.params.id), clinicId: req.user?.clinicId }
    });
    if (!existing) {
      res.status(404).json({ error: 'Integration not found or unauthorized' });
      return;
    }
    const integration = await prisma.integration.update({
      where: { id: String(req.params.id) },
      data: req.body,
    });
    res.json(integration);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/integrations/:id/sync — trigger sync (stub)
router.post('/:id/sync', requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const existing = await prisma.integration.findFirst({
      where: { id: String(req.params.id), clinicId: req.user?.clinicId }
    });
    if (!existing) {
      res.status(404).json({ error: 'Integration not found or unauthorized' });
      return;
    }
    // Stub: In production, this would trigger a DMS/EMR sync job
    const integration = await prisma.integration.update({
      where: { id: String(req.params.id) },
      data: { syncStatus: 'ACTIVE', lastSyncAt: new Date() },
    });
    res.json({ message: 'Sync triggered (stub)', integration });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
// POST /api/v1/integrations/webhook/hl7 - Webhook ingest for HL7 messages
router.post('/webhook/hl7', async (req: Request, res: Response) => {
  try {
    // In a real scenario, this endpoint might be protected by an API key or mTLS
    // For now, we assume the raw HL7 message is in req.body
    
    // Express typically parses text as JSON or URL encoded, if text/plain:
    const payload = typeof req.body === 'string' ? req.body : req.body.data;
    if (!payload) {
      res.status(400).json({ error: 'HL7 payload is required' });
      return;
    }

    const hl7Message = parseHL7(payload);
    
    // Stub taking action on the parsed HL7 message
    if (hl7Message.messageType === 'SIU^S12' && hl7Message.patientId && hl7Message.appointmentId) {
      console.log(`[HL7 Webhook] Received New Appointment for Patient ${hl7Message.patientId}`);
    } else if (hl7Message.messageType === 'SIU^S15') {
      console.log(`[HL7 Webhook] Received Appointment Cancellation for ${hl7Message.appointmentId}`);
    } else {
      console.log(`[HL7 Webhook] Received unhandled message type: ${hl7Message.messageType}`);
    }

    res.json({ message: 'HL7 processed successfully', data: hl7Message });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
