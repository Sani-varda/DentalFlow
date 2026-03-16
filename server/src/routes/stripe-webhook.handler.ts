import { Request, Response } from 'express';
import Stripe from 'stripe';
import { PrismaClient } from '@prisma/client';
import { stripe, syncStripeSubscription } from '../services/billing.service';
import { env } from '../config/env';

const prisma = new PrismaClient();

export async function stripeWebhookHandler(req: Request, res: Response) {
  const sig = req.headers['stripe-signature'] as string;
  let event: Stripe.Event;

  // ── 1. Verify webhook signature ────────────────────────────────────────────
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err: any) {
    console.error('[Stripe Webhook] Signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook signature failed: ${err.message}` });
  }

  // ── 2. Idempotency check — skip if already processed ──────────────────────
  const alreadyProcessed = await prisma.billingEvent.findUnique({
    where: { stripeEventId: event.id },
  });
  if (alreadyProcessed) {
    console.log('[Stripe Webhook] Duplicate event, skipping:', event.id);
    return res.json({ received: true });
  }

  // ── 3. Route event types ───────────────────────────────────────────────────
  try {
    switch (event.type) {

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        await syncStripeSubscription(sub);
        await logBillingEvent(event, sub.metadata?.clinicId);
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        await syncStripeSubscription(sub);
        await logBillingEvent(event, sub.metadata?.clinicId);
        console.log(`[Billing] Subscription cancelled for clinic: ${sub.metadata?.clinicId}`);
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice  = event.data.object as Stripe.Invoice;
        const subId    = typeof invoice.subscription === 'string'
                         ? invoice.subscription
                         : invoice.subscription?.id;
        const stripeSub = subId ? await stripe.subscriptions.retrieve(subId) : null;
        if (stripeSub) await syncStripeSubscription(stripeSub);
        const clinicId = stripeSub?.metadata?.clinicId;
        await logBillingEvent(event, clinicId, {
          amountPaid: invoice.amount_paid,
          currency:   invoice.currency,
          invoiceUrl: invoice.hosted_invoice_url ?? undefined,
        });
        break;
      }

      case 'invoice.payment_failed': {
        const invoice   = event.data.object as Stripe.Invoice;
        const subId     = typeof invoice.subscription === 'string'
                          ? invoice.subscription
                          : invoice.subscription?.id;
        const stripeSub = subId ? await stripe.subscriptions.retrieve(subId) : null;
        if (stripeSub) await syncStripeSubscription(stripeSub);
        const clinicId  = stripeSub?.metadata?.clinicId;
        await logBillingEvent(event, clinicId);
        console.warn(`[Billing] Payment failed for clinic: ${clinicId}`);
        break;
      }

      case 'customer.subscription.trial_will_end': {
        const sub      = event.data.object as Stripe.Subscription;
        const clinicId = sub.metadata?.clinicId;
        await logBillingEvent(event, clinicId);
        // TODO: Enqueue BullMQ job → send "Your trial ends in 3 days" email
        console.log(`[Billing] Trial ending soon for clinic: ${clinicId}`);
        break;
      }

      default:
        console.log('[Stripe Webhook] Unhandled event type:', event.type);
    }

    return res.json({ received: true });

  } catch (err: any) {
    console.error('[Stripe Webhook] Processing error:', err.message, err);
    return res.json({ received: true, warning: 'Event logged but processing failed' });
  }
}

async function logBillingEvent(
  event:    Stripe.Event,
  clinicId?: string,
  extra?: { amountPaid?: number; currency?: string; invoiceUrl?: string }
) {
  if (!clinicId) return;

  const sub = await prisma.subscription.findUnique({ where: { clinicId } });
  if (!sub) return;

  await prisma.billingEvent.create({
    data: {
      subscriptionId: sub.id,
      stripeEventId:  event.id,
      eventType:      event.type,
      amountPaid:     extra?.amountPaid ?? null,
      currency:       extra?.currency   ?? null,
      invoiceUrl:     extra?.invoiceUrl ?? null,
      payload:        event.data.object as object,
    },
  });
}
