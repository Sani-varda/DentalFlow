import { recalculateAllPatternScores, recalculatePatientScore } from '../noShow.service';

// Mock the HTTP wrapper so we don't hit a real scoring service.
jest.mock('../../lib/http', () => ({
  __esModule: true,
  request: jest.fn(),
}));

import { request } from '../../lib/http';

const mockRequest = request as jest.MockedFunction<typeof request>;

describe('noShow.service', () => {
  beforeEach(() => {
    mockRequest.mockReset();
  });

  describe('recalculateAllPatternScores', () => {
    it('returns updated_count when scoring service responds with success', async () => {
      mockRequest.mockResolvedValue({
        data: { status: 'success', updated_count: 42, message: 'ok' },
      } as any);

      const updated = await recalculateAllPatternScores();
      expect(updated).toBe(42);
      expect(mockRequest).toHaveBeenCalledTimes(1);
    });

    it('returns 0 when scoring service returns non-success status', async () => {
      mockRequest.mockResolvedValue({
        data: { status: 'error', detail: 'boom' },
      } as any);

      const updated = await recalculateAllPatternScores();
      expect(updated).toBe(0);
    });

    it('returns 0 when scoring service is unreachable (does not throw)', async () => {
      mockRequest.mockRejectedValue(new Error('ECONNREFUSED'));
      const updated = await recalculateAllPatternScores();
      expect(updated).toBe(0);
    });
  });

  describe('recalculatePatientScore', () => {
    it('returns the response body on success', async () => {
      mockRequest.mockResolvedValue({ data: { riskLevel: 'HIGH' } } as any);
      const result = await recalculatePatientScore('p1');
      expect(result).toEqual({ riskLevel: 'HIGH' });
    });

    it('returns null on error', async () => {
      mockRequest.mockRejectedValue(new Error('timeout'));
      const result = await recalculatePatientScore('p1');
      expect(result).toBeNull();
    });
  });
});
