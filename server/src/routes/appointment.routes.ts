// NOTE: This file patches the appointment COMPLETED status transition
// to enqueue a review request job 30 minutes post-completion.
//
// IMPORTANT: Merge this carefully with your existing appointment.routes.ts.
// The key addition is the import of enqueueReviewRequest and the call
// inside the PATCH /:id/status handler when status === 'COMPLETED'.
//
// ─── Add these lines to the TOP of your existing appointment.routes.ts ────────
//
// import { enqueueReviewRequest } from '../jobs/reviewWorker';
//
// ─── Then inside your PATCH /:id/status route, after updating the appointment:
//
// if (newStatus === 'COMPLETED') {
//   await enqueueReviewRequest(appointmentId);
// }
//
// ─── Full patch shown below (copy the import + the enqueue call) ──────────────

// PATCH INSTRUCTIONS FOR appointment.routes.ts:
// 1. Add import at top:
//    import { enqueueReviewRequest } from '../jobs/reviewWorker';
//
// 2. In the route that handles status update to COMPLETED, add:
//    if (body.status === 'COMPLETED') {
//      await enqueueReviewRequest(appointment.id);
//    }
//
// This ensures every appointment marked COMPLETED triggers a 30-min delayed
// review request to the patient via their preferred channel (SMS/WhatsApp/Email).

export {}; // placeholder — see instructions above
