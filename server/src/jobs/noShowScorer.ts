import { Queue, Worker } from 'bullmq';
import { redisConnection } from '../config/redis';
import { recalculateAllPatternScores } from '../services/noShow.service';

export const noShowQueue = new Queue('no-show-scorer', { connection: redisConnection });

// Schedule nightly recalculation
export async function scheduleNightlyScoring() {
  await noShowQueue.add('nightly-score', {}, {
    repeat: { pattern: '0 2 * * *' }, // 2:00 AM daily
  });
  console.log('[NoShowScorer] Nightly scoring scheduled at 2:00 AM');
}

export const noShowWorker = new Worker('no-show-scorer', async () => {
  console.log('[NoShowScorer] Starting nightly recalculation...');
  const count = await recalculateAllPatternScores();
  console.log(`[NoShowScorer] Updated ${count} patient scores`);
}, {
  connection: redisConnection,
});

noShowWorker.on('failed', (_job, err) => {
  console.error('[NoShowScorer] Job failed:', err.message);
});
