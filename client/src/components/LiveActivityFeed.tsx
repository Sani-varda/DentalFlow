import React from 'react';
import { RealtimeEvent } from '../hooks/useRealtime';

interface Props {
  events: (RealtimeEvent & { type?: string })[];
  isConnected: boolean;
}

export const LiveActivityFeed: React.FC<Props> = ({ events, isConnected }) => {
  return (
    <div className="card glass realtime-feed">
      <div className="card-header">
        <h3>Live Automation Feed</h3>
        <span className={`status-pill ${isConnected ? 'online' : 'offline'}`}>
          {isConnected ? 'LIVE' : 'RECONNECTING...'}
        </span>
      </div>
      
      <div className="feed-container">
        {events.length === 0 ? (
          <p className="empty-msg">Waiting for activity...</p>
        ) : (
          events.map((event, i) => (
            <div key={`${event.messageId}-${i}`} className={`feed-item ${event.status?.toLowerCase()}`}>
              <div className="item-details">
                <p className="item-text">
                  <strong>{event.patientName || 'Message'}</strong>: {event.status || 'Processing'}
                </p>
                <span className="item-time">
                  {new Date(event.timestamp || Date.now()).toLocaleTimeString()}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
