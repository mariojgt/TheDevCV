import { useEffect, useState } from 'react';
import { Coins, LogOut, Plus, TrendingUp, TrendingDown } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useApp } from '../contexts/AppContext';
import { supabase } from '../lib/supabase';
import { Link, useNavigate } from 'react-router-dom';
import PageHeader from '../components/ui/PageHeader';

interface TxRow {
  id: number;
  action: string;
  delta: number;
  balance_after: number;
  created_at: string;
}

export default function Account() {
  const { user, signOut } = useAuth();
  const { credits, lifetimeGranted, lifetimeConsumed, creditsLoading, refreshCredits } = useApp();
  const navigate = useNavigate();
  const [tx, setTx] = useState<TxRow[]>([]);

  useEffect(() => {
    refreshCredits();
    supabase
      .from('credit_transactions')
      .select('id, action, delta, balance_after, created_at')
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => setTx((data as TxRow[]) ?? []));
  }, [refreshCredits]);

  const low = !creditsLoading && credits <= 3;

  return (
    <div className="max-w-2xl mx-auto">
      <PageHeader title="Account" description="Manage your balance and sign-in." />

      <section className="neo-card p-5 mb-4">
        <div className="text-[10px] font-bold uppercase tracking-wider text-muted mb-2">Signed in as</div>
        <div className="font-mono text-sm text-white">{user?.email}</div>
      </section>

      <section className="neo-card-brand p-5 mb-4">
        <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted mb-1">Credit balance</div>
            <div className={`flex items-center gap-2 ${low ? 'text-accent' : 'text-brand-light'}`}>
              <Coins className="w-6 h-6" />
              <span className="neo-price text-4xl">{credits}</span>
            </div>
          </div>
          <Link to="/pricing" className="neo-btn neo-btn-primary px-4 py-2.5 text-xs inline-flex items-center gap-2">
            <Plus className="w-4 h-4" /> Buy credits
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-4 pt-4 border-t-[3px] border-neo-border">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-brand-light" />
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted">Lifetime granted</div>
              <div className="text-lg font-extrabold text-white">{lifetimeGranted}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-subtle" />
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted">Lifetime used</div>
              <div className="text-lg font-extrabold text-white">{lifetimeConsumed}</div>
            </div>
          </div>
        </div>
        {low && (
          <p className="text-xs font-bold uppercase tracking-wider text-accent mt-4">
            Running low — top up to keep using AI features and exports.
          </p>
        )}
      </section>

      {tx.length > 0 && (
        <section className="neo-card p-5 mb-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted mb-3">Recent activity</div>
          <ul className="space-y-1">
            {tx.map((t) => (
              <li key={t.id} className="flex items-center justify-between py-1.5 border-b border-neo-border last:border-none">
                <div className="flex flex-col">
                  <span className="font-mono text-xs font-bold uppercase tracking-wide text-white">{t.action}</span>
                  <span className="text-[10px] text-subtle">{new Date(t.created_at).toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`font-mono text-sm font-bold ${t.delta > 0 ? 'text-brand-light' : 'text-muted'}`}>
                    {t.delta > 0 ? '+' : ''}{t.delta}
                  </span>
                  <span className="font-mono text-xs text-subtle w-10 text-right">{t.balance_after}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="neo-card p-5">
        <button onClick={async () => { await signOut(); navigate('/login'); }}
          className="neo-btn neo-btn-danger px-4 py-2.5 text-xs inline-flex items-center gap-2">
          <LogOut className="w-4 h-4" /> Sign out
        </button>
      </section>
    </div>
  );
}
