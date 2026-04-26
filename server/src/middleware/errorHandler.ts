import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { logger } from '../lib/logger';

export interface ApiError {
  status: number;
  message: string;
  details?: unknown;
}

const log = logger.child({ component: 'errorHandler' });

export class HttpError extends Error implements ApiError {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

interface ResolvedError {
  status: number;
  message: string;
  details?: unknown;
}

function resolve(err: Error & Partial<ApiError>): ResolvedError {
  if (err instanceof ZodError) {
    return { status: 400, message: 'Invalid request body', details: err.flatten().fieldErrors };
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') return { status: 409, message: 'Resource already exists' };
    if (err.code === 'P2025') return { status: 404, message: 'Resource not found' };
    return { status: 400, message: 'Database constraint violation' };
  }
  if (err instanceof Prisma.PrismaClientValidationError) {
    return { status: 400, message: 'Invalid database request' };
  }
  if (typeof err.status === 'number') {
    return { status: err.status, message: err.message || 'Request failed', details: err.details };
  }
  return { status: 500, message: 'Internal server error' };
}

export function errorHandler(
  err: Error & Partial<ApiError>,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  const resolved = resolve(err);

  if (resolved.status >= 500) {
    log.error(
      {
        err: { name: err.name, message: err.message, stack: err.stack },
        method: req.method,
        url: req.originalUrl,
        userId: req.user?.userId,
        clinicId: req.user?.clinicId,
      },
      'unhandled request error',
    );
  } else {
    log.warn(
      {
        status: resolved.status,
        method: req.method,
        url: req.originalUrl,
        message: resolved.message,
      },
      'request rejected',
    );
  }

  const body: Record<string, unknown> = { error: resolved.message };
  if (resolved.details !== undefined) body.details = resolved.details;
  if (process.env.NODE_ENV === 'development' && resolved.status >= 500) {
    body.stack = err.stack;
  }
  res.status(resolved.status).json(body);
}

export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ error: 'Route not found' });
}
