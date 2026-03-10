import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { realtimeService } from '../services/realtime.service';

const router = Router();

/**
 * GET /api/v1/realtime
 * Establishes an SSE connection for the authenticated user/clinic
 */
router.get('/', authMiddleware, (req: Request, res: Response) => {
  const clinicId = req.user?.clinicId;
  const userId = req.user?.userId;

  if (!clinicId || !userId) {
    res.status(401).json({ error: 'Auth context missing clinicId or userId' });
    return;
  }

  // Register client (with per-user limit check)
  const clientId = realtimeService.addClient(clinicId, userId, res);

  if (!clientId) {
    res.status(429).json({ error: 'Too many active connections for this user' });
    return;
  }

  // Set SSE Headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*' // Adjust in production
  });

  // Handle disconnect
  req.on('close', () => {
    realtimeService.removeClient(clientId);
  });
});

export default router;
