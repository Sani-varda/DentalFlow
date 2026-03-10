import { useState, useEffect } from 'react';
import { api } from '../api';

export default function Appointments() {
  const [appointments, setAppointments] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: '15' });
    if (filter) params.set('status', filter);

    api.getAppointments(params.toString())
      .then((data) => {
        setAppointments(data.data || []);
        setTotal(data.total || 0);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [page, filter]);

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await api.updateAppointment(id, { status });
      setAppointments((prev) => prev.map((a) => a.id === id ? { ...a, status } : a));
    } catch (err) {
      console.error(err);
    }
  };

  const formatDate = (d: string) => new Date(d).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <h2>Appointments</h2>
          <p>{total} total appointments</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {['', 'SCHEDULED', 'COMPLETED', 'NO_SHOW', 'CANCELLED'].map((s) => (
            <button
              key={s}
              className={`btn ${filter === s ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => { setFilter(s); setPage(1); }}
              style={{ padding: '8px 14px', fontSize: 12 }}
            >
              {s || 'All'}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div className="loading" style={{ padding: 40, textAlign: 'center' }}>Loading appointments...</div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Scheduled</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {appointments.map((a) => (
                  <tr key={a.id}>
                    <td style={{ fontWeight: 500 }}>{a.patient?.name || '—'}</td>
                    <td>{formatDate(a.scheduledTime)}</td>
                    <td>
                      <span className={`badge ${a.status.toLowerCase().replace('_', '-')}`}>
                        {a.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td>
                      {a.status === 'SCHEDULED' && (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }}
                            onClick={() => handleStatusChange(a.id, 'COMPLETED')}>
                            Complete
                          </button>
                          <button className="btn btn-danger" style={{ padding: '4px 10px', fontSize: 12 }}
                            onClick={() => handleStatusChange(a.id, 'NO_SHOW')}>
                            No-Show
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {appointments.length === 0 && (
                  <tr><td colSpan={4} style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 32 }}>No appointments found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {total > 15 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 20 }}>
            <button className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</button>
            <span style={{ padding: '10px 16px', color: 'var(--text-muted)', fontSize: 14 }}>Page {page}</span>
            <button className="btn btn-ghost" disabled={page * 15 >= total} onClick={() => setPage(page + 1)}>Next</button>
          </div>
        )}
      </div>
    </div>
  );
}
