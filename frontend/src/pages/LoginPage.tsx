import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './LoginPage.css';

// Absoliutus kelias nuo šaknies, kad logotipas rodytųsi visuose route (/, /login, /dashboard ir t.t.)
const logoUrl = ((process.env.PUBLIC_URL === '.' || !process.env.PUBLIC_URL) ? '' : process.env.PUBLIC_URL) + '/logo.png';

const LoginPage: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(username, password);
      navigate('/');
    } catch (err: any) {
      // Patikrinti ar tai proxy/connection klaida (pirmiausia, nes dažniausiai pasitaiko)
      const errorMessage = err.message || '';
      const errorCode = err.code || '';
      
      if (errorMessage.includes('ECONNREFUSED') || 
          errorMessage.includes('proxy') || 
          errorMessage.includes('Could not proxy') ||
          errorCode === 'ECONNREFUSED' ||
          errorCode === 'ERR_NETWORK' ||
          (!err.response && err.request)) {
        // Proxy/Connection klaida - backend serveris nepasiekiamas
        setError('Nepavyko prisijungti prie backend serverio. Patikrinkite:\n• Ar backend serveris veikia (http://localhost:8000)\n• Jei naudojate VPN, ar SSH tunelis yra aktyvus\n• Ar firewall neblokuoja ryšio');
      } else if (err.response) {
        // Backend grąžino atsakymą
        const errorData = err.response?.data;
        
        // Patikrinti ar tai DB klaida
        if (errorData?.type === 'database_error' || 
            errorData?.error?.toLowerCase().includes('database') ||
            errorData?.error?.toLowerCase().includes('duomenų bazės') ||
            errorData?.detail?.toLowerCase().includes('database') ||
            err.response?.status === 503) {
          // DB ryšio klaida
          setError(errorData?.error || 'Nepavyko prisijungti prie duomenų bazės. Patikrinkite ar duomenų bazės serveris veikia ir ar SSH tunelis (jei naudojamas) yra aktyvus.');
        } else if (errorData?.detail) {
          // Kitos klaidos
          setError(errorData.detail);
        } else if (errorData?.message) {
          setError(errorData.message);
        } else if (errorData?.error) {
          setError(errorData.error);
        } else if (typeof errorData === 'string') {
          setError(errorData);
        } else {
          setError('Prisijungimo klaida. Patikrinkite vartotojo vardą ir slaptažodį.');
        }
      } else {
        // Klaida setup'e
        setError(err.message || 'Prisijungimo klaida');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-logo-container">
          <img src={logoUrl} alt="Logi-Track TMS" className="login-logo" />
        </div>
        <form onSubmit={handleSubmit}>
          {error && <div className="error-message">{error}</div>}
          <div className="form-group">
            <label htmlFor="username">Vartotojo vardas</label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">Slaptažodis</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="button" disabled={loading}>
            {loading ? 'Jungiamasi...' : 'Prisijungti'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;

