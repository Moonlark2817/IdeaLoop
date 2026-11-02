import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { login, register } from '../api';
import { useAuth } from '../auth';
export default function AuthForm({registration = false}: {registration?: boolean}) {
  const [username, setUsername] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const auth = useAuth(); const navigate = useNavigate(); const location = useLocation();
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setError('');
    try { const result = registration ? await register(username.trim(), email.trim(), password) : await login(email.trim(), password); auth.accept(result.user, result.token);
      const from = location.state?.from; navigate(typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') ? from : '/projects', {replace: true});
    } catch (err) { setError((err as Error).message); } finally {setBusy(false);}
  }
  return <main className="page-container form-page"><section className="form-card"><h1>{registration ? 'Create an account' : 'Sign in'}</h1>
    {auth.message && <p role="status">{auth.message}</p>}{error && <p className="error-message" role="alert">{error}</p>}
    <form onSubmit={submit}>{registration && <div className="form-group"><label htmlFor="username">Username</label><input id="username" autoComplete="username" required pattern="[A-Za-z0-9_]{3,50}" minLength={3} maxLength={50} value={username} onChange={e => setUsername(e.target.value)} /></div>}
      <div className="form-group"><label htmlFor="email">Email</label><input id="email" type="email" autoComplete="email" maxLength={255} required value={email} onChange={e => setEmail(e.target.value)} /></div>
      <div className="form-group"><label htmlFor="password">Password</label><input id="password" type="password" autoComplete={registration ? 'new-password' : 'current-password'} minLength={12} maxLength={128} required value={password} onChange={e => setPassword(e.target.value)} /><p>Use 12–128 characters.</p></div>
      <button className="primary-button" disabled={busy}>{busy ? 'Please wait…' : registration ? 'Register' : 'Sign in'}</button>
    </form><p><Link className="text-link" to={registration ? '/login' : '/register'} state={location.state}>{registration ? 'Already registered? Sign in' : 'Create an account'}</Link></p></section></main>;
}
