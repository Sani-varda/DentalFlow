import prisma from '../config/db';
import { logger } from '../lib/logger';
import crypto from 'crypto';

const log = logger.child({ component: 'complianceWorker' });

/**
 * Compliance Worker Job
 * Runs periodically (e.g., nightly) to enforce data retention policies.
 *  1. Audit logs older than 7 years are deleted.
 *  2. Patients with no appointments in 7+ years are anonymised:
 *     - name -> hash
 *     - email/phone -> null
 *     - consent set to false to suppress messaging
 */
export async function runComplianceJob(): Promise<void> {
  log.info('starting data retention processing');

  try {
    const today = new Date();
    const sevenYearsAgo = new Date();
    sevenYearsAgo.setFullYear(today.getFullYear() - 7);

    const deletedLogs = await prisma.auditLog.deleteMany({
      where: { timestamp: { lt: sevenYearsAgo } },
    });
    log.info({ count: deletedLogs.count }, 'deleted old audit logs');

    const inactivePatients = await prisma.patient.findMany({
      where: {
        appointments: { none: { scheduledTime: { gte: sevenYearsAgo } } },
        createdAt: { lt: sevenYearsAgo },
        // Skip already-anonymised patients (idempotency)
        consentStatus: true,
      },
      select: { id: true },
    });
    log.info({ count: inactivePatients.length }, 'anonymising inactive patients');

    let anonymised = 0;
    for (const patient of inactivePatients) {
      const pseudonym = `ANON-${crypto.createHash('sha256').update(patient.id).digest('hex').slice(0, 12)}`;
      try {
        await prisma.patient.update({
          where: { id: patient.id },
          data: {
            name: pseudonym,
            email: null,
            phone: null,
            consentStatus: false,
            notificationPreferences: {},
          },
        });
        anonymised++;
      } catch (err) {
        log.warn({ err: (err as Error).message, patientId: patient.id }, 'patient anonymisation failed');
      }
    }
    log.info({ anonymised, target: inactivePatients.length }, 'compliance run complete');
  } catch (err) {
    log.error({ err: (err as Error).message }, 'compliance job failed');
  }
}

if (require.main === module) {
  runComplianceJob().then(() => process.exit(0));
}
