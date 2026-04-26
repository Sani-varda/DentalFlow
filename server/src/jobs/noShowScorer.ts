import { Queue, Worker } from 'bullmq';
import { redisConnection } from '../config/redis';
import { recalculateAllPatternScores } from '../services/noShow.service';
import { logger } from '../lib/logger';

const log = logger.child({ component: 'noShowScorer' });

export const noShowQueue = new Queue('no-show-scorer', { connection: redisConnection });

export async function scheduleNightlyScoring(): Promise<void> {
  await noShowQueue.add('nightly-score', {}, {
    repeat: { pattern: '0 2 * * *' }, // 2:00 AM daily
  });
  log.info('nightly scoring scheduled (cron 0 2 * * *)');
}

export const noShowWorker = new Worker(
  'no-show-scorer',
  async () => {
    log.info('starting nightly recalculation');
    const count = await recalculateAllPatternScores();
    log.info({ count }, 'recalculation complete');
  },
  { connection: redisConnection },
);

noShowWorker.on('failed', (_job, err) => {
  log.error({ err: err.message }, 'no-show scorer job failed');
});
