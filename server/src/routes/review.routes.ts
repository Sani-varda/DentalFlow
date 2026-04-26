import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  resolveReviewToken,
  submitRating,
  submitFeedback,
  getReviewAnalytics,
  getReviewList,
} from '../services/review.service';

const router = Router();

// ─── PUBLIC: GET /api/v1/reviews/r/:token ─────────────────────────────────────
// Patient lands here from SMS/WhatsApp/email link → load rating page data
router.get('/r/:token', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token } = req.params;
    const request   = await resolveReviewToken(token);

    if (!request) {
      return res.status(410).json({ error: 'This review link has expired or is invalid.' });
    }

    return res.json({
      data: {
        clinicName:  request.clinic.name,
        patientName: request.patient.name.split(' ')[0],
        token,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── PUBLIC: POST /api/v1/reviews/r/:token/rate ───────────────────────────────
// Patient submits star rating → returns action (redirect or show form)
const rateSchema = z.object({
  rating: z.number().int().min(1).max(5),
});

router.post('/r/:token/rate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token }  = req.params;
    const { rating } = rateSchema.parse(req.body);
    const result     = await submitRating(token, rating);
    return res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

// ─── PUBLIC: POST /api/v1/reviews/r/:token/feedback ──────────────────────────
// Patient submits internal feedback form (1–3 star path)
const feedbackSchema = z.object({
  comment:  z.string().min(1).max(2000),
  category: z.enum(['wait_time', 'staff', 'cleanliness', 'treatment', 'other']).optional(),
});

router.post('/r/:token/feedback', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token }        = req.params;
    const { comment, category } = feedbackSchema.parse(req.body);
    await submitFeedback(token, comment, category ?? 'other');
    return res.json({ data: { success: true, message: 'Thank you for your feedback!' } });
  } catch (err) {
    next(err);
  }
});

// ─── PROTECTED: GET /api/v1/reviews/analytics ────────────────────────────────
// Admin dashboard: review summary, star distribution, recent reviews
router.get('/analytics', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clinicId = (req as any).user?.clinicId;
    const days     = parseInt(req.query.days as string) || 30;
    const data     = await getReviewAnalytics(clinicId, days);
    return res.json({ data });
  } catch (err) {
    next(err);
  }
});

// ─── PROTECTED: GET /api/v1/reviews ──────────────────────────────────────────
// Paginated list of all review requests for the clinic
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clinicId = (req as any).user?.clinicId;
    const page     = parseInt(req.query.page    as string) || 1;
    const perPage  = parseInt(req.query.perPage as string) || 20;
    const outcome  = req.query.outcome as string | undefined;
    const data     = await getReviewList(clinicId, page, perPage, outcome);
    return res.json(data);
  } catch (err) {
    next(err);
  }
});

export default router;
