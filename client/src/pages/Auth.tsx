import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import { api, setToken } from '../api';

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [clinicName, setClinicName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        // Sign In
        const { token } = await api.login(email, password);
        setToken(token);
        navigate('/');
      } else {
        // Sign Up
        const { token } = await api.register({ email, password, name, clinicName, role: 'ADMIN' });
        setToken(token);
        navigate('/');
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSuccess = async (credentialResponse: any) => {
    try {
      setError('');
      setLoading(true);
      const { token } = await api.googleAuth(credentialResponse.credential);
      setToken(token);
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Google Sign-In failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-wrapper">
      <div className="card login-card fade-in">
        <div className="sidebar-logo" style={{ justifyContent: 'center', borderBottom: 'none', marginBottom: 0, paddingBottom: 16 }}>
          <h1>DentaFlow</h1>
        </div>
        
        <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--border)', marginBottom: '1.5rem' }}>
          <button 
            type="button" 
            onClick={() => setIsLogin(true)} 
            style={{ flex: 1, padding: '0.5rem', background: 'transparent', border: 'none', borderBottom: isLogin ? '2px solid var(--primary)' : '2px solid transparent', color: isLogin ? 'var(--text)' : 'var(--text-muted)', cursor: 'pointer', fontWeight: 600 }}
          >
            Sign In
          </button>
          <button 
            type="button" 
            onClick={() => setIsLogin(false)} 
            style={{ flex: 1, padding: '0.5rem', background: 'transparent', border: 'none', borderBottom: !isLogin ? '2px solid var(--primary)' : '2px solid transparent', color: !isLogin ? 'var(--text)' : 'var(--text-muted)', cursor: 'pointer', fontWeight: 600 }}
          >
            Sign Up
          </button>
        </div>

        <h2 style={{ textAlign: 'center', marginBottom: '0.5rem' }}>
          {isLogin ? 'Welcome Back' : 'Create Account'}
        </h2>
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
          {isLogin ? 'Sign in to your practice dashboard' : 'Start managing your dental practice'}
        </p>

        <form onSubmit={handleEmailAuth}>
          {!isLogin && (
            <>
              <div className="form-group">
                <label htmlFor="name">Full Name</label>
                <input
                  id="name"
                  type="text"
                  placeholder="Dr. John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required={!isLogin}
                />
              </div>
              <div className="form-group">
                <label htmlFor="clinicName">Clinic Name</label>
                <input
                  id="clinicName"
                  type="text"
                  placeholder="Gentle Dental Care"
                  value={clinicName}
                  onChange={(e) => setClinicName(e.target.value)}
                  required={!isLogin}
                />
              </div>
            </>
          )}

          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              placeholder="admin@clinic.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          
          {error && <p style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error}</p>}
          
          <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginBottom: '1rem' }} disabled={loading}>
            {loading ? 'Processing...' : (isLogin ? 'Sign In' : 'Sign Up')}
          </button>
        </form>

        <div style={{ display: 'flex', alignItems: 'center', margin: '1rem 0' }}>
          <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border)' }}></div>
          <span style={{ padding: '0 10px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>OR</span>
          <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border)' }}></div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <GoogleLogin
            onSuccess={handleGoogleSuccess}
            onError={() => {
              setError('Google Sign-In was unsuccessful.');
            }}
            useOneTap
            shape="rectangular"
            theme="filled_black"
          />
        </div>
      </div>
    </div>
  );
}
