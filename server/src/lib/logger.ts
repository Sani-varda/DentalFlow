import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';
const level = process.env.LOG_LEVEL || (isDev ? 'debug' : 'info');

const PII_FIELDS = [
  'password',
  'passwordHash',
  'token',
  'apiKey',
  'authorization',
  'cookie',
  'credentials',
  '*.password',
  '*.passwordHash',
  '*.token',
  '*.apiKey',
  '*.credentials',
  'req.headers.authorization',
  'req.headers.cookie',
  'req.query.token',
  'res.headers["set-cookie"]',
];

export const logger = pino({
  level,
  base: { service: 'dentaflow-api' },
  redact: { paths: PII_FIELDS, censor: '[REDACTED]' },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(isDev
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname,service' },
        },
      }
    : {}),
});

export type Logger = typeof logger;

export function childLogger(bindings: Record<string, unknown>): Logger {
  return logger.child(bindings);
}
