# Google Review Collection — Setup Guide

## Overview

DentalFlow automatically sends a review request to every patient **30 minutes after their appointment is marked COMPLETED**.

The flow:
1. Appointment → COMPLETED
2. BullMQ enqueues `review-requests` job with 30-min delay
3. Patient receives SMS/WhatsApp/Email: *"How was your visit? Tap to rate us"*
4. Patient opens link → sees star rating UI
5. **4–5 stars** → redirect to Google Business review page
6. **1–3 stars** → internal feedback form (clinic sees it, Google doesn't)

---

## Environment Variables

```env
REVIEW_BASE_URL=https://your-domain.com
GOOGLE_PLACE_ID_FALLBACK=ChIJ...
```

## Getting Your Google Place ID

1. Go to [Google Maps](https://maps.google.com)
2. Search for your clinic
3. Click the clinic → **Share** → copy the link
4. Extract the `place_id` param OR use [Place ID Finder](https://developers.google.com/maps/documentation/javascript/examples/places-placeid-finder)
5. The URL for reviews will be:
   `https://search.google.com/local/writereview?placeid=YOUR_PLACE_ID`

## Per-Clinic Google Place ID (Recommended)

For multi-clinic setups, add `googlePlaceId` to the `Clinic` model in Prisma:

```prisma
model Clinic {
  // ... existing fields ...
  googlePlaceId String? @map("google_place_id")
}
```

Then run: `npx prisma migrate dev --name add_clinic_google_place_id`

---

## API Endpoints

### Public (no auth — token-gated)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/reviews/r/:token` | Load rating page data |
| POST | `/api/v1/reviews/r/:token/rate` | Submit star rating |
| POST | `/api/v1/reviews/r/:token/feedback` | Submit internal feedback (1-3★) |

### Protected (JWT required)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/reviews/analytics?days=30` | Review dashboard analytics |
| GET | `/api/v1/reviews?page=1&perPage=20&outcome=RATED_POSITIVE` | Paginated review list |

---

## Frontend Integration

The review landing page (`/review/:token`) should be a standalone React page:

```tsx
// src/pages/ReviewPage.tsx
// 1. GET /api/v1/reviews/r/:token → get clinic name, patient name
// 2. Show 5-star rating UI
// 3. POST /api/v1/reviews/r/:token/rate with { rating }
// 4. If action === 'GOOGLE_REDIRECT' → window.location.href = googleUrl
// 5. If action === 'SHOW_FORM' → show textarea + category dropdown
// 6. POST /api/v1/reviews/r/:token/feedback with { comment, category }
// 7. Show thank you screen
```

---

## Admin Dashboard Data

The `/api/v1/reviews/analytics` endpoint returns:

```json
{
  "summary": {
    "total": 142,
    "sent": 138,
    "openRate": 71,
    "responseRate": 58,
    "avgRating": 4.3,
    "positiveCount": 89,
    "negativeCount": 11,
    "googleRedirects": 89
  },
  "starDistribution": [
    { "star": 1, "count": 2 },
    { "star": 2, "count": 3 },
    { "star": 3, "count": 6 },
    { "star": 4, "count": 28 },
    { "star": 5, "count": 61 }
  ],
  "recentRatings": [...],
  "internalFeedback": [...]
}
```
