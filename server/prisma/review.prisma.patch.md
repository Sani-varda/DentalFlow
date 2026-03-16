# Review Collection Schema Patch

Append these models and enums to `server/prisma/schema.prisma` after the `Document` model.

Also add the following relation to the `Clinic` model:
```prisma
reviewRequests  ReviewRequest[]
```

And add to the `Appointment` model:
```prisma
reviewRequest   ReviewRequest?
```

---

## New Models

```prisma
model ReviewRequest {
  id             String              @id @default(uuid())
  clinicId       String              @map("clinic_id")
  appointmentId  String              @unique @map("appointment_id")
  patientId      String              @map("patient_id")
  token          String              @unique                    // secure URL token
  channel        Channel
  sentAt         DateTime?           @map("sent_at")
  openedAt       DateTime?           @map("opened_at")
  rating         Int?                                           // 1-5
  ratingAt       DateTime?           @map("rating_at")
  outcome        ReviewOutcome       @default(PENDING)
  externalId     String?             @map("external_id")        // Twilio SID etc.
  createdAt      DateTime            @default(now()) @map("created_at")
  updatedAt      DateTime            @updatedAt @map("updated_at")
  feedback       ReviewFeedback?
  clinic         Clinic              @relation(fields: [clinicId], references: [id])
  appointment    Appointment         @relation(fields: [appointmentId], references: [id])
  patient        Patient             @relation(fields: [patientId], references: [id])

  @@index([clinicId])
  @@index([patientId])
  @@index([token])
  @@index([outcome])
  @@map("review_requests")
}

model ReviewFeedback {
  id              String        @id @default(uuid())
  reviewRequestId String        @unique @map("review_request_id")
  rating          Int
  comment         String?       @db.Text
  category        String?                                       // "wait_time"|"staff"|"cleanliness"|"treatment"
  submittedAt     DateTime      @default(now()) @map("submitted_at")
  reviewRequest   ReviewRequest @relation(fields: [reviewRequestId], references: [id])

  @@map("review_feedbacks")
}
```

## New Enums

```prisma
enum ReviewOutcome {
  PENDING
  SENT
  OPENED
  RATED_POSITIVE   // 4-5 stars → redirected to Google
  RATED_NEGATIVE   // 1-3 stars → internal feedback form
  FEEDBACK_GIVEN
  EXPIRED
}
```

## Also add to Patient model
```prisma
reviewRequests  ReviewRequest[]
```

## Run migration
```bash
npx prisma migrate dev --name add_review_collection
npx prisma generate
```
