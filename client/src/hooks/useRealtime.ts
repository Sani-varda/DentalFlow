import { useEffect, useState, useCallback } from 'react';

export interface RealtimeEvent {
  messageId: string;
  status: string;
  timestamp: string;
  patientName?: string;
  channel?: string;
  payload?: any;
}

export function useRealtime(token: string | null) {
  const [events, setEvents] = useState<RealtimeEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!token) return;

    let eventSource: EventSource | null = null;
    let reconnectionTimeout: any = null;
    let retryCount = 0;
    const maxRetries = 5;
    const baseDelay = 1000;

    const connect = () => {
      const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
      const sseUrl = `${baseUrl}/api/v1/realtime?token=${token}`;
      
      console.log(`📡 SSE Connecting (Attempt ${retryCount + 1})...`);
      eventSource = new EventSource(sseUrl);

      eventSource.onopen = () => {
        setIsConnected(true);
        retryCount = 0; // reset on success
        console.log('📡 SSE Connected');
      };

      eventSource.onerror = (err) => {
        console.error('📡 SSE Error:', err);
        setIsConnected(false);
        eventSource?.close();

        if (retryCount < maxRetries) {
          const delay = baseDelay * Math.pow(2, retryCount);
          console.log(`📡 SSE Reconnecting in ${delay}ms...`);
          reconnectionTimeout = setTimeout(() => {
            retryCount++;
            connect();
          }, delay);
        } else {
          console.error('📡 SSE Max retries reached');
        }
      };

      // Listen for dispatches
      eventSource.addEventListener('message_dispatched', (e: MessageEvent) => {
        const data = JSON.parse(e.data);
        setEvents(prev => [{ ...data, type: 'DISPATCHED' }, ...prev].slice(0, 50));
      });

      // Listen for status updates
      eventSource.addEventListener('message_status_updated', (e: MessageEvent) => {
        const data = JSON.parse(e.data);
        setEvents(prev => {
          const exists = prev.find(ev => ev.messageId === data.messageId);
          if (exists) {
             return prev.map(ev => ev.messageId === data.messageId ? { ...ev, ...data } : ev);
          }
          return [{ ...data, type: 'UPDATED' }, ...prev].slice(0, 50);
        });
      });
    };

    connect();

    return () => {
      if (eventSource) eventSource.close();
      if (reconnectionTimeout) clearTimeout(reconnectionTimeout);
      setIsConnected(false);
    };
  }, [token]);

  const getStatus = () => {
    if (isConnected) return 'connected';
    return 'connecting'; // Simplified for now, or add more state
  };

  const clearEvents = useCallback(() => setEvents([]), []);

  return { events, isConnected, status: getStatus(), clearEvents };
}
