import { useState, useEffect } from 'react';
import { api, getToken } from '../api';
import { useRealtime } from '../hooks/useRealtime';

interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  apiKey: string | null;
  clinic?: {
    name: string;
  };
}

interface Webhook {
  id: string;
  name: string;
  url: string;
  events: string[];
  isActive: boolean;
}

type TabType = 'profile' | 'api' | 'integrations';

export default function Settings() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [showKey, setShowKey] = useState(false);
  const [showWebhookModal, setShowWebhookModal] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('profile');
  const [isEditing, setIsEditing] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);

  const [editForm, setEditForm] = useState({
    name: '',
    email: '',
    clinicName: ''
  });

  // Real-time status
  const token = getToken();
  const { status: sseStatus } = useRealtime(token);

  const [webhookForm, setWebhookForm] = useState({
    name: '',
    url: '',
    events: ['APPOINTMENT_CREATED', 'CAMPAIGN_PROGRESS']
  });

  const fetchSettings = async () => {
    try {
      const [uRes, wRes] = await Promise.all([
        api.getProfile(),
        api.getWebhooks()
      ]);
      setProfile(uRes.data);
      setEditForm({
        name: uRes.data.name || '',
        email: uRes.data.email || '',
        clinicName: uRes.data.clinic?.name || ''
      });
      setWebhooks(wRes.data || []);
    } catch (err) {
      console.error('Failed to load settings:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveLoading(true);
    try {
      const res = await api.updateProfile(editForm);
      setProfile(res.data);
      setIsEditing(false);
    } catch (err) {
      alert('Failed to update profile');
    } finally {
      setSaveLoading(false);
    }
  };

  const handleRotateKey = async () => {
    if (!confirm('Are you sure? Existing integrations using this key will break.')) return;
    try {
      const res = await api.rotateApiKey();
      setProfile(prev => ({ ...prev!, apiKey: res.data.apiKey }));
      setShowKey(true);
    } catch (err) {
      alert('Failed to rotate API key');
    }
  };

  const handleAddWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createWebhook(webhookForm);
      setShowWebhookModal(false);
      setWebhookForm({ name: '', url: '', events: ['APPOINTMENT_CREATED', 'CAMPAIGN_PROGRESS'] });
      fetchSettings();
    } catch (err) {
      alert('Failed to add webhook');
    }
  };

  const handleDeleteWebhook = async (id: string) => {
    if (!confirm('Remove this webhook?')) return;
    try {
      await api.deleteWebhook(id);
      fetchSettings();
    } catch (err) {
      alert('Failed to delete webhook');
    }
  };

  if (loading) return <div className="loading" style={{ height: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading preferences...</div>;

  return (
    <div className="fade-in settings-page">
      <div className="page-header">
        <div>
          <h2>Settings</h2>
          <p>Manage your practice profile and digital infrastructure</p>
        </div>
        <div className="sse-indicator">
          <span className={`status-dot ${sseStatus}`}></span>
          <span className="status-text">Real-time: {sseStatus}</span>
        </div>
      </div>

      <div className="settings-layout">
        <nav className="settings-nav">
          <button 
            className={`nav-item ${activeTab === 'profile' ? 'active' : ''}`}
            onClick={() => setActiveTab('profile')}
          >
            Practice Profile
          </button>
          <button 
            className={`nav-item ${activeTab === 'api' ? 'active' : ''}`}
            onClick={() => setActiveTab('api')}
          >
            API & Security
          </button>
          <button 
            className={`nav-item ${activeTab === 'integrations' ? 'active' : ''}`}
            onClick={() => setActiveTab('integrations')}
          >
            Integrations
          </button>
        </nav>

        <div className="settings-content">
          {activeTab === 'profile' && (
            <section className="card section-profile fade-in">
              <div className="section-header">
                <h3>Clinical Identity</h3>
                {!isEditing && (
                  <button className="btn btn-ghost btn-sm" onClick={() => setIsEditing(true)}>Edit Profile</button>
                )}
              </div>

              {isEditing ? (
                <form onSubmit={handleUpdateProfile} className="form-grid">
                  <div className="form-group">
                    <label>Clinician Name</label>
                    <input 
                      type="text" 
                      value={editForm.name} 
                      onChange={e => setEditForm({...editForm, name: e.target.value})}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Email Address</label>
                    <input 
                      type="email" 
                      value={editForm.email} 
                      onChange={e => setEditForm({...editForm, email: e.target.value})}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Clinic Name</label>
                    <input 
                      type="text" 
                      value={editForm.clinicName} 
                      onChange={e => setEditForm({...editForm, clinicName: e.target.value})}
                      required
                    />
                  </div>
                  <div className="form-actions">
                    <button type="button" className="btn btn-ghost" onClick={() => setIsEditing(false)}>Cancel</button>
                    <button type="submit" className="btn btn-primary" disabled={saveLoading}>
                      {saveLoading ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="profile-info">
                  <div className="info-row">
                    <label>Clinician</label>
                    <span className="value-text">{profile?.name}</span>
                  </div>
                  <div className="info-row">
                    <label>Clinic</label>
                    <span className="value-text">{profile?.clinic?.name || 'N/A'}</span>
                  </div>
                  <div className="info-row">
                    <label>Identifier</label>
                    <span className="value-text">{profile?.email}</span>
                  </div>
                  <div className="info-row">
                    <label>Access Level</label>
                    <span className="badge">{profile?.role}</span>
                  </div>
                </div>
              )}
            </section>
          )}

          {activeTab === 'api' && (
            <section className="card section-api fade-in">
              <h3>Personal API Key</h3>
              <p className="text-muted">Use this key to integrate DentaFlow with your internal tools or custom clinical software.</p>
              <div className="api-key-container">
                <input 
                  type={showKey ? 'text' : 'password'} 
                  value={profile?.apiKey || 'No key generated'} 
                  readOnly 
                  className="api-input"
                />
                <button className="btn btn-ghost btn-sm" onClick={() => setShowKey(!showKey)}>
                  {showKey ? 'Hide' : 'Show'}
                </button>
              </div>
              <button 
                className="btn btn-primary btn-sm" 
                style={{ marginTop: 16 }} 
                onClick={handleRotateKey}
              >
                Rotate API Key
              </button>
            </section>
          )}

          {activeTab === 'integrations' && (
            <section className="card section-webhooks fade-in">
              <div className="section-header">
                <h3>Webhooks</h3>
                <button className="btn btn-primary btn-sm" onClick={() => setShowWebhookModal(true)}>Add Endpoint</button>
              </div>
              <p className="text-muted">Broadcast clinical events to n8n, Make, or Zapier automation pipelines.</p>
              
              <div className="webhook-list">
                {webhooks.length === 0 ? (
                  <p className="empty-state">No active webhook endpoints.</p>
                ) : (
                  webhooks.map(w => (
                    <div key={w.id} className="webhook-item">
                      <div className="webhook-info">
                        <strong>{w.name}</strong>
                        <code>{w.url}</code>
                        <div className="event-tags">
                          {w.events.map(e => <span key={e} className="event-tag">{e}</span>)}
                        </div>
                      </div>
                      <button className="btn btn-ghost btn-icon" onClick={() => handleDeleteWebhook(w.id)}>Delete</button>
                    </div>
                  ))
                )}
              </div>
            </section>
          )}
        </div>
      </div>

      {showWebhookModal && (
        <div className="modal-overlay">
          <div className="modal-content card">
            <h3>Configure Webhook</h3>
            <form onSubmit={handleAddWebhook} className="form-grid">
              <div className="form-group">
                <label>Integration Alias</label>
                <input 
                  type="text" 
                  value={webhookForm.name} 
                  onChange={e => setWebhookForm({...webhookForm, name: e.target.value})}
                  placeholder="e.g. n8n Main Pipeline"
                  required
                />
              </div>
              <div className="form-group">
                <label>Endpoint URL</label>
                <input 
                  type="url" 
                  value={webhookForm.url} 
                  onChange={e => setWebhookForm({...webhookForm, url: e.target.value})}
                  placeholder="https://hooks.zapier.com/..."
                  required
                />
              </div>
              <div className="form-actions" style={{ marginTop: 16 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowWebhookModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Add Endpoint</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        .settings-layout {
          display: flex;
          gap: 32px;
          margin-top: 32px;
          min-height: 500px;
        }

        .settings-nav {
          width: 200px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .nav-item {
          padding: 12px 16px;
          background: transparent;
          border: none;
          border-radius: 8px;
          text-align: left;
          color: var(--text-muted);
          cursor: pointer;
          font-weight: 500;
          transition: all 0.2s;
        }

        .nav-item:hover {
          background: rgba(255,255,255,0.05);
          color: var(--text);
        }

        .nav-item.active {
          background: var(--sidebar-bg);
          color: white;
          box-shadow: var(--shadow);
        }

        .settings-content {
          flex: 1;
        }

        .info-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 0;
          border-bottom: 1px solid var(--border);
        }

        .info-row:last-child { border-bottom: none; }

        .info-row label {
          color: var(--text-muted);
          font-size: 14px;
          font-weight: 500;
        }

        .value-text {
          font-weight: 600;
          color: var(--text);
        }

        .api-key-container {
          display: flex;
          gap: 12px;
          margin: 16px 0;
        }

        .api-input {
          flex: 1;
          background: #000;
          border: 1px solid var(--border);
          padding: 10px 16px;
          border-radius: 8px;
          font-family: monospace;
          font-size: 13px;
          color: var(--primary);
        }

        .webhook-item {
          background: rgba(255,255,255,0.02);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 20px;
          margin-bottom: 16px;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
        }

        .webhook-info code {
          display: block;
          margin-top: 4px;
          font-size: 12px;
          color: var(--text-muted);
        }

        .event-tags {
          display: flex;
          gap: 8px;
          margin-top: 12px;
        }

        .event-tag {
          font-size: 11px;
          background: var(--sidebar-bg);
          color: white;
          padding: 4px 10px;
          border-radius: 6px;
        }

        .form-actions {
          display: flex;
          gap: 12px;
          margin-top: 24px;
        }

        .sse-indicator {
          display: flex;
          align-items: center;
          gap: 10px;
          background: var(--bg-glass);
          padding: 8px 16px;
          border-radius: 12px;
          border: 1px solid var(--bg-glass-border);
        }

        .status-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
        }

        .status-dot.connected { background: #10b981; box-shadow: 0 0 10px rgba(16, 185, 129, 0.4); }
        .status-dot.error { background: #ef4444; }
        .status-dot.connecting { background: #f59e0b; }
      `}</style>
    </div>
  );
}
