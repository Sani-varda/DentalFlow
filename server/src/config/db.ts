import { PrismaClient, Prisma } from '@prisma/client';
import { logger } from '../lib/logger';

const isDev = process.env.NODE_ENV === 'development';

const logEvents: Prisma.LogDefinition[] = isDev
  ? [
      { emit: 'event', level: 'query' },
      { emit: 'event', level: 'warn' },
      { emit: 'event', level: 'error' },
    ]
  : [
      { emit: 'event', level: 'warn' },
      { emit: 'event', level: 'error' },
    ];

// Hot-reload safe singleton
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

const prisma =
  global.__prisma ??
  new PrismaClient({ log: logEvents });

if (isDev) {
  global.__prisma = prisma;
}

(prisma as any).$on('warn', (e: Prisma.LogEvent) => logger.warn({ prisma: e }, 'prisma warning'));
(prisma as any).$on('error', (e: Prisma.LogEvent) => logger.error({ prisma: e }, 'prisma error'));
if (isDev) {
  (prisma as any).$on('query', (e: Prisma.QueryEvent) =>
    logger.trace({ duration: e.duration, query: e.query }, 'prisma query'),
  );
}

export default prisma;
