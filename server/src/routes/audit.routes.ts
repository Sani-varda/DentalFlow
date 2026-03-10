import { Router, Request, Response } from 'express';
import prisma from '../config/db';
import { requireRole } from '../middleware/auth';

const router = Router();

// GET /api/v1/audit
router.get('/', requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const { userId, action, from, to, page = '1', limit = '50' } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const where: any = {};
    if (userId) where.userId = String(userId);
    if (action) where.action = { contains: String(action) };
    if (from || to) {
      where.timestamp = {};
      if (from) where.timestamp.gte = new Date(String(from));
      if (to) where.timestamp.lte = new Date(String(to));
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { timestamp: 'desc' },
      }),
      prisma.auditLog.count({ where }),
    ]);

    res.json({ data: logs, total, page: Number(page), limit: Number(limit) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/audit/export
router.get('/export', requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const logs = await prisma.auditLog.findMany({
      orderBy: { timestamp: 'desc' },
      // In production, limit this to a reasonable date range to prevent OOM
      take: 10000 
    });

    const csvLines = ['id,userId,action,resource,resourceId,timestamp'];
    for (const log of logs) {
      csvLines.push(`${log.id},${log.userId || ''},${log.action || ''},${log.resource || ''},${log.resourceId || ''},${log.timestamp.toISOString()}`);
    }

    res.header('Content-Type', 'text/csv');
    res.attachment('audit_export.csv');
    return res.send(csvLines.join('\n'));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
