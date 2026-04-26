import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import prisma from '../config/db';
import { Prisma, IntegrationType, SyncStatus } from '@prisma/client';
import { authMiddleware, requireRole } from '../middleware/auth';
import { auditMiddleware } from '../middleware/audit';
import { parseHL7, HL7ParseError } from '../services/integrations/hl7.parser';
import { encrypt, decrypt } from '../lib/crypto';
import { logger } from '../lib/logger';

const router = Router();
const log = logger.child({ component: 'integration.routes' });

const integrationCreateSchema = z.object({
  type: z.nativeEnum(IntegrationType),
  name: z.string().min(1).max(120),
  credentials: z.record(z.unknown()).optional().default({}),
});

const integrationUpdateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  type: z.nativeEnum(IntegrationType).optional(),
  credentials: z.record(z.unknown()).optional(),
  syncStatus: z.nativeEnum(SyncStatus).optional(),
});

// GET /api/v1/integrations
router.get('/', requireRole('ADMIN', 'SUPERADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const integrations = await prisma.integration.findMany({
      where: { clinicId: req.user?.clinicId },
      select: { id: true, type: true, name: true, syncStatus: true, lastSyncAt: true, createdAt: true },
    });
    res.json({ data: integrations });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/integrations
router.post('/', requireRole('ADMIN', 'SUPERADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.clinicId) {
      res.status(400).json({ error: 'User must belong to a clinic' });
      return;
    }
    const parsed = integrationCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }
    const { type, name, credentials } = parsed.data;
    const integration = await prisma.integration.create({
      data: {
        type,
        name,
        credentials: encrypt(JSON.stringify(credentials)),
        clinicId: req.user.clinicId,
      },
      select: { id: true, type: true, name: true, syncStatus: true, createdAt: true },
    });
    res.status(201).json(integration);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/integrations/:id
router.patch('/:id', requireRole('ADMIN', 'SUPERADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = integrationUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }
    const existing = await prisma.integration.findFirst({
      where: { id: String(req.params.id), clinicId: req.user?.clinicId },
    });
    if (!existing) {
      res.status(404).json({ error: 'Integration not found or unauthorized' });
      return;
    }
    const updateData: Prisma.IntegrationUpdateInput = {};
    if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
    if (parsed.data.type !== undefined) updateData.type = parsed.data.type;
    if (parsed.data.syncStatus !== undefined) updateData.syncStatus = parsed.data.syncStatus;
    if (parsed.data.credentials !== undefined) {
      updateData.credentials = encrypt(JSON.stringify(parsed.data.credentials));
    }
    const integration = await prisma.integration.update({
      where: { id: String(req.params.id) },
      data: updateData,
      select: { id: true, type: true, name: true, syncStatus: true, updatedAt: true },
    });
    res.json(integration);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/integrations/:id/credentials — explicit audit on access
router.get(
  '/:id/credentials',
  requireRole('ADMIN', 'SUPERADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const existing = await prisma.integration.findFirst({
        where: { id: String(req.params.id), clinicId: req.user?.clinicId },
      });
      if (!existing) {
        res.status(404).json({ error: 'Integration not found or unauthorized' });
        return;
      }
      const decrypted = decrypt(existing.credentials);
      log.warn(
        {
          actorUserId: req.user?.userId,
          integrationId: existing.id,
          clinicId: req.user?.clinicId,
        },
        'integration credentials accessed',
      );
      res.json({ credentials: JSON.parse(decrypted) });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/integrations/:id/sync
router.post('/:id/sync', requireRole('ADMIN', 'SUPERADMIN'), async (req: Request, res: Response, next: NextFunction) => {
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
  } catch (err) {
    next(err);
  }
});

// ─── HL7 webhook ──────────────────────────────────────────────────────────
// Authenticated via JWT (mounted with auth middleware). HMAC-shared-secret
// verification is layered on top when INTEGRATION_WEBHOOK_SECRET is set
// at the clinic-integration level (handled by the caller).
const hl7Body = z.union([
  z.string(),
  z.object({ data: z.string() }),
]);

router.post(
  '/webhook/hl7',
  authMiddleware,
  auditMiddleware,
  requireRole('ADMIN', 'SUPERADMIN', 'STAFF'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = hl7Body.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'HL7 payload required as string or { data: string }' });
        return;
      }
      const payload = typeof parsed.data === 'string' ? parsed.data : parsed.data.data;

      let hl7Message;
      try {
        hl7Message = parseHL7(payload);
      } catch (err) {
        if (err instanceof HL7ParseError) {
          res.status(400).json({ error: err.message });
          return;
        }
        throw err;
      }

      log.info(
        {
          messageType: hl7Message.messageType,
          patientId: hl7Message.patientId,
          appointmentId: hl7Message.appointmentId,
          clinicId: req.user?.clinicId,
        },
        'hl7 message ingested',
      );

      res.json({ message: 'HL7 processed successfully', data: hl7Message });
    } catch (err) {
      next(err);
    }
  },
);

export default router;

// re-export so tests / scripts can compute an HMAC for a payload if needed
export function hmacPayload(secret: string, payload: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}
