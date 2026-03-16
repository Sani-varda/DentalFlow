import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { PLAN_LIMITS } from '../services/billing.service';

const prisma = new PrismaClient();

type PlanFeature = keyof typeof PLAN_LIMITS['STARTER'];

/**
 * Gate a route behind a specific plan feature.
 *
 * Usage:
 *   router.get('/ai-score', requireFeature('aiScoring'), handler)
 *   router.get('/cross-location', requireFeature('multiLocation'), handler)
 */
export function requireFeature(feature: PlanFeature) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const clinicId = (req as any).user?.clinicId;
      if (!clinicId) return res.status(401).json({ error: 'Unauthorized' });

      const sub = await prisma.subscription.findUnique({ where: { clinicId } });

      if (!sub) {
        return res.status(402).json({
          error:      'No active subscription. Please start your free trial.',
          upgradeUrl: '/billing/plans',
        });
      }

      // TRIALING — full access within trial window
      if (sub.status === 'TRIALING' && sub.trialEndsAt && sub.trialEndsAt > new Date()) {
        return next();
      }

      // Inactive subscription
      if (['CANCELED', 'PAST_DUE', 'UNPAID'].includes(sub.status)) {
        return res.status(402).json({
          error:      'Your subscription is inactive. Please update your billing.',
          upgradeUrl: '/billing/portal',
        });
      }

      // Feature access check
      const limits = PLAN_LIMITS[sub.plan];
      if (!limits[feature]) {
        return res.status(403).json({
          error:       'This feature requires a higher plan.',
          feature,
          currentPlan: sub.plan,
          upgradeUrl:  '/billing/plans',
        });
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Global middleware — blocks all protected routes if subscription is inactive.
 * Add to the global `protect` stack in index.ts.
 */
export async function requireActiveSubscription(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const clinicId = (req as any).user?.clinicId;
    if (!clinicId) return next(); // SUPERADMIN bypass

    const sub = await prisma.subscription.findUnique({ where: { clinicId } });
    if (!sub) return next(); // First-time user — let them reach billing

    const trialActive = sub.status === 'TRIALING' && sub.trialEndsAt && sub.trialEndsAt > new Date();
    const subActive   = sub.status === 'ACTIVE';

    if (!trialActive && !subActive) {
      return res.status(402).json({
        error:      'Your subscription has expired. Please renew to continue.',
        upgradeUrl: '/billing/plans',
      });
    }

    next();
  } catch (err) {
    next(err);
  }
}
