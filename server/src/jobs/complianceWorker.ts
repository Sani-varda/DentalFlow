import prisma from '../config/db';

/**
 * Compliance Worker Job
 * Runs periodically (e.g., nightly) to enforce data retention policies.
 */
export async function runComplianceJob() {
  console.log('[ComplianceWorker] Starting automated data retention processing...');

  try {
    const today = new Date();
    
    // 1. Audit Logs: Delete logs older than 7 years
    const sevenYearsAgo = new Date();
    sevenYearsAgo.setFullYear(today.getFullYear() - 7);
    
    const deletedLogs = await prisma.auditLog.deleteMany({
      where: {
        timestamp: {
          lt: sevenYearsAgo
        }
      }
    });
    console.log(`[ComplianceWorker] Deleted ${deletedLogs.count} old audit logs (older than 7 years).`);

    // 2. Inactive Patients: Anonymize or Flag patients with no appointments in the last 7 years
    // This is a stub for the anonymization logic.
    // In a real system, we'd query patients where their last appointment was > 7 years ago
    // or who have no appointments and their created date is > 7 years.
    
    const inactivePatients = await prisma.patient.findMany({
      where: {
        appointments: {
          none: {
            scheduledTime: {
              gte: sevenYearsAgo
            }
          }
        },
        createdAt: {
          lt: sevenYearsAgo
        }
      },
      select: { id: true, name: true }
    });

    console.log(`[ComplianceWorker] Found ${inactivePatients.length} inactive patients eligible for anonymization.`);
    
    // Stub anonymization action:
    for (const patient of inactivePatients) {
      // In reality: scrub PII fields (name, email, phone) or soft delete
      // e.g., await prisma.patient.update({ where: { id: patient.id }, data: { name: 'ANONYMIZED', email: null, phone: null } });
      console.log(`[ComplianceWorker] Anonymizing patient ID: ${patient.id}`);
    }

    console.log('[ComplianceWorker] Completed data retention processing successfully.');
  } catch (err: any) {
    console.error('[ComplianceWorker] Job failed:', err.message);
  }
}

// If run directly for testing:
if (require.main === module) {
  runComplianceJob().then(() => process.exit(0));
}
