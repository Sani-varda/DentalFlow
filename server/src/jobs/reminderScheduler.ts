import { Queue, Worker } from 'bullmq';
import { redisConnection } from '../config/redis';
import prisma from '../config/db';
import { scheduleReminder } from '../services/reminder.service';
import { logger } from '../lib/logger';

const log = logger.child({ component: 'reminderScheduler' });

export const reminderQueue = new Queue('reminders', { connection: redisConnection });

const REMINDER_WINDOWS = [
  { label: '48h', hoursAhead: 48 },
  { label: '24h', hoursAhead: 24 },
  { label: '2h', hoursAhead: 2 },
];

export async function enqueueUpcomingReminders(): Promise<void> {
  const now = new Date();

  for (const w of REMINDER_WINDOWS) {
    const targetTime = new Date(now.getTime() + w.hoursAhead * 60 * 60 * 1000);
    const windowStart = new Date(targetTime.getTime() - 15 * 60 * 1000);
    const windowEnd = new Date(targetTime.getTime() + 15 * 60 * 1000);

    const appointments = await prisma.appointment.findMany({
      where: {
        status: 'SCHEDULED',
        scheduledTime: { gte: windowStart, lte: windowEnd },
      },
      include: { patient: true },
    });

    for (const appt of appointments) {
      const existing = await prisma.channelMessage.count({
        where: {
          appointmentId: appt.id,
          createdAt: { gte: new Date(now.getTime() - 30 * 60 * 1000) },
        },
      });

      if (existing === 0 && appt.patient.consentStatus) {
        await reminderQueue.add(
          `reminder-${w.label}-${appt.id}`,
          { appointmentId: appt.id, window: w.label },
          {
            attempts: 3,
            backoff: { type: 'exponential', delay: 5000 },
            removeOnComplete: { age: 86_400, count: 1000 },
            removeOnFail: { age: 7 * 86_400, count: 1000 },
          },
        );
      }
    }
  }

  log.info({ at: now.toISOString() }, 'reminder enqueue cycle complete');
}

export const reminderWorker = new Worker(
  'reminders',
  async (job) => {
    const { appointmentId } = job.data;
    log.debug({ appointmentId, jobId: job.id }, 'processing reminder');
    await scheduleReminder(appointmentId);
  },
  { connection: redisConnection, concurrency: 5 },
);

reminderWorker.on('completed', (job) => {
  log.debug({ jobId: job.id }, 'reminder completed');
});

reminderWorker.on('failed', (job, err) => {
  log.error({ jobId: job?.id, err: err.message }, 'reminder job failed');
});
