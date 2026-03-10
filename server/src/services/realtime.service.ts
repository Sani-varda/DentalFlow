import { Response } from 'express';
import { env } from '../config/env';

interface SSEClient {
  id: string;
  userId: string;
  clinicId: string;
  res: Response;
}

class RealtimeService {
  private clients: SSEClient[] = [];

  /**
   * Adds a new client to the SSE registry
   */
  addClient(clinicId: string, userId: string, res: Response): string | null {
    // Check per-user connection limit
    const userConnectionCount = this.clients.filter(c => c.userId === userId).length;
    if (userConnectionCount >= env.MAX_SSE_CONNECTIONS_PER_USER) {
      console.warn(`[Realtime] Max connections (${env.MAX_SSE_CONNECTIONS_PER_USER}) reached for user ${userId}`);
      return null;
    }

    const clientId = Math.random().toString(36).substring(7);
    const newClient: SSEClient = { id: clientId, userId, clinicId, res };
    
    this.clients.push(newClient);

    // Initial connection heartbeat/meta
    this.send(newClient, 'connected', { clientId });

    return clientId;
  }

  /**
   * Removes a client by ID (on disconnect)
   */
  removeClient(clientId: string) {
    this.clients = this.clients.filter(c => c.id !== clientId);
  }

  /**
   * Sends an event to all clients connected to a specific clinic
   */
  sendToClinic(clinicId: string, eventType: string, data: any) {
    const targetedClients = this.clients.filter(c => c.clinicId === clinicId);
    
    // Privacy Scrub: Mask patient names in real-time broadcasts
    const scrubbedData = { ...data };
    if (scrubbedData.patientName) {
      const parts = scrubbedData.patientName.split(' ');
      if (parts.length > 1) {
        // "John Doe" -> "J. Doe"
        scrubbedData.patientName = `${parts[0][0]}. ${parts.slice(1).join(' ')}`;
      } else {
        // "John" -> "J..."
        scrubbedData.patientName = `${scrubbedData.patientName[0]}...`;
      }
    }

    targetedClients.forEach(client => {
      this.send(client, eventType, scrubbedData);
    });
  }

  /**
   * Format and send raw SSE message
   */
  private send(client: SSEClient, event: string, data: any) {
    client.res.write(`event: ${event}\n`);
    client.res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  /**
   * Heartbeat to keep connections alive
   */
  initHeartbeat() {
    setInterval(() => {
      this.clients.forEach(client => {
        client.res.write(': heartbeat\n\n');
      });
    }, 30000);
  }
}

export const realtimeService = new RealtimeService();
realtimeService.initHeartbeat();
