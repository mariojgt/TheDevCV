import { createContext, useContext, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { type CreditAction, type UserSettings } from '../lib/types';

/**
 * Self-hosted mode: no plans, no credits, no billing. Every capability is
 * unlocked and every "cost" is zero. The interface is kept identical to the
 * old SaaS version so gated components (`hasCredits`, `costOf`, …) work
 * unchanged — the gates simply always pass.
 */
interface AppContextType {
  credits: number;
  lifetimeGranted: number;
  lifetimeConsumed: number;
  creditsLoading: boolean;
  isAdmin: boolean;
  settings: UserSettings | null;
  refreshCredits: () => Promise<void>;
  hasCredits: (action: CreditAction) => boolean;
  costOf: (action: CreditAction) => number;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  const value: AppContextType = {
    credits: 999999,
    lifetimeGranted: 0,
    lifetimeConsumed: 0,
    creditsLoading: false,
    isAdmin: false,
    settings: user
      ? {
          user_id: user.id,
          theme: 'dark',
          ai_enabled: true,
          ai_provider: 'anthropic',
          ai_model: 'server',
          encrypted_api_key: 'server',
        }
      : null,
    refreshCredits: async () => { /* nothing to refresh */ },
    hasCredits: () => true,
    costOf: () => 0,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
