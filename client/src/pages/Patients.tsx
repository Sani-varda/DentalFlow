import { useState, useEffect } from 'react';
import { api } from '../api';

interface PatientDetailProps {
  patientId: string;
  onClose: () => void;
  onUpdate: () => void;
}

function PatientDetail({ patientId, onClose, onUpdate }: PatientDetailProps) {
  const [patient, setPatient] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [docName, setDocName] = useState('');
  const [docUrl, setDocUrl] = useState('');

  useEffect(() => {
    setLoading(true);
    api.getPatient(patientId)
      .then(setPatient)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [patientId]);

  const handleAddDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docName || !docUrl) return;
    try {
      await api.uploadPatientDocument(patientId, {
        name: docName,
        fileUrl: docUrl,
        fileType: 'PDF', // Simplified for demo
        fileSize: 1024 * 542 // Simplified
      });
      setDocName('');
      setDocUrl('');
      const updated = await api.getPatient(patientId);
      setPatient(updated);
    } catch (err) {
      alert('Failed to attach document');
    }
  };

  if (loading) return <div className="drawer-content">Optimizing Patient Neural Link...</div>;

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer-content" onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-main)', borderLeft: '1px solid var(--border)', boxShadow: 'var(--shadow-premium)' }}>
        <div className="drawer-header" style={{ padding: '32px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h2 style={{ fontSize: '24px', fontWeight: 900 }}>{patient.name}</h2>
              <p style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>ID: {patient.id.split('-')[0].toUpperCase()}</p>
            </div>
            <button onClick={onClose} className="btn btn-ghost" style={{ padding: '8px' }}>✕</button>
          </div>
        </div>

        <div style={{ padding: '32px' }}>
          <section style={{ marginBottom: '40px' }}>
            <h3 style={{ fontSize: '14px', letterSpacing: '2px', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '16px' }}>CONTACT PROTOCOLS</h3>
            <div className="card glass-card" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', gap: '32px' }}>
                <div>
                   <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)' }}>PHONE</label>
                   <p style={{ fontWeight: 700 }}>{patient.phone || 'N/A'}</p>
                </div>
                <div>
                   <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)' }}>EMAIL</label>
                   <p style={{ fontWeight: 700 }}>{patient.email || 'N/A'}</p>
                </div>
                <div>
                   <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)' }}>CHANNEL</label>
                   <p><span className="badge info">{patient.preferredChannel}</span></p>
                </div>
              </div>
            </div>
          </section>

          <section>
            <h3 style={{ fontSize: '14px', letterSpacing: '2px', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '16px' }}>CLINICAL DOCUMENTS</h3>
            <div className="card glass-card" style={{ padding: '20px' }}>
               {patient.documents?.length > 0 ? (
                 <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                   {patient.documents.map((doc: any) => (
                     <div key={doc.id} className="data-row" style={{ background: 'white' }}>
                       <span style={{ fontWeight: 700 }}>{doc.name}</span>
                       <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                          <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)' }}>{doc.fileType}</span>
                          <a href={doc.fileUrl} target="_blank" className="btn btn-ghost" style={{ padding: '4px 12px', fontSize: '12px' }}>VIEW</a>
                       </div>
                     </div>
                   ))}
                 </div>
               ) : (
                 <p style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '13px' }}>No documents attached</p>
               )}

               <form onSubmit={handleAddDoc} style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px solid var(--border)' }}>
                 <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                   <input 
                     type="text" 
                     placeholder="Document Name (e.g. X-Ray)" 
                     value={docName} 
                     onChange={e => setDocName(e.target.value)}
                     style={{ borderRadius: '12px' }}
                   />
                   <input 
                     type="text" 
                     placeholder="URL / Secure Link" 
                     value={docUrl} 
                     onChange={e => setDocUrl(e.target.value)}
                     style={{ borderRadius: '12px' }}
                   />
                 </div>
                 <button type="submit" className="btn btn-primary" style={{ width: '100%', borderRadius: '12px' }}>ATTACH QUANTUM DOCUMENT</button>
               </form>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export default function Patients() {
  const [patients, setPatients] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  
  // Modals
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  
  // Forms
  const [newPatient, setNewPatient] = useState({ name: '', email: '', phone: '', preferredChannel: 'SMS' });
  const [csvText, setCsvText] = useState('');

  const loadPatients = () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: '15' });
    if (search) params.set('search', search);

    api.getPatients(params.toString())
      .then((data) => {
        setPatients(data.data || []);
        setTotal(data.total || 0);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadPatients();
  }, [page, search]);

  const handleManualAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createPatient(newPatient);
      setShowAdd(false);
      setNewPatient({ name: '', email: '', phone: '', preferredChannel: 'SMS' });
      loadPatients();
    } catch (err) {
      alert('Failed to add patient');
    }
  };

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Simple CSV Parse: Name, Email, Phone
      const lines = csvText.split('\n').filter(l => l.trim());
      const patientsToImport = lines.map(line => {
        const [name, email, phone] = line.split(',').map(s => s?.trim());
        return { name, email, phone };
      }).filter(p => p.name);

      await api.bulkImportPatients(patientsToImport);
      setShowImport(false);
      setCsvText('');
      loadPatients();
    } catch (err) {
      alert('Failed to import patients');
    }
  };

  return (
    <div className="fade-in" style={{ paddingBottom: '80px' }}>
      <div className="page-header" style={{ marginBottom: '40px' }}>
        <div>
          <h1 style={{ fontSize: '32px', fontWeight: 900, marginBottom: '4px' }}>Patient Archives</h1>
          <p style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>{total} REGISTERED IDENTITIES</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
           <div style={{ width: 300 }}>
             <input
               type="text"
               placeholder="Filter by name or ID..."
               value={search}
               onChange={(e) => { setSearch(e.target.value); setPage(1); }}
               style={{ borderRadius: '12px', padding: '12px 20px', background: 'white' }}
             />
           </div>
           <button onClick={() => setShowImport(true)} className="btn btn-ghost" style={{ background: 'white', borderRadius: '12px', border: '1px solid var(--border)' }}>IMPORT CSV</button>
           <button onClick={() => setShowAdd(true)} className="btn btn-primary" style={{ borderRadius: '12px', fontWeight: 800 }}>+ ADD PATIENT</button>
        </div>
      </div>

      <div className="card glass-card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div className="loading" style={{ padding: 80, textAlign: 'center' }}>Synchronizing Neural Archives...</div>
        ) : (
          <div className="table-wrapper">
            <table className="premium-table">
              <thead>
                <tr>
                  <th>NAME</th>
                  <th>TELEMETRY</th>
                  <th>VITALITY SCORE</th>
                  <th>CONSENT</th>
                </tr>
              </thead>
              <tbody>
                {patients.map((p) => (
                  <tr key={p.id} onClick={() => setSelectedId(p.id)} style={{ cursor: 'pointer' }}>
                    <td>
                       <div style={{ fontWeight: 800, fontSize: '15px' }}>{p.name}</div>
                       <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 800 }}>ID: {p.id.split('-')[0].toUpperCase()}</div>
                    </td>
                    <td>
                      <div style={{ fontSize: '13px', fontWeight: 600 }}>{p.phone || 'NO_PHONE'}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{p.email || 'NO_EMAIL'}</div>
                    </td>
                    <td>
                      {p.noShowPattern ? (
                        <span className={`badge ${p.noShowPattern.riskLevel.toLowerCase()}`} style={{ fontSize: '10px', letterSpacing: '1px' }}>
                          {p.noShowPattern.riskLevel}
                        </span>
                      ) : (
                        <span className="badge low" style={{ fontSize: '10px', letterSpacing: '1px' }}>LOW</span>
                      )}
                    </td>
                    <td>
                      <span style={{ fontSize: '12px', fontWeight: 900, color: p.consentStatus ? 'var(--success)' : 'var(--danger)' }}>
                        {p.consentStatus ? 'AUTHORIZED' : 'REVOKED'}
                      </span>
                    </td>
                  </tr>
                ))}
                {patients.length === 0 && (
                  <tr><td colSpan={4} style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 48, fontWeight: 700 }}>NO NEURAL RECORDS DETECTED</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {total > 15 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, padding: '24px', borderTop: '1px solid var(--border)', background: 'rgba(255,255,255,0.4)' }}>
            <button className="btn btn-ghost" style={{ background: 'white' }} disabled={page <= 1} onClick={() => setPage(page - 1)}>PREVIOUS CYCLE</button>
            <span style={{ padding: '10px 16px', fontWeight: 800, fontSize: 13, display: 'flex', alignItems: 'center' }}>CYCLE {page}</span>
            <button className="btn btn-ghost" style={{ background: 'white' }} disabled={page * 15 >= total} onClick={() => setPage(page + 1)}>NEXT CYCLE</button>
          </div>
        )}
      </div>

      {/* Add Patient Modal */}
      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
           <div className="modal-content card glass-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px', padding: '32px' }}>
              <h2 style={{ fontSize: '24px', fontWeight: 900, marginBottom: '24px' }}>Register Identity</h2>
              <form onSubmit={handleManualAdd}>
                 <div className="stat-group" style={{ gap: '16px' }}>
                    <input type="text" placeholder="Full Name" required value={newPatient.name} onChange={e => setNewPatient({...newPatient, name: e.target.value})} style={{ borderRadius: '12px' }} />
                    <input type="email" placeholder="Email Address" value={newPatient.email} onChange={e => setNewPatient({...newPatient, email: e.target.value})} style={{ borderRadius: '12px' }} />
                    <input type="tel" placeholder="Phone Number" value={newPatient.phone} onChange={e => setNewPatient({...newPatient, phone: e.target.value})} style={{ borderRadius: '12px' }} />
                    <select value={newPatient.preferredChannel} onChange={e => setNewPatient({...newPatient, preferredChannel: e.target.value})} style={{ padding: '12px', borderRadius: '12px' }}>
                       <option value="SMS">SMS Protocol</option>
                       <option value="WHATSAPP">WhatsApp Flow</option>
                       <option value="EMAIL">Classic Email</option>
                    </select>
                 </div>
                 <div style={{ display: 'flex', gap: '12px', marginTop: '32px' }}>
                    <button type="button" onClick={() => setShowAdd(false)} className="btn btn-ghost" style={{ flex: 1 }}>CANCEL</button>
                    <button type="submit" className="btn btn-primary" style={{ flex: 2, fontWeight: 900 }}>INITIALIZE PATIENT</button>
                 </div>
              </form>
           </div>
        </div>
      )}

      {/* Import CSV Modal */}
      {showImport && (
        <div className="modal-overlay" onClick={() => setShowImport(false)}>
           <div className="modal-content card glass-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px', padding: '32px' }}>
              <h2 style={{ fontSize: '24px', fontWeight: 900, marginBottom: '8px' }}>Bulk Ingestion</h2>
              <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '24px' }}>FORMAT: NAME, EMAIL, PHONE (ONE PER LINE)</p>
              <form onSubmit={handleImport}>
                 <textarea 
                    value={csvText} 
                    onChange={e => setCsvText(e.target.value)}
                    placeholder="John Doe, john@example.com, +1234567890&#10;Jane Smith, jane@example.com, +0987654321"
                    style={{ width: '100%', height: '200px', borderRadius: '16px', padding: '20px', fontFamily: 'monospace', fontSize: '13px' }}
                 />
                 <div style={{ display: 'flex', gap: '12px', marginTop: '32px' }}>
                    <button type="button" onClick={() => setShowImport(false)} className="btn btn-ghost" style={{ flex: 1 }}>ABORT</button>
                    <button type="submit" className="btn btn-primary" style={{ flex: 2, fontWeight: 900 }}>EXECUTE BATCH UPLOAD</button>
                 </div>
              </form>
           </div>
        </div>
      )}

      {/* Detail Drawer */}
      {selectedId && (
        <PatientDetail 
          patientId={selectedId} 
          onClose={() => setSelectedId(null)} 
          onUpdate={loadPatients}
        />
      )}
    </div>
  );
}
