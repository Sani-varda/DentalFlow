import { realtimeService } from '../realtime.service';
import { Response } from 'express';
import { mockDeep } from 'jest-mock-extended';
import { env } from '../../config/env';

describe('RealtimeService - Connection Limits', () => {
  const clinicId = 'clinic-1';
  const userId = 'user-1';

  beforeEach(() => {
    // Clear clients before each test
    (realtimeService as any).clients = [];
  });

  it('should allow connections up to the maximum limit', () => {
    const limit = env.MAX_SSE_CONNECTIONS_PER_USER;
    
    for (let i = 0; i < limit; i++) {
      const res = mockDeep<Response>();
      const clientId = realtimeService.addClient(clinicId, userId, res);
      expect(clientId).not.toBeNull();
    }

    // Next one should fail
    const resFail = mockDeep<Response>();
    const clientIdFail = realtimeService.addClient(clinicId, userId, resFail);
    expect(clientIdFail).toBeNull();
  });

  it('should allow new connections after a client is removed', () => {
    const limit = env.MAX_SSE_CONNECTIONS_PER_USER;
    const clientIds: string[] = [];

    for (let i = 0; i < limit; i++) {
      const res = mockDeep<Response>();
      const clientId = realtimeService.addClient(clinicId, userId, res);
      if (clientId) clientIds.push(clientId);
    }

    // Remove one
    realtimeService.removeClient(clientIds[0]);

    // Should now allow one more
    const resNew = mockDeep<Response>();
    const clientIdNew = realtimeService.addClient(clinicId, userId, resNew);
    expect(clientIdNew).not.toBeNull();
  });

  it('should track connection limits independently per user', () => {
    const limit = env.MAX_SSE_CONNECTIONS_PER_USER;
    
    // Fill up user-1
    for (let i = 0; i < limit; i++) {
      realtimeService.addClient(clinicId, 'user-1', mockDeep<Response>());
    }

    // user-2 should still be able to connect
    const resUser2 = mockDeep<Response>();
    const clientIdUser2 = realtimeService.addClient(clinicId, 'user-2', resUser2);
    expect(clientIdUser2).not.toBeNull();
  });

  describe('Privacy Masking', () => {
    it('should mask "John Doe" as "J. Doe"', () => {
      const res = mockDeep<Response>();
      realtimeService.addClient(clinicId, userId, res);
      
      const payload = { patientId: 'p1', patientName: 'John Doe', status: 'SENT' };
      realtimeService.sendToClinic(clinicId, 'test_event', payload);

      // Verify what was written to the response
      // Filter for data calls that aren't the connection message
      const call = res.write.mock.calls.find(c => c[0].includes('data:') && !c[0].includes('clientId'));
      if (!call) {
        console.log('DEBUG: res.write calls:', JSON.stringify(res.write.mock.calls));
      }
      expect(call).toBeDefined();
      expect(call![0]).toContain('"patientName":"J. Doe"');
      expect(call![0]).not.toContain('"John Doe"');
    });

    it('should mask "John" as "J..." when no last name provided', () => {
      const res = mockDeep<Response>();
      realtimeService.addClient(clinicId, userId, res);
      
      const payload = { patientId: 'p2', patientName: 'John', status: 'SENT' };
      realtimeService.sendToClinic(clinicId, 'test_event', payload);

      const call = res.write.mock.calls.find(c => c[0].includes('data:') && !c[0].includes('clientId'));
      expect(call).toBeDefined();
      expect(call![0]).toContain('"patientName":"J..."');
    });
  });
});
