# Billing Schema Patch

Add the following to `server/prisma/schema.prisma` — append after the `Document` model and before the closing enums section.

## 1. Add relation to Clinic model

```prisma
model Clinic {
  // ... existing fields ...
  subscription     Subscription?   // ADD THIS LINE
}
```

## 2. Add new models

```prisma
model Subscription {
  id                   String             @id @default(uuid())
  clinicId             String             @unique @map("clinic_id")
  stripeCustomerId     String             @unique @map("stripe_customer_id")
  stripeSubscriptionId String?            @unique @map("stripe_subscription_id")
  stripePriceId        String?            @map("stripe_price_id")
  plan                 SubscriptionPlan   @default(TRIAL)
  status               SubscriptionStatus @default(TRIALING)
  trialEndsAt          DateTime?          @map("trial_ends_at")
  currentPeriodStart   DateTime?          @map("current_period_start")
  currentPeriodEnd     DateTime?          @map("current_period_end")
  cancelAtPeriodEnd    Boolean            @default(false) @map("cancel_at_period_end")
  createdAt            DateTime           @default(now()) @map("created_at")
  updatedAt            DateTime           @updatedAt @map("updated_at")
  clinic               Clinic             @relation(fields: [clinicId], references: [id])
  billingEvents        BillingEvent[]

  @@index([clinicId])
  @@index([status])
  @@map("subscriptions")
}

model BillingEvent {
  id               String       @id @default(uuid())
  subscriptionId   String       @map("subscription_id")
  stripeEventId    String       @unique @map("stripe_event_id")
  eventType        String       @map("event_type")
  amountPaid       Int?         @map("amount_paid")
  currency         String?
  invoiceUrl       String?      @map("invoice_url")
  payload          Json
  processedAt      DateTime     @default(now()) @map("processed_at")
  subscription     Subscription @relation(fields: [subscriptionId], references: [id])

  @@index([subscriptionId])
  @@map("billing_events")
}
```

## 3. Add new enums

```prisma
enum SubscriptionPlan {
  TRIAL
  STARTER
  GROWTH
  ENTERPRISE
}

enum SubscriptionStatus {
  TRIALING
  ACTIVE
  PAST_DUE
  CANCELED
  UNPAID
  PAUSED
}
```

## 4. Run migration

```bash
npx prisma migrate dev --name add_billing_models
npx prisma generate
```
