import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../config/db';
import { scheduleReminder } from '../services/reminder.service';
import { Channel, MessageStatus } from '@prisma/client';

const router = Router();

const listSchema = z.object({
  appointmentId: z.string().min(1).max(64).optional(),
  status: z.nativeEnum(MessageStatus).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

const createSchema = z.object({
  appointmentId: z.string().min(1).max(64),
  channel: z.nativeEnum(Channel).optional(),
  templateId: z.string().min(1).max(64).optional(),
});

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clinicId = req.user?.clinicId;
    if (!clinicId) {
      res.status(400).json({ error: 'Clinic association required' });
      return;
    }
    const parsed = listSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }
    const { appointmentId, status, page, limit } = parsed.data;
    const skip = (page - 1) * limit;
    const where: {
      appointment: { clinicId: string };
      appointmentId?: string;
      status?: MessageStatus;
    } = { appointment: { clinicId } };
    if (appointmentId) where.appointmentId = appointmentId;
    if (status) where.status = status;

    const [messages, total] = await Promise.all([
      prisma.channelMessage.findMany({
        where,
        skip,
        take: limit,
        include: {
          appointment: {
            select: { id: true, scheduledTime: true, patient: { select: { name: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.channelMessage.count({ where }),
    ]);

    res.json({ data: messages, total, page, limit });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clinicId = req.user?.clinicId;
    if (!clinicId) {
      res.status(400).json({ error: 'Clinic association required' });
      return;
    }
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }
    const { appointmentId, channel, templateId } = parsed.data;

    const appt = await prisma.appointment.findFirst({
      where: { id: appointmentId, clinicId },
    });
    if (!appt) {
      res.status(404).json({ error: 'Appointment not found or unauthorized' });
      return;
    }

    const result = await scheduleReminder(appointmentId, channel, templateId);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clinicId = req.user?.clinicId;
    if (!clinicId) {
      res.status(400).json({ error: 'Clinic association required' });
      return;
    }
    const msg = await prisma.channelMessage.findFirst({
      where: { id: String(req.params.id), appointment: { clinicId } },
    });
    if (!msg) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }
    res.json({ id: msg.id, status: msg.status, deliveryReport: msg.deliveryReport });
  } catch (err) {
    next(err);
  }
});

export default router;
