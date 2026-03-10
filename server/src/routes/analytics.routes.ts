import { Router, Request, Response } from 'express';
import prisma from '../config/db';

const router = Router();

// GET /api/v1/analytics/overview
router.get('/overview', async (req: Request, res: Response) => {
  try {
    const { range = '30' } = req.query;
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - Number(range));

    const clinicId = req.user?.clinicId;

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
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
