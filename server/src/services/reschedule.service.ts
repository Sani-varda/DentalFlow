import prisma from '../config/db';

interface RescheduleConstraints {
  preferredDays?: string[];      // e.g. ['Monday', 'Wednesday']
  preferredTimeRange?: { start: string; end: string }; // e.g. { start: '09:00', end: '14:00' }
  minLeadTimeHours?: number;     // minimum hours from now
  maxDaysOut?: number;           // how far to look ahead
}

interface RescheduleProposal {
  slot: Date;
  score: number;
  rationale: string;
}

/**
 * Generate AI-assisted reschedule proposals for an appointment.
 * Uses rule-based scoring: preference match, historical pattern, availability.
 */
export async function generateRescheduleProposals(
  appointment: any,
  constraints?: RescheduleConstraints
): Promise<RescheduleProposal[]> {
  const patient = appointment.patient;
  const prefs = patient.notificationPreferences || {};

  // Default constraints
  const minLead = constraints?.minLeadTimeHours || 24;
  const maxDays = constraints?.maxDaysOut || 14;
  const prefDays = constraints?.preferredDays || prefs.preferredDays || [];
  const prefTime = constraints?.preferredTimeRange || prefs.preferredTimeRange || { start: '09:00', end: '17:00' };

  // Get historical appointment times for pattern analysis
  const history = await prisma.appointment.findMany({
    where: {
      patientId: patient.id,
      status: 'COMPLETED',
    },
    select: { scheduledTime: true },
    orderBy: { scheduledTime: 'desc' },
    take: 20,
  });

  // Analyze historical preferences
  const dayFrequency: Record<number, number> = {};
  const hourFrequency: Record<number, number> = {};
  for (const h of history) {
    const day = h.scheduledTime.getDay();
    const hour = h.scheduledTime.getHours();
    dayFrequency[day] = (dayFrequency[day] || 0) + 1;
    hourFrequency[hour] = (hourFrequency[hour] || 0) + 1;
  }

  // Generate candidate slots (every 30 min within clinic hours for the next N days)
  const candidates: Date[] = [];
  const now = new Date();
  const startFrom = new Date(now.getTime() + minLead * 60 * 60 * 1000);

  for (let d = 0; d < maxDays; d++) {
    const date = new Date(startFrom);
    date.setDate(date.getDate() + d);

    const [startHour, startMin] = prefTime.start.split(':').map(Number);
    const [endHour, endMin] = prefTime.end.split(':').map(Number);

    for (let h = startHour; h <= endHour; h++) {
      for (const m of [0, 30]) {
        if (h === startHour && m < startMin) continue;
        if (h === endHour && m > endMin) continue;

        const slot = new Date(date);
        slot.setHours(h, m, 0, 0);

        // Skip weekends unless preferred
        const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][slot.getDay()];
        if (slot.getDay() === 0 || slot.getDay() === 6) {
          if (prefDays.length > 0 && !prefDays.includes(dayName)) continue;
        }

        if (slot > startFrom) {
          candidates.push(slot);
        }
      }
    }
  }

  // Score each candidate
  const scored = candidates.map((slot) => {
    let score = 50; // base score
    const dayNum = slot.getDay();
    const hourNum = slot.getHours();
    const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayNum];

    // Preference match bonus
    if (prefDays.length > 0 && prefDays.includes(dayName)) score += 20;

    // Historical pattern bonus
    if (dayFrequency[dayNum]) score += Math.min(dayFrequency[dayNum] * 5, 15);
    if (hourFrequency[hourNum]) score += Math.min(hourFrequency[hourNum] * 5, 15);

    // Sooner is slightly better
    const daysOut = (slot.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    score -= daysOut * 0.5;

    // Cap at 100
    score = Math.min(Math.max(score, 0), 100);

    // Build rationale
    const reasons: string[] = [];
    if (prefDays.includes(dayName)) reasons.push(`matches preferred day (${dayName})`);
    if (dayFrequency[dayNum]) reasons.push(`patient has attended on ${dayName}s before`);
    if (hourFrequency[hourNum]) reasons.push(`${hourNum}:00 is a historically preferred time`);
    reasons.push(`${daysOut.toFixed(0)} days from now`);

    return {
      slot,
      score: Math.round(score),
      rationale: reasons.join('; '),
    };
  });

  // Return top 3
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}
