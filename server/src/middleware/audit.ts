import { Request, Response, NextFunction } from 'express';
import prisma from '../config/db';

export function auditMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Only log mutating requests
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const originalEnd = res.end;
    const chunks: Buffer[] = [];

    // Capture when response finishes, then log
    res.end = function (this: Response, ...args: any[]) {
      // Fire-and-forget audit log write
      const userId = req.user?.userId || null;
      const action = `${req.method} ${req.originalUrl}`;
      const resource = req.originalUrl.split('/')[3] || null; // e.g. "patients"
      const resourceId = req.params?.id ? String(req.params.id) : null;
      const relatedApptId = (req.body?.appt_id || req.params?.appointmentId) 
        ? String(req.body?.appt_id || req.params?.appointmentId) 
        : null;

      prisma.auditLog.create({
        data: {
          userId,
          action,
          resource,
          resourceId,
          relatedApptId,
          details: {
            statusCode: res.statusCode,
            ip: req.ip || '',
            userAgent: (req.headers['user-agent'] as string) || '',
          },
        },
      }).catch((err: Error) => {
        console.error('[AuditLog] Failed to write:', err.message);
      });

      return originalEnd.apply(this, args as any);
    } as any;
  }

  next();
}
