import { Outlet, NavLink, Navigate } from 'react-router-dom';
import { isAuthenticated, clearToken } from './api';

export default function App() {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-text">
            <h1>DentaFlow</h1>
            <span className="powered-by">MoonLIT Arc</span>
          </div>
        </div>
        <nav className="sidebar-nav">
          <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            Dashboard
          </NavLink>
          <NavLink to="/appointments" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            Appointments
          </NavLink>
          <NavLink to="/patients" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            Patients
          </NavLink>
          <NavLink to="/marketing" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            Marketing
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} style={{ marginTop: 'auto' }}>
            Settings
          </NavLink>
        </nav>
        <button className="btn btn-ghost" onClick={() => { clearToken(); window.location.href = '/login'; }}>
          Sign Out
        </button>
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
