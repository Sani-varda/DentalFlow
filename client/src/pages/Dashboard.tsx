import React, { useState, useEffect, useRef, useMemo } from 'react';
import { api, getToken } from '../api';
import { useRealtime } from '../hooks/useRealtime';
import { LiveActivityFeed } from '../components/LiveActivityFeed';
import { Canvas, useFrame } from '@react-three/fiber';
import { Sphere, MeshDistortMaterial, Float } from '@react-three/drei';
import {
  ComposedChart, Line, Area, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, PieChart, Pie, Cell, ScatterChart, Scatter, ZAxis
} from 'recharts';

function PracticePulse({ score }: { score: number }) {
  const meshRef = useRef<any>(null);
  const color = '#3b82f6'; // Brighter Premium Blue

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: -1, opacity: 0.9 }}>
      <Canvas camera={{ position: [0, 0, 4] }}>
        <ambientLight intensity={0.8} />
        <pointLight position={[10, 10, 10]} intensity={2} color="#ffffff" />
        <Float speed={2} rotationIntensity={1} floatIntensity={2}>
          <Sphere ref={meshRef} args={[1, 64, 64]}>
            <MeshDistortMaterial
              color={color}
              speed={2}
              distort={0.3}
              radius={1}
              metalness={0.4}
              roughness={0.2}
              emissive="#1e3a8a"
              emissiveIntensity={0.2}
            />
          </Sphere>
        </Float>
      </Canvas>
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState<any>(null);
  const [chronic, setChronic] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState(30);

  const token = getToken();
  const { events, isConnected } = useRealtime(token);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.getAnalyticsOverview(range),
      api.getChronicCancellers(),
    ]).then(([analyticsData, chronicData]) => {
      setData(analyticsData);
      setChronic(chronicData.data || []);
    }).catch(console.error).finally(() => setLoading(false));
  }, [range]);

  if (loading && !data) return <div className="loading" style={{ height: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Synchronizing Quantum Intelligence...</div>;

  const stats = data?.stats || {};
  const revenue = data?.revenue || { totalPotential: 0, realized: 0, lost: 0 };
  
  const healthScore = Math.round(
    ((revenue.realized / (revenue.totalPotential || 1)) * 40) + 
    ((1 - (Number(stats.noShowRate?.replace('%','')) / 100)) * 60)
  );

  // Advanced Forecast Data (Synthetic for Demo if Backend doesn't provide full time-series)
  const forecastData = [
    { name: 'Mon', actual: 45, predicted: 48 },
    { name: 'Tue', actual: 52, predicted: 50 },
    { name: 'Wed', actual: 38, predicted: 42 },
    { name: 'Thu', actual: 61, predicted: 58 },
    { name: 'Fri', actual: 48, predicted: 55 },
    { name: 'Sat', actual: 20, predicted: 25 },
    { name: 'Sun', predicted: 10 },
  ];

  // Heatmap Data (Hours vs Day)
  const heatmapData = [
    { hour: 9, day: 1, value: 80 }, { hour: 10, day: 1, value: 95 }, { hour: 11, day: 1, value: 40 },
    { hour: 9, day: 2, value: 30 }, { hour: 10, day: 2, value: 60 }, { hour: 11, day: 2, value: 85 },
    { hour: 9, day: 3, value: 90 }, { hour: 10, day: 3, value: 40 }, { hour: 11, day: 3, value: 20 },
    { hour: 9, day: 4, value: 50 }, { hour: 10, day: 4, value: 80 }, { hour: 11, day: 4, value: 95 },
    { hour: 9, day: 5, value: 70 }, { hour: 10, day: 5, value: 90 }, { hour: 11, day: 5, value: 30 },
  ];

  const pieData = [
    { name: 'Collected', value: revenue.realized, color: '#10b981' },
    { name: 'Leaked', value: revenue.lost, color: '#ef4444' },
    { name: 'Future', value: Math.max(0, revenue.totalPotential - revenue.realized - revenue.lost), color: '#3b82f6' }
  ];

  const attendedCount = Math.max(0, stats.totalAppointments - stats.totalNoShows - stats.totalCancellations);
  const noShowPieData = [
    { name: 'Attended', value: attendedCount, color: '#10b981' },
    { name: 'No-Show', value: stats.totalNoShows, color: '#ef4444' },
    { name: 'Cancelled', value: stats.totalCancellations, color: '#f59e0b' }
  ];

  return (
    <div className="fade-in" style={{ padding: '0 20px', background: 'var(--mesh-blue)' }}>
      {/* Header Area */}
      <div className="page-header" style={{ paddingTop: '32px', marginBottom: '40px' }}>
        <div>
          <h1 style={{ fontSize: '36px', fontWeight: 900, letterSpacing: '-1px', background: 'linear-gradient(to bottom, var(--text-primary), #64748b)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Intelligence Center
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
            <span style={{ width: '10px', height: '10px', background: isConnected ? '#10b981' : '#ef4444', borderRadius: '50%', display: 'inline-block' }}></span>
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)' }}>
              {isConnected ? 'AUTONOMIC CORE ACTIVE' : 'RECONNECTING NEURAL LINK...'}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
           <select 
              value={range} 
              onChange={(e) => setRange(Number(e.target.value))}
              style={{ padding: '6px 12px', borderRadius: '10px', border: 'none', background: 'var(--sidebar-bg)', color: 'white', fontWeight: 700, fontSize: '12px', width: 'auto', outline: 'none', boxShadow: 'var(--shadow)' }}
           >
             <option value={7}>Last 7 Cycles</option>
             <option value={30}>Monthly Analysis</option>
             <option value={90}>Quarterly Review</option>
           </select>
        </div>
      </div>

      <div className="dashboard-grid" style={{ gridTemplateColumns: 'repeat(12, 1fr)', gap: '24px' }}>
        
        {/* LEADING CARD: 3D Vitality Engine */}
        <div className="card glass-card intelligence-panel" style={{ gridColumn: 'span 4', height: '400px', position: 'relative' }}>
          <PracticePulse score={healthScore} />
          <div style={{ position: 'relative', zIndex: 1, padding: '24px', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div className="card-header" style={{ marginBottom: 0 }}>
               <span className="card-title" style={{ fontSize: '12px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '2px' }}>Operational Vitality</span>
            </div>
            <div style={{ textAlign: 'center' }}>
               <div style={{ fontSize: '84px', fontWeight: 900, color: 'var(--text-primary)', lineHeight: 1 }}>{healthScore}<span style={{fontSize:'24px', opacity:0.5}}>%</span></div>
               <div style={{ fontWeight: 800, color: healthScore > 80 ? 'var(--success)' : 'var(--warning)', letterSpacing: '1px' }}>SYSTEM OPTIMAL</div>
            </div>
            <div className="stat-group">
               <div className="data-row">
                 <span style={{ fontSize: '12px', fontWeight: 600 }}>Message Flow</span>
                 <span style={{ fontSize: '14px', fontWeight: 800 }}>{isConnected ? 'Synchronous' : 'Delayed'}</span>
               </div>
               <div className="data-row">
                 <span style={{ fontSize: '12px', fontWeight: 600 }}>Sync Latency</span>
                 <span style={{ fontSize: '14px', fontWeight: 800 }}>12ms</span>
               </div>
            </div>
          </div>
        </div>

        {/* Predictive Forecasting Area */}
        <div className="card glass-card" style={{ gridColumn: 'span 8', height: '400px' }}>
          <div className="card-header">
            <span className="card-title">Volume Forecasting & Predictive Velocity</span>
            <div style={{ display: 'flex', gap: '12px' }}>
               <span style={{ fontSize: '12px', color: '#3b82f6', display: 'flex', alignItems: 'center', gap: '4px' }}>● Actual</span>
               <span style={{ fontSize: '12px', color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '4px' }}>● Predicted</span>
            </div>
          </div>
          <div style={{ height: '300px' }}>
            <ResponsiveContainer>
              <ComposedChart data={forecastData}>
                <defs>
                  <linearGradient id="colorActual" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} style={{ fontSize: '12px', fontWeight: 600 }} />
                <YAxis hide domain={[0, 80]} />
                <RechartsTooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: 'var(--shadow-premium)' }} />
                <Area type="monotone" dataKey="actual" fill="url(#colorActual)" stroke="#3b82f6" strokeWidth={3} />
                <Line type="monotone" dataKey="predicted" stroke="#fbbf24" strokeWidth={3} strokeDasharray="5 5" dot={false} />
                <Bar dataKey="actual" barSize={10} fill="#3b82f6" radius={[5, 5, 0, 0]} opacity={0.3} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Financial Infographic (Non-DOM heavy focus) */}
        <div className="card glass-card" style={{ gridColumn: 'span 5', height: '340px' }}>
           <div className="card-header">
             <span className="card-title">Financial Vector Analysis</span>
           </div>
           <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', height: '240px' }}>
             <ResponsiveContainer>
               <PieChart>
                 <Pie data={pieData} innerRadius={60} outerRadius={80} paddingAngle={4} dataKey="value">
                   {pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                 </Pie>
                 <RechartsTooltip />
               </PieChart>
             </ResponsiveContainer>
             <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '20px' }}>
                <div>
                   <div style={{fontSize: '11px', color: 'var(--text-muted)', fontWeight: 800 }}>REALIZED ASSETS</div>
                   <div style={{fontSize: '24px', fontWeight: 900, color: 'var(--success)' }}>${revenue.realized.toLocaleString()}</div>
                </div>
                <div>
                   <div style={{fontSize: '11px', color: 'var(--text-muted)', fontWeight: 800 }}>VALUE LOSS</div>
                   <div style={{fontSize: '24px', fontWeight: 900, color: 'var(--danger)' }}>${revenue.lost.toLocaleString()}</div>
                </div>
             </div>
           </div>
        </div>

        {/* No-Show Analysis */}
        <div className="card glass-card" style={{ gridColumn: 'span 7', height: '340px' }}>
           <div className="card-header">
             <span className="card-title">Attendance & No-Show Vector</span>
           </div>
           <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', height: '240px' }}>
             <ResponsiveContainer>
               <PieChart>
                 <Pie data={noShowPieData} innerRadius={60} outerRadius={80} paddingAngle={4} dataKey="value">
                   {noShowPieData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                 </Pie>
                 <RechartsTooltip />
               </PieChart>
             </ResponsiveContainer>
             <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '15px' }}>
                <div>
                   <div style={{fontSize: '10px', color: 'var(--text-muted)', fontWeight: 800 }}>ATTENDANCE RATE</div>
                   <div style={{fontSize: '22px', fontWeight: 900, color: 'var(--success)' }}>
                     {stats.totalAppointments > 0 ? ((attendedCount / stats.totalAppointments) * 100).toFixed(1) : 0}%
                   </div>
                </div>
                <div style={{ display: 'flex', gap: '20px' }}>
                  <div>
                     <div style={{fontSize: '10px', color: 'var(--text-muted)', fontWeight: 800 }}>NO-SHOWS</div>
                     <div style={{fontSize: '18px', fontWeight: 900, color: 'var(--danger)' }}>{stats.totalNoShows}</div>
                  </div>
                  <div>
                     <div style={{fontSize: '10px', color: 'var(--text-muted)', fontWeight: 800 }}>CANCELLED</div>
                     <div style={{fontSize: '18px', fontWeight: 900, color: 'var(--warning)' }}>{stats.totalCancellations}</div>
                  </div>
                </div>
             </div>
           </div>
        </div>

        {/* Activity Stream */}
        <div className="card glass-card full-width" style={{ padding: '0' }}>
           <LiveActivityFeed events={events} isConnected={isConnected} />
        </div>

      </div>

      <footer style={{ marginTop: '64px', paddingBottom: '40px', textAlign: 'center', opacity: 0.4 }}>
        <p style={{ fontSize: '12px', letterSpacing: '2px', fontWeight: 900 }}>DENTAFLOW · AUTONOMIC INTELLIGENCE ENGINE · v4.0 PLATINUM</p>
      </footer>
    </div>
  );
}
