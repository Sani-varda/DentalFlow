/**
 * DMS (Dental Management Software) Adapter — Stub
 *
 * In production, this would connect to the clinic's DMS via
 * HL7/FHIR API, database connector, or REST API.
 */

export interface DmsPatient {
  externalId: string;
  name: string;
  phone?: string;
  email?: string;
}

export interface DmsAppointment {
  externalId: string;
  patientExternalId: string;
  scheduledTime: Date;
  clinician: string;
  procedure?: string;
}

export class DmsAdapter {
  private integrationId: string;

  constructor(integrationId: string) {
    this.integrationId = integrationId;
  }

  async fetchPatients(): Promise<DmsPatient[]> {
    // Stub: Return mock data
    console.log(`[DMS:${this.integrationId}] Fetching patients (stub)`);
    return [
      { externalId: 'DMS-P001', name: 'John Doe', phone: '+11234567890', email: 'john@example.com' },
      { externalId: 'DMS-P002', name: 'Jane Smith', phone: '+10987654321', email: 'jane@example.com' },
    ];
  }

  async fetchAppointments(fromDate: Date, toDate: Date): Promise<DmsAppointment[]> {
    // Stub: Return mock data
    console.log(`[DMS:${this.integrationId}] Fetching appointments ${fromDate.toISOString()} to ${toDate.toISOString()} (stub)`);
    return [
      {
        externalId: 'DMS-A001',
        patientExternalId: 'DMS-P001',
        scheduledTime: new Date(Date.now() + 48 * 60 * 60 * 1000),
        clinician: 'Dr. Williams',
        procedure: 'Cleaning',
      },
    ];
  }

  async syncAvailability(): Promise<{ slots: Date[] }> {
    // Stub: Return available slots
    console.log(`[DMS:${this.integrationId}] Fetching availability (stub)`);
    const slots: Date[] = [];
    const now = new Date();
    for (let d = 1; d <= 7; d++) {
      for (const h of [9, 10, 11, 13, 14, 15, 16]) {
        const slot = new Date(now);
        slot.setDate(slot.getDate() + d);
        slot.setHours(h, 0, 0, 0);
        slots.push(slot);
      }
    }
    return { slots };
  }
}
