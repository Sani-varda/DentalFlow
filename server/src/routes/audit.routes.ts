import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../config/db';
import { requireRole } from '../middleware/auth';

const router = Router();

const listSchema = z.object({
  userId: z.string().min(1).max(64).optional(),
  action: z.string().min(1).max(120).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
});

const exportSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().positive().max(50_000).default(10_000),
});

function escapeCsv(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Returns userIds belonging to the requester's clinic so audit-log queries
 * can be scoped to one tenant. SUPERADMIN may opt into a global view.
 */
async function getScopedUserIds(req: Request): Promise<string[] | null> {
  if (req.user?.role === 'SUPERADMIN') return null; // null = no scope (all)
  if (!req.user?.clinicId) return [];
  const users = await prisma.user.findMany({
    where: { clinicId: req.user.clinicId },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

router.get(
  '/',
  requireRole('ADMIN', 'SUPERADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = listSchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten().fieldErrors });
        return;
      }
      const { userId, action, from, to, page, limit } = parsed.data;

      const scopedUserIds = await getScopedUserIds(req);
      const where: {
        userId?: string | { in: string[] };
        action?: { contains: string };
        timestamp?: { gte?: Date; lte?: Date };
      } = {};
      if (scopedUserIds) {
        where.userId = userId
          ? scopedUserIds.includes(userId)
            ? userId
            : { in: ['__none__'] } // forced empty result
          : { in: scopedUserIds };
      } else if (userId) {
        where.userId = userId;
      }
      if (action) where.action = { contains: action };
      if (from || to) {
        where.timestamp = {};
        if (from) where.timestamp.gte = new Date(from);
        if (to) where.timestamp.lte = new Date(to);
      }

      const [logs, total] = await Promise.all([
        prisma.auditLog.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { timestamp: 'desc' },
        }),
        prisma.auditLog.count({ where }),
      ]);

      res.json({ data: logs, total, page, limit });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/export',
  requireRole('ADMIN', 'SUPERADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = exportSchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten().fieldErrors });
        return;
      }
      const { from, to, limit } = parsed.data;

      const scopedUserIds = await getScopedUserIds(req);
      const where: {
        userId?: { in: string[] };
        timestamp?: { gte?: Date; lte?: Date };
      } = {};
      if (scopedUserIds) where.userId = { in: scopedUserIds };
      if (from || to) {
        where.timestamp = {};
        if (from) where.timestamp.gte = new Date(from);
        if (to) where.timestamp.lte = new Date(to);
      }

      res.header('Content-Type', 'text/csv; charset=utf-8');
      res.attachment('audit_export.csv');
      res.write('id,userId,action,resource,resourceId,timestamp\n');

      const PAGE_SIZE = 1000;
      let written = 0;
      let cursor: string | undefined;

      while (written < limit) {
        const batch = await prisma.auditLog.findMany({
          where,
          orderBy: { id: 'asc' },
          take: Math.min(PAGE_SIZE, limit - written),
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        });
        if (batch.length === 0) break;
        for (const row of batch) {
          res.write(
            [
              row.id,
              row.userId ?? '',
              row.action ?? '',
              row.resource ?? '',
              row.resourceId ?? '',
              row.timestamp.toISOString(),
            ]
              .map((v) => escapeCsv(String(v)))
              .join(',') + '\n',
          );
        }
        cursor = batch[batch.length - 1].id;
        written += batch.length;
      }
      res.end();
    } catch (err) {
      next(err);
    }
  },
);

export default router;
