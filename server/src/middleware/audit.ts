import { Request, Response, NextFunction } from 'express';
import prisma from '../config/db';
import { logger } from '../lib/logger';

const log = logger.child({ component: 'audit' });

export function auditMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    next();
    return;
  }

  res.on('finish', () => {
    const userId = req.user?.userId ?? null;
    const action = `${req.method} ${req.originalUrl.split('?')[0]}`;
    const pathParts = req.originalUrl.split('/');
    const resource = pathParts[3] ?? null;
    const resourceId = req.params?.id ? String(req.params.id) : null;
    const apptIdRaw = (req.body && (req.body.appt_id || req.body.appointmentId)) || req.params?.appointmentId;
    const relatedApptId = apptIdRaw ? String(apptIdRaw) : null;

    void prisma.auditLog
      .create({
        data: {
          userId,
          action,
          resource,
          resourceId,
          relatedApptId,
          details: {
            statusCode: res.statusCode,
            ip: req.ip ?? '',
            userAgent: (req.headers['user-agent'] as string) ?? '',
            requestId: (req as Request & { id?: string }).id ?? null,
          },
        },
      })
      .catch((err: Error) => {
        // Surface to structured logging; downstream alerting picks it up.
        log.error(
          { err: err.message, action, resource, resourceId, userId },
          'audit log write failed',
        );
      });
  });

  next();
}
