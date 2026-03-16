import Stripe from 'stripe';
import { PrismaClient, SubscriptionPlan, SubscriptionStatus } from '@prisma/client';
import { env } from '../config/env';

const prisma = new PrismaClient();

export const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-12-18.acacia',
  typescript: true,
});

// ─── Plan → Stripe Price ID mapping ───────────────────────────────────────────
export const PLAN_PRICE_MAP: Record<Exclude<SubscriptionPlan, 'TRIAL'>, string> = {
  STARTER:    env.STRIPE_PRICE_STARTER,
  GROWTH:     env.STRIPE_PRICE_GROWTH,
  ENTERPRISE: env.STRIPE_PRICE_ENTERPRISE,
};

// ─── Plan feature limits ───────────────────────────────────────────────────────
export const PLAN_LIMITS = {
  TRIAL:      { patients: 50,       reminders: 100,      aiScoring: false, campaigns: false, multiLocation: false },
  STARTER:    { patients: 500,      reminders: 1000,     aiScoring: false, campaigns: true,  multiLocation: false },
  GROWTH:     { patients: 5000,     reminders: 10000,    aiScoring: true,  campaigns: true,  multiLocation: false },
  ENTERPRISE: { patients: Infinity, reminders: Infinity, aiScoring: true,  campaigns: true,  multiLocation: true  },
};

// ─── Create or retrieve Stripe customer for a clinic ──────────────────────────
export async function getOrCreateStripeCustomer(
  clinicId:   string,
  clinicName: string,
  email:      string
) {
  const existing = await prisma.subscription.findUnique({ where: { clinicId } });
  if (existing?.stripeCustomerId) return existing.stripeCustomerId;

  const customer = await stripe.customers.create({
    email,
    name: clinicName,
    metadata: { clinicId },
  });

  await prisma.subscription.upsert({
    where:  { clinicId },
    create: {
      clinicId,
      stripeCustomerId: customer.id,
      plan:             'TRIAL',
      status:           'TRIALING',
      trialEndsAt:      new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
    update: { stripeCustomerId: customer.id },
  });

  return customer.id;
}

// ─── Create Stripe Checkout Session ───────────────────────────────────────────
export async function createCheckoutSession({
  clinicId,
  clinicName,
  adminEmail,
  plan,
  successUrl,
  cancelUrl,
}: {
  clinicId:   string;
  clinicName: string;
  adminEmail: string;
  plan:       Exclude<SubscriptionPlan, 'TRIAL'>;
  successUrl: string;
  cancelUrl:  string;
}) {
  const customerId = await getOrCreateStripeCustomer(clinicId, clinicName, adminEmail);
  const priceId    = PLAN_PRICE_MAP[plan];

  const session = await stripe.checkout.sessions.create({
    customer:    customerId,
    mode:        'subscription',
    line_items:  [{ price: priceId, quantity: 1 }],
    success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:  cancelUrl,
    subscription_data: {
      trial_period_days: 14,
      metadata: { clinicId, plan },
    },
    metadata:              { clinicId, plan },
    allow_promotion_codes: true,
  });

  return session;
}

// ─── Create Stripe Customer Portal Session ────────────────────────────────────
export async function createPortalSession(clinicId: string, returnUrl: string) {
  const subscription = await prisma.subscription.findUnique({ where: { clinicId } });
  if (!subscription?.stripeCustomerId) {
    throw new Error('No billing account found for this clinic.');
  }

  const session = await stripe.billingPortal.sessions.create({
    customer:   subscription.stripeCustomerId,
    return_url: returnUrl,
  });

  return session;
}

// ─── Get subscription status for a clinic ─────────────────────────────────────
export async function getSubscriptionStatus(clinicId: string) {
  const sub = await prisma.subscription.findUnique({
    where:  { clinicId },
    select: {
      plan:              true,
      status:            true,
      trialEndsAt:       true,
      currentPeriodEnd:  true,
      cancelAtPeriodEnd: true,
    },
  });

  if (!sub) return null;

  const limits        = PLAN_LIMITS[sub.plan];
  const isTrialActive =
    sub.status === 'TRIALING' &&
    sub.trialEndsAt != null &&
    sub.trialEndsAt > new Date();

  return { ...sub, limits, isTrialActive };
}

// ─── Sync Stripe subscription → DB (called from webhook) ──────────────────────
export async function syncStripeSubscription(stripeSubscription: Stripe.Subscription) {
  const clinicId = stripeSubscription.metadata?.clinicId;
  const plan     = (stripeSubscription.metadata?.plan as SubscriptionPlan) ?? 'STARTER';

  if (!clinicId) {
    console.warn('[Billing] syncStripeSubscription: no clinicId in metadata', stripeSubscription.id);
    return;
  }

  const statusMap: Record<Stripe.Subscription.Status, SubscriptionStatus> = {
    trialing:           'TRIALING',
    active:             'ACTIVE',
    past_due:           'PAST_DUE',
    canceled:           'CANCELED',
    unpaid:             'UNPAID',
    paused:             'PAUSED',
    incomplete:         'PAST_DUE',
    incomplete_expired: 'CANCELED',
  };

  await prisma.subscription.update({
    where: { clinicId },
    data: {
      stripeSubscriptionId: stripeSubscription.id,
      stripePriceId:        stripeSubscription.items.data[0]?.price.id ?? null,
      plan,
      status:               statusMap[stripeSubscription.status] ?? 'PAST_DUE',
      currentPeriodStart:   new Date(stripeSubscription.current_period_start * 1000),
      currentPeriodEnd:     new Date(stripeSubscription.current_period_end   * 1000),
      cancelAtPeriodEnd:    stripeSubscription.cancel_at_period_end,
      trialEndsAt:          stripeSubscription.trial_end
                              ? new Date(stripeSubscription.trial_end * 1000)
                              : null,
    },
  });
}
