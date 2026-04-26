import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../config/db';
import { Channel, Prisma } from '@prisma/client';

const router = Router();

const channelEnum = z.nativeEnum(Channel);

const patientCreateSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email().max(320).optional().nullable(),
  phone: z.string().min(3).max(32).regex(/^\+?[0-9 ()\-.]+$/, 'Invalid phone format').optional().nullable(),
  preferredChannel: channelEnum.optional(),
  notificationPreferences: z.record(z.unknown()).optional(),
  consentStatus: z.boolean().optional(),
});

const patientUpdateSchema = patientCreateSchema.partial();

const documentCreateSchema = z.object({
  name: z.string().min(1).max(255),
  fileUrl: z.string().url().max(2048),
  fileType: z.string().min(1).max(64),
  fileSize: z.coerce.number().int().nonnegative().max(50 * 1024 * 1024), // 50 MB cap
});

const bulkSchema = z.object({
  patients: z.array(patientCreateSchema).min(1).max(1000),
});

const listQuerySchema = z.object({
  search: z.string().max(255).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

function requireClinic(req: Request, res: Response): string | null {
  const clinicId = req.user?.clinicId;
  if (!clinicId) {
    res.status(400).json({ error: 'User is not associated with a clinic' });
    return null;
  }
  return clinicId;
}

// GET /api/v1/patients
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clinicId = requireClinic(req, res);
    if (!clinicId) return;

    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }
    const { search, page, limit } = parsed.data;
    const skip = (page - 1) * limit;

    const where: { clinicId: string; name?: { contains: string; mode: 'insensitive' } } = { clinicId };
    if (search) where.name = { contains: search, mode: 'insensitive' };

    const [patients, total] = await Promise.all([
      prisma.patient.findMany({
        where,
        skip,
        take: limit,
        include: { noShowPattern: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.patient.count({ where }),
    ]);

    res.json({ data: patients, total, page, limit });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/patients/:id
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clinicId = requireClinic(req, res);
    if (!clinicId) return;
    const patient = await prisma.patient.findFirst({
      where: { id: String(req.params.id), clinicId },
      include: {
        noShowPattern: true,
        documents: { orderBy: { createdAt: 'desc' } },
        appointments: { orderBy: { scheduledTime: 'desc' }, take: 20 },
      },
    });
    if (!patient) {
      res.status(404).json({ error: 'Patient not found or unauthorized' });
      return;
    }
    res.json(patient);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/patients
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clinicId = requireClinic(req, res);
    if (!clinicId) return;

    const parsed = patientCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }
    const data = parsed.data;

    // Channel ↔ contact info consistency check
    if ((data.preferredChannel === 'SMS' || data.preferredChannel === 'WHATSAPP') && !data.phone) {
      res.status(400).json({ error: 'Phone number required for SMS/WhatsApp channel' });
      return;
    }
    if (data.preferredChannel === 'EMAIL' && !data.email) {
      res.status(400).json({ error: 'Email required for EMAIL channel' });
      return;
    }

    const patient = await prisma.$transaction(async (tx) => {
      const created = await tx.patient.create({
        data: {
          name: data.name,
          email: data.email ?? null,
          phone: data.phone ?? null,
          preferredChannel: data.preferredChannel ?? 'SMS',
          notificationPreferences: (data.notificationPreferences ?? {}) as Prisma.InputJsonValue,
          consentStatus: data.consentStatus ?? true,
          clinicId,
        },
      });
      await tx.noShowPattern.create({ data: { patientId: created.id } });
      return created;
    });

    res.status(201).json(patient);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/patients/bulk
router.post('/bulk', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clinicId = requireClinic(req, res);
    if (!clinicId) return;

    const parsed = bulkSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }

    // Process in a transaction so partial imports don't leave inconsistent state.
    const created = await prisma.$transaction(async (tx) => {
      const out = [] as Array<{ id: string; name: string }>;
      for (const p of parsed.data.patients) {
        const patient = await tx.patient.create({
          data: {
            name: p.name,
            email: p.email ?? null,
            phone: p.phone ?? null,
            preferredChannel: p.preferredChannel ?? 'SMS',
            notificationPreferences: (p.notificationPreferences ?? {}) as Prisma.InputJsonValue,
            consentStatus: p.consentStatus ?? true,
            clinicId,
          },
          select: { id: true, name: true },
        });
        await tx.noShowPattern.create({ data: { patientId: patient.id } });
        out.push(patient);
      }
      return out;
    });

    res.status(201).json({ count: created.length, data: created });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/patients/:id/documents
router.post('/:id/documents', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clinicId = requireClinic(req, res);
    if (!clinicId) return;
    const parsed = documentCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }
    const patientId = String(req.params.id);
    const patient = await prisma.patient.findFirst({ where: { id: patientId, clinicId } });
    if (!patient) {
      res.status(404).json({ error: 'Patient not found' });
      return;
    }
    const doc = await prisma.document.create({ data: { ...parsed.data, patientId } });
    res.status(201).json(doc);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/patients/:id
router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clinicId = requireClinic(req, res);
    if (!clinicId) return;
    const parsed = patientUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }

    const existing = await prisma.patient.findFirst({
      where: { id: String(req.params.id), clinicId },
    });
    if (!existing) {
      res.status(404).json({ error: 'Patient not found or unauthorized' });
      return;
    }

    const updateData: Prisma.PatientUpdateInput = {};
    if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
    if (parsed.data.email !== undefined) updateData.email = parsed.data.email;
    if (parsed.data.phone !== undefined) updateData.phone = parsed.data.phone;
    if (parsed.data.preferredChannel !== undefined) updateData.preferredChannel = parsed.data.preferredChannel;
    if (parsed.data.consentStatus !== undefined) updateData.consentStatus = parsed.data.consentStatus;
    if (parsed.data.notificationPreferences !== undefined) {
      updateData.notificationPreferences = parsed.data.notificationPreferences as Prisma.InputJsonValue;
    }

    const patient = await prisma.patient.update({
      where: { id: existing.id },
      data: updateData,
    });
    res.json(patient);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/patients/:id (soft — withdraws consent)
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clinicId = requireClinic(req, res);
    if (!clinicId) return;
    const existing = await prisma.patient.findFirst({
      where: { id: String(req.params.id), clinicId },
    });
    if (!existing) {
      res.status(404).json({ error: 'Patient not found or unauthorized' });
      return;
    }
    await prisma.patient.update({
      where: { id: existing.id },
      data: { consentStatus: false },
    });
    res.json({ message: 'Patient consent withdrawn (soft delete)' });
  } catch (err) {
    next(err);
  }
});

export default router;
