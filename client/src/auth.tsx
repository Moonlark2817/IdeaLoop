import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { me, tokenKey } from './api';
import type { User } from './types';
const Context = createContext<{ user: User | null; loading: boolean; message: string; accept: (user: User, token: string) => void; logout: () => void; retry: () => void }>(null!);
export function AuthProvider({children}: {children: ReactNode}) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(!!sessionStorage.getItem(tokenKey));
  const [message, setMessage] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const expired = () => { setUser(null); setMessage('Your session expired. Please sign in again.'); };
    window.addEventListener('session-expired', expired);
    if (sessionStorage.getItem(tokenKey)) {
      setLoading(true);
      me(controller.signal).then(data => { setUser(data.user); setMessage(''); }).catch(error => {
        if (error.name !== 'AbortError') setMessage(error.message);
      }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    } else setLoading(false);
    return () => { controller.abort(); window.removeEventListener('session-expired', expired); };
  }, [attempt]);
  return <Context.Provider value={{user, loading, message, retry: () => setAttempt(n => n + 1), accept: (profile, token) => { sessionStorage.setItem(tokenKey, token); setUser(profile); setMessage(''); }, logout: () => {sessionStorage.removeItem(tokenKey); setUser(null); setMessage('');}}}>{children}</Context.Provider>;
}
export const useAuth = () => useContext(Context);
export function Protected({children}: {children: ReactNode}) {
  const {user, loading} = useAuth(); const location = useLocation();
  if (loading) return <main className="page-container" role="status">Restoring session…</main>;
  return user ? children : <Navigate to="/login" state={{from: location.pathname}} replace />;
}
