import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { logger } from '../lib/logger';

const log = logger.child({ component: 'auth' });

export interface AuthPayload {
  userId: string;
  email: string;
  role: string;
  clinicId?: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthPayload;
      id?: string;
    }
  }
}

/**
 * Routes for which the JWT may be supplied via the `?token=` query string.
 * SSE/EventSource cannot send custom headers, so we allow it there only.
 */
const QUERY_TOKEN_ALLOWLIST = new Set<string>(['/api/v1/realtime']);

function extractToken(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim() || undefined;
  }
  const path = req.baseUrl + (req.path === '/' ? '' : req.path);
  if (req.query.token && QUERY_TOKEN_ALLOWLIST.has(req.baseUrl)) {
    const token = String(req.query.token);
    return token || undefined;
  }
  // Fallback for /api/v1/realtime mounted variations
  if (req.query.token && QUERY_TOKEN_ALLOWLIST.has(path)) {
    return String(req.query.token) || undefined;
  }
  return undefined;
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: 'Missing bearer token' });
    return;
  }
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as AuthPayload;
    req.user = payload;
    next();
  } catch (err) {
    log.debug({ err: (err as Error).message, url: req.originalUrl }, 'token verification failed');
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    next();
  };
}
