import { recalculateAllPatternScores } from '../noShow.service';
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

describe('NoShowService', () => {
  beforeEach(() => {
    mockReset(prismaMock);
  });

  it('should skip recalculation if patient has no appointments', async () => {
    prismaMock.patient.findMany.mockResolvedValue([{ id: 'p1' }] as any);
    prismaMock.appointment.count.mockResolvedValue(0);

    const updated = await recalculateAllPatternScores();
    expect(updated).toBe(0);
    expect(prismaMock.noShowPattern.upsert).not.toHaveBeenCalled();
  });

  it('should correctly calculate HIGH risk for a chronic no-shower', async () => {
    const patientId = 'p1';
    const now = new Date();
    
    // 3 no-shows yesterday
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    prismaMock.patient.findMany.mockResolvedValue([{ id: patientId }] as any);
    prismaMock.appointment.findMany.mockResolvedValue([
      { scheduledTime: yesterday },
      { scheduledTime: yesterday },
      { scheduledTime: yesterday },
    ] as any);
    prismaMock.appointment.count.mockResolvedValue(3);

    const updated = await recalculateAllPatternScores();
    
    expect(updated).toBe(1);
    expect(prismaMock.noShowPattern.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { patientId },
      create: expect.objectContaining({
        riskLevel: 'HIGH',
        chronicFlag: true
      })
    }));
  });

  it('should classify as LOW risk for few/old no-shows', async () => {
    const patientId = 'p2';
    const now = new Date();
    
    // 1 no-show 60 days ago
    const oldDate = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    
    prismaMock.patient.findMany.mockResolvedValue([{ id: patientId }] as any);
    prismaMock.appointment.findMany.mockResolvedValue([
      { scheduledTime: oldDate }
    ] as any);
    prismaMock.appointment.count.mockResolvedValue(10);

    const updated = await recalculateAllPatternScores();
    
    expect(updated).toBe(1);
    expect(prismaMock.noShowPattern.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        riskLevel: 'LOW',
        chronicFlag: false
      })
    }));
  });
});
