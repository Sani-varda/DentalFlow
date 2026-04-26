import { env } from '../config/env';
import { request } from '../lib/http';
import { logger } from '../lib/logger';

const log = logger.child({ component: 'noShow.service' });

interface RecalculateResponse {
  status: string;
  message?: string;
  detail?: string;
  updated_count?: number;
}

/**
 * Trigger a full pattern recalculation in the Python scoring service.
 * Returns the number of patient scores updated, or 0 if the service is
 * unreachable. Failures are logged but never thrown, so callers (cron,
 * manual admin trigger) don't crash on a flaky downstream.
 */
export async function recalculateAllPatternScores(): Promise<number> {
  const url = `${env.SCORING_SERVICE_URL}/recalculate`;
  try {
    log.info({ url }, 'triggering remote recalculation');
    const response = await request<RecalculateResponse>(
      { method: 'POST', url },
      { timeoutMs: env.SCORING_SERVICE_TIMEOUT_MS, retries: 2 },
    );
    if (response.data.status === 'success') {
      log.info({ count: response.data.updated_count, message: response.data.message }, 'recalculation complete');
      return response.data.updated_count ?? 0;
    }
    throw new Error(response.data.detail || 'Unknown error from scoring service');
  } catch (err) {
    log.warn(
      { err: (err as Error).message, url },
      'scoring service unavailable; returning 0',
    );
    return 0;
  }
}

export async function recalculatePatientScore(patientId: string): Promise<unknown> {
  const url = `${env.SCORING_SERVICE_URL}/patient/${encodeURIComponent(patientId)}`;
  try {
    const response = await request(
      { method: 'POST', url },
      { timeoutMs: env.SCORING_SERVICE_TIMEOUT_MS, retries: 1 },
    );
    return response.data;
  } catch (err) {
    log.error({ err: (err as Error).message, patientId }, 'patient scoring failed');
    return null;
  }
}
