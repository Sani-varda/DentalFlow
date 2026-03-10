import { useState, useEffect } from 'react';
import { api, getToken } from '../api';
import { useRealtime } from '../hooks/useRealtime';

interface Campaign {
  id: string;
  name: string;
  type: string;
  channel: 'SMS' | 'WHATSAPP' | 'EMAIL';
  content: string;
  status: 'DRAFT' | 'SENDING' | 'COMPLETED' | 'FAILED';
  totalTarget: number;
  sentCount: number;
  failedCount: number;
  createdAt: string;
}

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDraft, setShowDraft] = useState(false);
  
  // Real-time integration
  const token = getToken();
  const { events } = useRealtime(token);

  // New campaign form state
  const [formData, setFormData] = useState({
    name: '',
    type: 'Festive Offer',
    channel: 'WHATSAPP' as const,
    content: ''
  });

  const fetchCampaigns = async () => {
    try {
      const res = await api.getCampaigns();
      setCampaigns(res.data || []);
    } catch (err) {
      console.error('Failed to fetch campaigns:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCampaigns();
  }, []);

  // Handle Real-time Progress Updates
  useEffect(() => {
    const campaignEvent = events.find(e => e.type === 'CAMPAIGN_PROGRESS');
    if (campaignEvent) {
      const { campaignId, status, sentCount, totalTarget } = campaignEvent.payload;
      setCampaigns(prev => prev.map(c => {
        if (c.id === campaignId) {
          return { ...c, status, sentCount, totalTarget };
        }
        return c;
      }));
    }
  }, [events]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createCampaign(formData);
      setShowDraft(false);
      setFormData({ name: '', type: 'Festive Offer', channel: 'WHATSAPP', content: '' });
      fetchCampaigns();
    } catch (err) {
      alert('Failed to trigger campaign');
    }
  };

  if (loading) return <div className="loading">Loading marketing campaigns...</div>;

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <h2>Marketing Hub</h2>
          <p>Send bulk WhatsApp/SMS campaigns to your patients</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowDraft(true)}>Create Campaign</button>
      </div>

      {showDraft && (
        <div className="modal-overlay">
          <div className="modal-content card">
            <h3>New Campaign</h3>
            <form onSubmit={handleSubmit} className="form-grid">
              <div className="form-group">
                <label>Campaign Name</label>
                <input 
                  type="text" 
                  value={formData.name} 
                  onChange={e => setFormData({ ...formData, name: e.target.value })} 
                  placeholder="e.g. Diwali Greetings 2026"
                  required
                />
              </div>
              <div className="form-group">
                <label>Campaign Type</label>
                <select value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })}>
                  <option>Festive Offer</option>
                  <option>Discount</option>
                  <option>Valued Customer</option>
                  <option>New Service Announcement</option>
                </select>
              </div>
              <div className="form-group">
                <label>Channel</label>
                <select value={formData.channel} onChange={e => setFormData({ ...formData, channel: e.target.value as any })}>
                  <option value="WHATSAPP">WhatsApp</option>
                  <option value="SMS">SMS</option>
                  <option value="EMAIL">Email</option>
                </select>
              </div>
              <div className="form-group">
                <label>Message Content</label>
                <textarea 
                  value={formData.content} 
                  onChange={e => setFormData({ ...formData, content: e.target.value })} 
                  placeholder="Type your marketing message here..."
                  rows={4}
                  required
                />
              </div>
              <div className="form-actions" style={{ marginTop: 16 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowDraft(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Trigger Campaign</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="campaign-grid">
        {campaigns.length === 0 ? (
          <div className="card text-center" style={{ gridColumn: '1 / -1', padding: '48px' }}>
            <p style={{ color: 'var(--text-muted)' }}>No campaigns sent yet. Start your first marketing campaign!</p>
          </div>
        ) : (
          campaigns.map(c => (
            <div key={c.id} className="card campaign-card">
              <div className="campaign-status">
                <span className={`badge ${c.status.toLowerCase()}`}>{c.status}</span>
                <span className="channel-tag">{c.channel}</span>
              </div>
              <h3 className="campaign-name">{c.name}</h3>
              <p className="campaign-type">{c.type}</p>
              
              {c.status === 'SENDING' && (
                <div className="progress-container">
                  <div className="progress-bar">
                    <div 
                      className="progress-fill" 
                      style={{ width: `${(c.sentCount / c.totalTarget) * 100}%` }}
                    />
                  </div>
                  <div className="progress-stats">
                    {c.sentCount} / {c.totalTarget} delivered
                  </div>
                </div>
              )}

              {c.status !== 'SENDING' && (
                <div className="campaign-stats-summary">
                  <div className="stat-item">
                    <span className="stat-label">Delivered</span>
                    <span className="stat-val">{c.sentCount}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Reach</span>
                    <span className="stat-val">{c.totalTarget}</span>
                  </div>
                </div>
              )}

              <div className="campaign-footer">
                <span className="date">{new Date(c.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          ))
        )}
      </div>

      <style>{`
        .campaign-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 20px;
          margin-top: 24px;
        }
        .campaign-card {
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding: 20px;
          border: 1px solid var(--border);
          transition: transform 0.2s;
        }
        .campaign-card:hover {
          transform: translateY(-4px);
          border-color: var(--primary);
        }
        .campaign-status {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .channel-tag {
          font-size: 10px;
          font-weight: 700;
          color: var(--text-muted);
          background: rgba(255,255,255,0.05);
          padding: 2px 8px;
          border-radius: 4px;
          text-transform: uppercase;
        }
        .campaign-name {
          margin: 0;
          font-size: 18px;
        }
        .campaign-type {
          font-size: 13px;
          color: var(--text-muted);
          margin: 0;
        }
        .progress-container {
          margin-top: 12px;
        }
        .progress-bar {
          height: 8px;
          background: rgba(255,255,255,0.05);
          border-radius: 4px;
          overflow: hidden;
          margin-bottom: 8px;
        }
        .progress-fill {
          height: 100%;
          background: var(--primary);
          transition: width 0.3s ease;
          box-shadow: 0 0 10px var(--primary);
        }
        .progress-stats {
          font-size: 12px;
          color: var(--text-muted);
          text-align: right;
        }
        .campaign-stats-summary {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-top: auto;
          padding-top: 12px;
          border-top: 1px solid var(--border);
        }
        .stat-item {
          display: flex;
          flex-direction: column;
        }
        .stat-label {
          font-size: 11px;
          color: var(--text-muted);
          text-transform: uppercase;
        }
        .stat-val {
          font-size: 16px;
          font-weight: 600;
        }
        .campaign-footer {
          font-size: 12px;
          color: var(--text-muted);
          margin-top: 12px;
        }
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0,0,0,0.7);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }
        .modal-content {
          width: 100%;
          max-width: 500px;
          padding: 24px;
        }
      `}</style>
    </div>
  );
}
