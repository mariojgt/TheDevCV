import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { type CreditAction, type UserSettings } from '../lib/types';
import { DEFAULT_AI_MODELS } from '../lib/models';
import { AUTH_EXPIRED_EVENT, setAuthUser } from '../lib/supabase';

interface AppSettings extends UserSettings {
  ai_configured?: boolean;
  ai_source?: 'user' | 'env' | 'none';
  ai_key_hint?: string | null;
  ai_models?: { id: string; label: string }[];
  mcp_token?: string;
}

interface AppContextType {
  credits: number;
  lifetimeGranted: number;
  lifetimeConsumed: number;
  creditsLoading: boolean;
  isAdmin: boolean;
  settings: AppSettings | null;
  settingsLoading: boolean;
  refreshCredits: () => Promise<void>;
  refreshSettings: () => Promise<void>;
  hasCredits: (action: CreditAction) => boolean;
  costOf: (action: CreditAction) => number;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const activeUserIdRef = useRef<string | null>(user?.id ?? null);
  const settingsRequestRef = useRef(0);
  activeUserIdRef.current = user?.id ?? null;

  useEffect(() => {
    setAuthUser(user);
  }, [user]);

  const refreshSettings = useCallback(async () => {
    const requestedUserId = user?.id ?? null;
    const requestId = ++settingsRequestRef.current;
    if (!requestedUserId) {
      setSettings(null);
      setSettingsLoading(false);
      return;
    }
    setSettingsLoading(true);
    try {
      const response = await fetch('/api/settings', { credentials: 'include' });
      if (response.status === 401) window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
      if (!response.ok) throw new Error('settings_fetch_failed');
      const data = await response.json();
      if (requestId !== settingsRequestRef.current || activeUserIdRef.current !== requestedUserId) return;
      setSettings({
        user_id: data.user_id,
        theme: data.theme ?? 'dark',
        ai_enabled: data.ai_enabled ?? false,
        ai_provider: data.ai_provider ?? 'anthropic',
        ai_model: data.ai_model ?? 'claude-opus-5-5',
        ai_models: data.ai_models?.length ? data.ai_models : DEFAULT_AI_MODELS,
        encrypted_api_key: data.ai_configured ? 'configured' : '',
        ai_configured: data.ai_configured,
        ai_source: data.ai_source,
        ai_key_hint: data.ai_key_hint,
        mcp_token: data.mcp_token,
      });
    } catch {
      if (requestId === settingsRequestRef.current && activeUserIdRef.current === requestedUserId) {
        setSettings(null);
      }
    } finally {
      if (requestId === settingsRequestRef.current && activeUserIdRef.current === requestedUserId) {
        setSettingsLoading(false);
      }
    }
  }, [user?.id]);

  useEffect(() => {
    refreshSettings();
  }, [refreshSettings]);

  const currentSettings = settings?.user_id === user?.id ? settings : null;
  const value: AppContextType = {
    credits: 999999,
    lifetimeGranted: 0,
    lifetimeConsumed: 0,
    creditsLoading: false,
    isAdmin: false,
    settings: currentSettings,
    settingsLoading,
    refreshCredits: async () => { /* nothing to refresh */ },
    refreshSettings,
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
