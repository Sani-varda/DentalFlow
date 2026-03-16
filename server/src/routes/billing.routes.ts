import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  createCheckoutSession,
  createPortalSession,
  getSubscriptionStatus,
  PLAN_LIMITS,
} from '../services/billing.service';
import { SubscriptionPlan } from '@prisma/client';

const router = Router();

const getClinicId = (req: Request): string => {
  const id = (req as any).user?.clinicId;
  if (!id) throw new Error('No clinicId on authenticated request');
  return id;
};

// ─── GET /api/v1/billing/status ───────────────────────────────────────────────
router.get('/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clinicId = getClinicId(req);
    const status   = await getSubscriptionStatus(clinicId);

    if (!status) {
      return res.status(404).json({ error: 'No subscription found. Please start your trial.' });
    }

    return res.json({ data: status });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/v1/billing/plans ────────────────────────────────────────────────
router.get('/plans', (_req: Request, res: Response) => {
  const plans = Object.entries(PLAN_LIMITS)
    .filter(([key]) => key !== 'TRIAL')
    .map(([plan, limits]) => ({ plan, limits }));

  return res.json({ data: plans });
});

// ─── POST /api/v1/billing/checkout ───────────────────────────────────────────
const checkoutSchema = z.object({
  plan:       z.enum(['STARTER', 'GROWTH', 'ENTERPRISE']),
  successUrl: z.string().url(),
  cancelUrl:  z.string().url(),
});

router.post('/checkout', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body     = checkoutSchema.parse(req.body);
    const clinicId = getClinicId(req);
    const user     = (req as any).user;

    const session = await createCheckoutSession({
      clinicId,
      clinicName: user?.clinicName ?? 'Dental Clinic',
      adminEmail: user?.email,
      plan:       body.plan as Exclude<SubscriptionPlan, 'TRIAL'>,
      successUrl: body.successUrl,
      cancelUrl:  body.cancelUrl,
    });

    return res.json({ data: { checkoutUrl: session.url, sessionId: session.id } });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/v1/billing/portal ─────────────────────────────────────────────
const portalSchema = z.object({
  returnUrl: z.string().url(),
});

router.post('/portal', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { returnUrl } = portalSchema.parse(req.body);
    const clinicId      = getClinicId(req);

    const session = await createPortalSession(clinicId, returnUrl);
    return res.json({ data: { portalUrl: session.url } });
  } catch (err) {
    next(err);
  }
});

export default router;
