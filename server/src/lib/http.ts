import axios, { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios';
import { env } from '../config/env';
import { logger } from './logger';

export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  timeoutMs?: number;
  retryOnStatus?: (status: number) => boolean;
}

const DEFAULT_RETRY_STATUS = (status: number) => status >= 500 || status === 408 || status === 429;

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Performs an HTTP request with timeout and exponential-backoff retry on
 * network errors and retryable status codes.
 */
export async function request<T = unknown>(
  config: AxiosRequestConfig,
  options: RetryOptions = {},
): Promise<AxiosResponse<T>> {
  const retries = options.retries ?? 2;
  const baseDelay = options.baseDelayMs ?? 200;
  const timeout = options.timeoutMs ?? env.EXTERNAL_HTTP_TIMEOUT_MS;
  const isRetryable = options.retryOnStatus ?? DEFAULT_RETRY_STATUS;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await axios.request<T>({ ...config, timeout });
    } catch (err) {
      lastErr = err;
      const axErr = err as AxiosError;
      const status = axErr.response?.status;
      const isNetwork = !axErr.response;
      const shouldRetry = attempt < retries && (isNetwork || (status !== undefined && isRetryable(status)));
      if (!shouldRetry) break;
      const wait = baseDelay * 2 ** attempt;
      logger.warn(
        { url: config.url, attempt: attempt + 1, status, err: axErr.message },
        'http request failed, retrying',
      );
      await delay(wait);
    }
  }
  throw lastErr;
}
