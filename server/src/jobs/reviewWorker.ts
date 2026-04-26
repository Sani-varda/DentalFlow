import { Queue, Worker } from 'bullmq';
import { redisConnection } from '../config/redis';
import { sendReviewRequest } from '../services/review.service';

export const REVIEW_QUEUE = 'review-requests';

// ─── Review Request Queue ─────────────────────────────────────────────────────
export const reviewQueue = new Queue(REVIEW_QUEUE, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts:  3,
    backoff:   { type: 'exponential', delay: 10000 },
    removeOnComplete: { count: 500 },
    removeOnFail:     { count: 200 },
  },
});

// ─── Enqueue a review request 30 minutes after appointment completes ──────────
export async function enqueueReviewRequest(appointmentId: string): Promise<void> {
  const DELAY_MS = 30 * 60 * 1000; // 30 minutes

  // Deduplicate — one review request per appointment
  const jobId = `review-${appointmentId}`;

  const existing = await reviewQueue.getJob(jobId);
  if (existing) {
    console.log(`[ReviewQueue] Job already exists for appointment ${appointmentId}, skipping`);
    return;
  }

  await reviewQueue.add(
    'send-review-request',
    { appointmentId },
    {
      jobId,
      delay: DELAY_MS,
    }
  );

  console.log(`[ReviewQueue] Enqueued review request for appointment ${appointmentId} (delay: 30min)`);
}

// ─── Worker: Process review send jobs ────────────────────────────────────────
export const reviewWorker = new Worker(
  REVIEW_QUEUE,
  async (job) => {
    const { appointmentId } = job.data;
    console.log(`[ReviewWorker] Sending review request for appointment ${appointmentId}`);
    await sendReviewRequest(appointmentId);
  },
  {
    connection:  redisConnection,
    concurrency: 5,
  }
);

reviewWorker.on('completed', (job) => {
  console.log(`[ReviewWorker] Completed: ${job.id}`);
});

reviewWorker.on('failed', (job, err) => {
  console.error(`[ReviewWorker] Failed: ${job?.id}`, err.message);
});

reviewWorker.on('stalled', (jobId) => {
  console.warn(`[ReviewWorker] Stalled: ${jobId}`);
});
