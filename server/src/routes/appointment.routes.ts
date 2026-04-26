import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../config/db';
import { generateRescheduleProposals } from '../services/reschedule.service';
import { enqueueReviewRequest } from '../jobs/reviewWorker';
import { AppointmentStatus } from '@prisma/client';

const router = Router();

const listQuerySchema = z.object({
  status: z.nativeEnum(AppointmentStatus).optional(),
  patientId: z.string().min(1).max(64).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

const createSchema = z.object({
  patientId: z.string().min(1).max(64),
  scheduledTime: z.string().datetime(),
  clinicianName: z.string().min(1).max(120).optional(),
  notes: z.string().max(2048).optional(),
});

const patchSchema = z.object({
  status: z.nativeEnum(AppointmentStatus).optional(),
  scheduledTime: z.string().datetime().optional(),
  clinicianName: z.string().min(1).max(120).optional(),
  notes: z.string().max(2048).optional(),
  rescheduledFromApptId: z.string().min(1).max(64).optional(),
});

function requireClinic(req: Request, res: Response): string | null {
  const clinicId = req.user?.clinicId;
  if (!clinicId) {
    res.status(400).json({ error: 'User is not associated with a clinic' });
    return null;
  }
  return clinicId;
}

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clinicId = requireClinic(req, res);
    if (!clinicId) return;

    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }
    const { status, patientId, from, to, page, limit } = parsed.data;
    const skip = (page - 1) * limit;

    const where: {
      clinicId: string;
      status?: AppointmentStatus;
      patientId?: string;
      scheduledTime?: { gte?: Date; lte?: Date };
    } = { clinicId };
    if (status) where.status = status;
    if (patientId) where.patientId = patientId;
    if (from || to) {
      where.scheduledTime = {};
      if (from) where.scheduledTime.gte = new Date(from);
      if (to) where.scheduledTime.lte = new Date(to);
    }

    const [appointments, total] = await Promise.all([
      prisma.appointment.findMany({
        where,
        skip,
        take: limit,
        include: { patient: { select: { id: true, name: true, phone: true } } },
        orderBy: { scheduledTime: 'asc' },
      }),
      prisma.appointment.count({ where }),
    ]);

    res.json({ data: appointments, total, page, limit });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clinicId = requireClinic(req, res);
    if (!clinicId) return;
    const appt = await prisma.appointment.findFirst({
      where: { id: String(req.params.id), clinicId },
      include: {
        patient: true,
        messages: { orderBy: { createdAt: 'desc' } },
        rescheduledFrom: true,
      },
    });
    if (!appt) {
      res.status(404).json({ error: 'Appointment not found or unauthorized' });
      return;
    }
    res.json(appt);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clinicId = requireClinic(req, res);
    if (!clinicId) return;

    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }
    const { patientId, scheduledTime, clinicianName, notes } = parsed.data;

    const patient = await prisma.patient.findFirst({ where: { id: patientId, clinicId } });
    if (!patient) {
      res.status(404).json({ error: 'Patient not found in this clinic' });
      return;
    }

    const appt = await prisma.appointment.create({
      data: {
        patientId,
        clinicId,
        scheduledTime: new Date(scheduledTime),
        clinicianName,
        notes,
      },
    });

    res.status(201).json(appt);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clinicId = requireClinic(req, res);
    if (!clinicId) return;
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }
    const { status, scheduledTime, clinicianName, notes, rescheduledFromApptId } = parsed.data;

    const existing = await prisma.appointment.findFirst({
      where: { id: String(req.params.id), clinicId },
    });
    if (!existing) {
      res.status(404).json({ error: 'Appointment not found or unauthorized' });
      return;
    }

    if (status === 'NO_SHOW' && existing.status !== 'NO_SHOW') {
      await prisma.noShowPattern.upsert({
        where: { patientId: existing.patientId },
        update: {
          lastNoShowDate: new Date(),
          patternScore: { increment: 0.15 },
        },
        create: {
          patientId: existing.patientId,
          lastNoShowDate: new Date(),
          patternScore: 0.15,
        },
      });
    }

    const updated = await prisma.appointment.update({
      where: { id: existing.id },
      data: {
        ...(status !== undefined && { status }),
        ...(scheduledTime !== undefined && { scheduledTime: new Date(scheduledTime) }),
        ...(clinicianName !== undefined && { clinicianName }),
        ...(notes !== undefined && { notes }),
        ...(rescheduledFromApptId !== undefined && { rescheduledFromApptId }),
      },
    });

    // Trigger a 30-min delayed review request the first time an appointment
    // transitions into COMPLETED. Errors here must not fail the API call.
    if (status === 'COMPLETED' && existing.status !== 'COMPLETED') {
      void enqueueReviewRequest(updated.id);
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/reschedule', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clinicId = requireClinic(req, res);
    if (!clinicId) return;
    const appt = await prisma.appointment.findFirst({
      where: { id: String(req.params.id), clinicId },
      include: { patient: true },
    });
    if (!appt) {
      res.status(404).json({ error: 'Appointment not found' });
      return;
    }
    const proposals = await generateRescheduleProposals(appt, req.body?.constraints);
    res.json({
      appointmentId: appt.id,
      proposals,
      requiresClinicianApproval: true,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
