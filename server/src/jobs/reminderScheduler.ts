import { Queue, Worker } from 'bullmq';
import { redisConnection } from '../config/redis';
import prisma from '../config/db';
import { scheduleReminder } from '../services/reminder.service';

// ─── Reminder Queue ───
export const reminderQueue = new Queue('reminders', { connection: redisConnection });

// ─── Producer: Schedule reminders for upcoming appointments ───
export async function enqueueUpcomingReminders() {
  const now = new Date();
  const windows = [
    { label: '48h', hoursAhead: 48 },
    { label: '24h', hoursAhead: 24 },
    { label: '2h', hoursAhead: 2 },
  ];

  for (const w of windows) {
    const targetTime = new Date(now.getTime() + w.hoursAhead * 60 * 60 * 1000);
    const windowStart = new Date(targetTime.getTime() - 15 * 60 * 1000); // 15 min buffer
    const windowEnd = new Date(targetTime.getTime() + 15 * 60 * 1000);

    const appointments = await prisma.appointment.findMany({
      where: {
        status: 'SCHEDULED',
        scheduledTime: { gte: windowStart, lte: windowEnd },
      },
      include: { patient: true },
    });

    for (const appt of appointments) {
      // Check if reminder already sent for this window
      const existing = await prisma.channelMessage.count({
        where: {
          appointmentId: appt.id,
          createdAt: { gte: new Date(now.getTime() - 30 * 60 * 1000) },
        },
      });

      if (existing === 0 && appt.patient.consentStatus) {
        await reminderQueue.add(`reminder-${w.label}-${appt.id}`, {
          appointmentId: appt.id,
          window: w.label,
        }, {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
        });
      }
    }
  }

  console.log(`[ReminderScheduler] Enqueued reminders at ${now.toISOString()}`);
}

// ─── Worker: Process reminder jobs ───
export const reminderWorker = new Worker('reminders', async (job) => {
  const { appointmentId } = job.data;
  console.log(`[ReminderWorker] Processing reminder for appointment ${appointmentId}`);
  await scheduleReminder(appointmentId);
}, {
  connection: redisConnection,
  concurrency: 5,
});

reminderWorker.on('completed', (job) => {
  console.log(`[ReminderWorker] Completed: ${job.id}`);
});

reminderWorker.on('failed', (job, err) => {
  console.error(`[ReminderWorker] Failed: ${job?.id}`, err.message);
});
