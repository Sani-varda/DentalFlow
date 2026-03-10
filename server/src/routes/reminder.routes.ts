import { Router, Request, Response } from 'express';
import prisma from '../config/db';
import { scheduleReminder } from '../services/reminder.service';

const router = Router();

// GET /api/v1/reminders — list channel messages (reminders)
router.get('/', async (req: Request, res: Response) => {
  try {
    const { appointmentId, status, page = '1', limit = '20' } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const where: any = { appointment: { clinicId: req.user?.clinicId } };
    if (appointmentId) where.appointmentId = String(appointmentId);
    if (status) where.status = String(status);

    const [messages, total] = await Promise.all([
      prisma.channelMessage.findMany({
        where,
        skip,
        take: Number(limit),
        include: { appointment: { select: { id: true, scheduledTime: true, patient: { select: { name: true } } } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.channelMessage.count({ where }),
    ]);

    res.json({ data: messages, total, page: Number(page), limit: Number(limit) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/reminders — manually trigger a reminder for an appointment
router.post('/', async (req: Request, res: Response) => {
  try {
    const { appointmentId, channel, templateId } = req.body;
    if (!appointmentId) {
      res.status(400).json({ error: 'appointmentId is required' });
      return;
    }

    const appt = await prisma.appointment.findFirst({
      where: { id: String(appointmentId), clinicId: req.user?.clinicId }
    });
    if (!appt) {
      res.status(404).json({ error: 'Appointment not found or unauthorized' });
      return;
    }

    const result = await scheduleReminder(appointmentId, channel, templateId);
    res.status(201).json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/reminders/:id/status
router.get('/:id/status', async (req: Request, res: Response) => {
  try {
    const msg = await prisma.channelMessage.findFirst({ 
      where: { id: String(req.params.id), appointment: { clinicId: req.user?.clinicId } } 
    });
    if (!msg) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }
    res.json({ id: msg.id, status: msg.status, deliveryReport: msg.deliveryReport });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
