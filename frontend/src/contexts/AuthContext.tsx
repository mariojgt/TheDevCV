import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AUTH_EXPIRED_EVENT, type Session, type User } from '../lib/supabase';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, setupToken?: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function authFetch(path: string, init?: RequestInit) {
  const response = await fetch(`/api/auth${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.error ?? 'request_failed');
  }
  return body;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await authFetch('/me');
      setUser(data.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const expired = () => setUser(null);
    window.addEventListener(AUTH_EXPIRED_EVENT, expired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, expired);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const data = await authFetch('/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setUser(data.user);
  }, []);

  const signUp = useCallback(async (email: string, password: string, setupToken?: string) => {
    const data = await authFetch('/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, setup_token: setupToken }),
    });
    setUser(data.user);
  }, []);

  const signOut = useCallback(async () => {
    await authFetch('/logout', { method: 'POST' });
    setUser(null);
  }, []);

  const value = useMemo<AuthContextType>(() => ({
    session: user ? { user } : null,
    user,
    loading,
    signIn,
    signUp,
    signOut,
  }), [user, loading, signIn, signUp, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
