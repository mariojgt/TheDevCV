import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { CREDIT_COSTS, type CreditAction, type UserSettings } from '../lib/types';

interface AppContextType {
  credits: number;
  lifetimeGranted: number;
  lifetimeConsumed: number;
  creditsLoading: boolean;
  isAdmin: boolean;
  settings: UserSettings | null;
  refreshCredits: () => Promise<void>;
  /** True if the user's current balance is enough to pay for `action`. */
  hasCredits: (action: CreditAction) => boolean;
  /** Credits charged for a given action (UI hint; server is authoritative). */
  costOf: (action: CreditAction) => number;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [credits, setCredits] = useState(0);
  const [lifetimeGranted, setLifetimeGranted] = useState(0);
  const [lifetimeConsumed, setLifetimeConsumed] = useState(0);
  const [creditsLoading, setCreditsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [settings, setSettings] = useState<UserSettings | null>(null);

  const refreshCredits = useCallback(async () => {
    if (!user) {
      setCredits(0);
      setLifetimeGranted(0);
      setLifetimeConsumed(0);
      setIsAdmin(false);
      setCreditsLoading(false);
      return;
    }
    setCreditsLoading(true);
    const [{ data: creditData }, { data: adminData }] = await Promise.all([
      supabase.rpc('get_my_credits'),
      supabase.rpc('is_admin'),
    ]);
    const row = Array.isArray(creditData) ? creditData[0] : creditData;
    setCredits(row?.balance ?? 0);
    setLifetimeGranted(row?.lifetime_granted ?? 0);
    setLifetimeConsumed(row?.lifetime_consumed ?? 0);
    setIsAdmin(Boolean(adminData));
    setCreditsLoading(false);
  }, [user]);

  useEffect(() => {
    if (!user) {
      setSettings(null);
      setCredits(0);
      setLifetimeGranted(0);
      setLifetimeConsumed(0);
      setIsAdmin(false);
      setCreditsLoading(false);
      return;
    }
    setSettings({
      user_id: user.id,
      theme: 'dark',
      ai_enabled: true,
      ai_provider: 'anthropic',
      ai_model: 'claude-sonnet-4-6',
      encrypted_api_key: 'server',
    });
    refreshCredits();
  }, [user, refreshCredits]);

  const costOf = (action: CreditAction) => CREDIT_COSTS[action] ?? 0;
  const hasCredits = (action: CreditAction) => credits >= costOf(action);

  return (
    <AppContext.Provider
      value={{
        credits,
        lifetimeGranted,
        lifetimeConsumed,
        creditsLoading,
        isAdmin,
        settings,
        refreshCredits,
        hasCredits,
        costOf,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
