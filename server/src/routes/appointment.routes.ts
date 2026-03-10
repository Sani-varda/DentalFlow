import { Router, Request, Response } from 'express';
import prisma from '../config/db';
import { generateRescheduleProposals } from '../services/reschedule.service';

const router = Router();

// GET /api/v1/appointments
router.get('/', async (req: Request, res: Response) => {
  try {
    const { status, patientId, from, to, page = '1', limit = '20' } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const where: any = { clinicId: req.user?.clinicId };
    if (status) where.status = String(status);
    if (patientId) where.patientId = String(patientId);
    if (from || to) {
      where.scheduledTime = {};
      if (from) where.scheduledTime.gte = new Date(String(from));
      if (to) where.scheduledTime.lte = new Date(String(to));
    }

    const [appointments, total] = await Promise.all([
      prisma.appointment.findMany({
        where,
        skip,
        take: Number(limit),
        include: { patient: { select: { id: true, name: true, phone: true } } },
        orderBy: { scheduledTime: 'asc' },
      }),
      prisma.appointment.count({ where }),
    ]);

    res.json({ data: appointments, total, page: Number(page), limit: Number(limit) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/appointments/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const appt = await prisma.appointment.findFirst({
      where: { id: String(req.params.id), clinicId: req.user?.clinicId },
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
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/appointments
router.post('/', async (req: Request, res: Response) => {
  try {
    const { patientId, scheduledTime, clinicianName, notes } = req.body;
    if (!patientId || !scheduledTime) {
      res.status(400).json({ error: 'patientId and scheduledTime are required' });
      return;
    }

    if (!req.user?.clinicId) {
      res.status(400).json({ error: 'User is not associated with a clinic' });
      return;
    }

    // Verify patient belongs to same clinic
    const patient = await prisma.patient.findFirst({
      where: { id: patientId, clinicId: req.user.clinicId }
    });
    if (!patient) {
      res.status(404).json({ error: 'Patient not found in this clinic' });
      return;
    }

    const appt = await prisma.appointment.create({
      data: {
        patientId,
        clinicId: req.user.clinicId,
        scheduledTime: new Date(scheduledTime),
        clinicianName,
        notes,
      },
    });

    res.status(201).json(appt);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/v1/appointments/:id  — status transitions
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { status, scheduledTime, clinicianName, notes, rescheduledFromApptId } = req.body;

    // If marking as NO_SHOW, update the patient's no-show pattern
    if (status === 'NO_SHOW') {
      const appt = await prisma.appointment.findFirst({
        where: { id: String(req.params.id), clinicId: req.user?.clinicId },
        select: { patientId: true },
      });
      if (appt) {
        await prisma.noShowPattern.upsert({
          where: { patientId: appt.patientId },
          update: {
            lastNoShowDate: new Date(),
            patternScore: { increment: 0.15 },
          },
          create: {
            patientId: appt.patientId,
            lastNoShowDate: new Date(),
            patternScore: 0.15,
          },
        });
      }
    }

    const existing = await prisma.appointment.findFirst({
      where: { id: String(req.params.id), clinicId: req.user?.clinicId }
    });
    if (!existing) {
      res.status(404).json({ error: 'Appointment not found or unauthorized' });
      return;
    }

    const updated = await prisma.appointment.update({
      where: { id: String(req.params.id) },
      data: {
        ...(status && { status }),
        ...(scheduledTime && { scheduledTime: new Date(scheduledTime) }),
        ...(clinicianName !== undefined && { clinicianName }),
        ...(notes !== undefined && { notes }),
        ...(rescheduledFromApptId && { rescheduledFromApptId }),
      },
    });

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/appointments/:id/reschedule — AI-assisted proposals
router.post('/:id/reschedule', async (req: Request, res: Response) => {
  try {
    const appt = await prisma.appointment.findFirst({
      where: { id: String(req.params.id), clinicId: req.user?.clinicId },
      include: { patient: true },
    });
    if (!appt) {
      res.status(404).json({ error: 'Appointment not found' });
      return;
    }

    const proposals = await generateRescheduleProposals(appt, req.body.constraints);
    res.json({
      appointmentId: appt.id,
      proposals,
      requiresClinicianApproval: true,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
