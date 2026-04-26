import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../config/db';

const router = Router();

const overviewSchema = z.object({
  range: z.coerce.number().int().min(1).max(365).default(30),
});

// GET /api/v1/analytics/overview
router.get('/overview', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clinicId = req.user?.clinicId;
    if (!clinicId) {
      res.status(400).json({ error: 'Clinic association required' });
      return;
    }
    const parsed = overviewSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }
    const { range } = parsed.data;
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - range);

    // Basic Stats
    const totalAppointments = await prisma.appointment.count({
      where: { scheduledTime: { gte: daysAgo }, clinicId },
    });

    const totalNoShows = await prisma.appointment.count({
      where: { status: 'NO_SHOW', scheduledTime: { gte: daysAgo }, clinicId },
    });

    const totalCancellations = await prisma.appointment.count({
      where: { status: 'CANCELLED', scheduledTime: { gte: daysAgo }, clinicId },
    });

    // Revenue Metrics
    const revenueData = await prisma.appointment.aggregate({
      where: { scheduledTime: { gte: daysAgo }, clinicId },
      _sum: { estimatedValue: true },
    });

    const realizedRevenue = await prisma.appointment.aggregate({
      where: { status: 'COMPLETED', scheduledTime: { gte: daysAgo }, clinicId },
      _sum: { estimatedValue: true },
    });

    const lostRevenue = await prisma.appointment.aggregate({
      where: { status: 'NO_SHOW', scheduledTime: { gte: daysAgo }, clinicId },
      _sum: { estimatedValue: true },
    });

    // Clinician Performance
    const clinicianPerf = await prisma.appointment.groupBy({
      by: ['clinicianName'],
      where: { scheduledTime: { gte: daysAgo }, clinicId },
      _count: { _all: true },
      _sum: { estimatedValue: true },
    });

    // No-show by day-of-week
    const noShowsByDay = await prisma.$queryRaw<Array<{ day: number; count: bigint }>>`
      SELECT EXTRACT(DOW FROM scheduled_time) as day, COUNT(*)::int as count
      FROM appointments
      WHERE status = 'NO_SHOW' 
        AND scheduled_time >= ${daysAgo}
        AND clinic_id = ${clinicId}
      GROUP BY day
      ORDER BY day
    `;

    const noShowRate = totalAppointments > 0 ? ((totalNoShows / totalAppointments) * 100).toFixed(1) : '0';

    // Upcoming Appointments (next 7 days)
    const next7Days = new Date();
    next7Days.setDate(next7Days.getDate() + 7);
    const upcomingAppts = await prisma.appointment.findMany({
      where: { scheduledTime: { gte: new Date(), lte: next7Days }, clinicId },
      include: { patient: true },
      orderBy: { scheduledTime: 'asc' },
      take: 10
    });

    // Follow-up/Messaging Stats
    const followUpStats = await prisma.channelMessage.groupBy({
      by: ['status'],
      where: { appointment: { clinicId } },
      _count: true
    });

    // Campaign Summary
    const campaignStats = await prisma.campaign.findMany({
      where: { clinicId },
      orderBy: { createdAt: 'desc' },
      take: 5
    });

    res.json({
      period: `${range} days`,
      stats: {
        totalAppointments,
        totalNoShows,
        totalCancellations,
        noShowRate: `${noShowRate}%`,
      },
      revenue: {
        totalPotential: Number(revenueData._sum.estimatedValue || 0),
        realized: Number(realizedRevenue._sum.estimatedValue || 0),
        lost: Number(lostRevenue._sum.estimatedValue || 0),
      },
      clinicians: clinicianPerf.map(p => ({
        name: p.clinicianName || 'Unassigned',
        appts: p._count._all,
        revenue: Number(p._sum.estimatedValue || 0)
      })),
      noShowsByDayOfWeek: noShowsByDay,
      upcoming: upcomingAppts.map(a => ({
        id: a.id,
        patientName: a.patient.name,
        time: a.scheduledTime,
        status: a.status,
        value: Number(a.estimatedValue)
      })),
      followUps: followUpStats.map(s => ({
        status: s.status,
        count: s._count
      })),
      campaigns: campaignStats.map(c => ({
        id: c.id,
        name: c.name,
        type: c.type,
        status: c.status,
        sent: c.sentCount
      }))
    });
  } catch (err) {
    next(err);
  }
});

export default router;
