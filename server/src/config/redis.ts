import { env } from './env';

// Parse Redis URL into host/port for BullMQ compatibility
const redisUrl = new URL(env.REDIS_URL);

export const redisConnection = {
  host: redisUrl.hostname,
  port: Number(redisUrl.port) || 6379,
  maxRetriesPerRequest: null as null, // Required for BullMQ
};
