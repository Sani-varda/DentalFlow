import { generateRescheduleProposals } from '../reschedule.service';
import prisma from '../../config/db';
import { mockDeep, mockReset } from 'jest-mock-extended';

jest.mock('../../config/db', () => {
  const { mockDeep } = require('jest-mock-extended');
  return {
    __esModule: true,
    default: mockDeep(),
  };
});

const prismaMock = prisma as any;

describe('RescheduleService', () => {
  beforeEach(() => {
    mockReset(prismaMock);
  });

  const mockPatient = {
    id: 'p1',
    notificationPreferences: {
      preferredDays: ['Monday'],
      preferredTimeRange: { start: '09:00', end: '12:00' }
    }
  };

  const mockAppointment = {
    id: 'a1',
    patientId: 'p1',
    patient: mockPatient
  };

  it('should generate up to 3 proposals based on preferences', async () => {
    // Mock 2 completed appointments on a Monday at 10:00
    const mondayAppt = new Date();
    // Force to a Monday 10:00
    mondayAppt.setDate(mondayAppt.getDate() + (1 + 7 - mondayAppt.getDay()) % 7);
    mondayAppt.setHours(10, 0, 0, 0);

    prismaMock.appointment.findMany.mockResolvedValue([
      { scheduledTime: mondayAppt },
      { scheduledTime: mondayAppt }
    ] as any);

    const proposals = await generateRescheduleProposals(mockAppointment);

    expect(proposals.length).toBeGreaterThan(0);
    expect(proposals.length).toBeLessThanOrEqual(3);
    
    // Top proposal should likely match Monday preference or historical pattern
    const top = proposals[0];
    expect(top.score).toBeGreaterThan(50);
    expect(top.rationale).toContain('Monday');
  });

  it('should respect custom constraints passed to the generator', async () => {
    prismaMock.appointment.findMany.mockResolvedValue([] as any);

    const constraints = {
      preferredDays: ['Friday'],
      minLeadTimeHours: 48
    };

    const proposals = await generateRescheduleProposals(mockAppointment, constraints);
    
    // All proposals should be Fridays
    proposals.forEach(p => {
      const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][p.slot.getDay()];
      expect(dayName).toBe('Friday');
    });
  });
});
