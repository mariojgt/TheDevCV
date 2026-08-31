import { createContext, useContext, type ReactNode } from 'react';
import { LOCAL_USER, type Session, type User } from '../lib/supabase';

/**
 * Self-hosted mode has no accounts — a single static local user is always
 * signed in. The provider keeps the same shape the app was built against so
 * components using `useAuth()` don't need to change.
 */
interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const STATIC_VALUE: AuthContextType = {
  session: { user: LOCAL_USER },
  user: LOCAL_USER,
  loading: false,
  signOut: async () => { /* no-op in self-hosted mode */ },
};

export function AuthProvider({ children }: { children: ReactNode }) {
  return <AuthContext.Provider value={STATIC_VALUE}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
