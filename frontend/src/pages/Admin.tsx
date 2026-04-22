import { useEffect, useMemo, useState } from 'react';
import { Coins, Loader2, Search, Shield, ShieldOff, Plus, Minus, X, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useToast } from '../components/ui/Toast';
import { useAuth } from '../contexts/AuthContext';

interface AdminUserRow {
  user_id: string;
  email: string;
  signup_at: string;
  balance: number;
  lifetime_granted: number;
  lifetime_consumed: number;
  cv_count: number;
  job_count: number;
  stripe_customer_id: string;
  is_admin: boolean;
}

interface AdminTxRow {
  id: number;
  action: string;
  delta: number;
  balance_after: number;
  reference: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export default function Admin() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<AdminUserRow | null>(null);
  const [drawerTx, setDrawerTx] = useState<AdminTxRow[]>([]);
  const [drawerLoading, setDrawerLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('admin_list_users');
    if (error) {
      toast(error.message ?? 'Failed to load users', 'error');
      setRows([]);
    } else {
      setRows((data as AdminUserRow[]) ?? []);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.email?.toLowerCase().includes(q) || r.user_id.includes(q));
  }, [rows, query]);

  const grant = async (row: AdminUserRow, amount: number) => {
    const reason = window.prompt(`Reason for ${amount > 0 ? 'granting' : 'deducting'} ${Math.abs(amount)} credits to ${row.email}? (optional)`) ?? '';
    setBusy(row.user_id);
    try {
      const { data, error } = await supabase.rpc('admin_adjust_credits', {
        p_target_user_id: row.user_id,
        p_delta: amount,
        p_reason: reason || null,
      });
      if (error) throw error;
      toast(`New balance for ${row.email}: ${data}`, 'success');
      await load();
      if (drawer?.user_id === row.user_id) await openDrawer({ ...row, balance: data as number });
    } catch (err: any) {
      toast(err?.message ?? 'Adjust failed', 'error');
    } finally {
      setBusy(null);
    }
  };

  const customGrant = async (row: AdminUserRow) => {
    const raw = window.prompt(`Grant how many credits to ${row.email}? (negative deducts)`);
    if (!raw) return;
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n === 0) { toast('Enter a non-zero integer', 'error'); return; }
    await grant(row, n);
  };

  const toggleAdmin = async (row: AdminUserRow) => {
    const makeAdmin = !row.is_admin;
    if (!makeAdmin && row.user_id === user?.id) { toast('You cannot demote yourself.', 'error'); return; }
    if (!window.confirm(`${makeAdmin ? 'Promote' : 'Demote'} ${row.email}?`)) return;
    setBusy(row.user_id);
    try {
      const { error } = await supabase.rpc('admin_toggle_admin', {
        p_target_user_id: row.user_id,
        p_make_admin: makeAdmin,
      });
      if (error) throw error;
      toast(`${row.email} is ${makeAdmin ? 'now an admin' : 'no longer an admin'}.`, 'success');
      await load();
    } catch (err: any) {
      toast(err?.message ?? 'Toggle failed', 'error');
    } finally {
      setBusy(null);
    }
  };

  const openDrawer = async (row: AdminUserRow) => {
    setDrawer(row);
    setDrawerLoading(true);
    const { data, error } = await supabase.rpc('admin_list_transactions', {
      p_target_user_id: row.user_id,
      p_limit: 50,
    });
    if (error) {
      toast(error.message, 'error');
      setDrawerTx([]);
    } else {
      setDrawerTx((data as AdminTxRow[]) ?? []);
    }
    setDrawerLoading(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
                <Shield className="w-6 h-6 text-brand-light" /> Admin
          </h1>
          <p className="text-sm text-muted">Manage users and credit balances.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search email or user id…"
              className="neo-input pl-8 pr-3 py-2 text-sm w-64"
            />
          </div>
          <button onClick={load} disabled={loading}
            title="Refresh"
            className="neo-btn neo-btn-ghost p-2 disabled:opacity-50">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div className="neo-table overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wider text-muted">
            <tr>
              <th className="text-left px-4 py-2 font-extrabold">User</th>
              <th className="text-right px-3 py-2 font-extrabold">Balance</th>
              <th className="text-right px-3 py-2 font-extrabold">Granted</th>
              <th className="text-right px-3 py-2 font-extrabold">Used</th>
              <th className="text-right px-3 py-2 font-extrabold">CVs</th>
              <th className="text-right px-3 py-2 font-extrabold">Jobs</th>
              <th className="text-right px-3 py-2 font-extrabold">Signed up</th>
              <th className="text-right px-3 py-2 font-extrabold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="text-center py-8"><Loader2 className="w-5 h-5 animate-spin mx-auto text-emerald-400" /></td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-8 text-sm text-muted">No users match that filter.</td></tr>
            ) : filtered.map((row) => (
              <tr key={row.user_id} className="border-t-[3px] border-neo-border hover:bg-surface-light transition-colors">
                <td className="px-4 py-2">
                  <button onClick={() => openDrawer(row)} className="text-left">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white">{row.email || '(no email)'}</span>
                      {row.is_admin && <Shield className="w-3 h-3 text-brand-light" />}
                    </div>
                    <div className="text-[10px] font-mono text-subtle">{row.user_id}</div>
                  </button>
                </td>
                <td className={`text-right px-3 py-2 font-mono ${row.balance <= 3 ? 'text-accent' : 'text-brand-light'}`}>{row.balance}</td>
                <td className="text-right px-3 py-2 font-mono text-muted">{row.lifetime_granted}</td>
                <td className="text-right px-3 py-2 font-mono text-muted">{row.lifetime_consumed}</td>
                <td className="text-right px-3 py-2 font-mono text-muted">{row.cv_count}</td>
                <td className="text-right px-3 py-2 font-mono text-muted">{row.job_count}</td>
                <td className="text-right px-3 py-2 text-xs text-muted">{new Date(row.signup_at).toLocaleDateString()}</td>
                <td className="text-right px-3 py-2">
                  <div className="inline-flex items-center gap-1">
                    <button onClick={() => grant(row, 10)} disabled={busy === row.user_id}
                      title="Grant 10 credits"
                      className="neo-btn neo-btn-primary text-[11px] px-2 py-1 inline-flex items-center gap-0.5 disabled:opacity-50">
                      <Plus className="w-3 h-3" /> 10
                    </button>
                    <button onClick={() => customGrant(row)} disabled={busy === row.user_id}
                      title="Grant custom amount"
                      className="neo-btn neo-btn-ghost text-[11px] px-2 py-1 inline-flex items-center disabled:opacity-50">
                      <Coins className="w-3 h-3" />
                    </button>
                    <button onClick={() => toggleAdmin(row)} disabled={busy === row.user_id || (row.is_admin && row.user_id === user?.id)}
                      title={row.is_admin ? 'Demote' : 'Promote to admin'}
                      className={`neo-btn text-[11px] px-2 py-1 inline-flex items-center disabled:opacity-50 ${row.is_admin ? 'neo-btn-accent' : 'neo-btn-ghost'}`}>
                      {row.is_admin ? <ShieldOff className="w-3 h-3" /> : <Shield className="w-3 h-3" />}
                    </button>
                    {busy === row.user_id && <Loader2 className="w-3 h-3 animate-spin text-brand-light" />}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Ledger drawer */}
      {drawer && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setDrawer(null)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative w-full max-w-md h-full bg-surface border-l-[3px] border-neo-border overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b-[3px] border-neo-border flex items-start justify-between">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted mb-1">Ledger</div>
                <div className="text-sm font-bold text-white">{drawer.email}</div>
                <div className="text-[10px] font-mono text-subtle">{drawer.user_id}</div>
                <div className="mt-3 inline-flex items-center gap-2 text-sm">
                  <Coins className="w-4 h-4 text-brand-light" />
                  <span className="font-mono text-brand-light">{drawer.balance}</span>
                  <span className="text-muted text-xs">balance · {drawer.lifetime_granted} granted · {drawer.lifetime_consumed} used</span>
                </div>
              </div>
              <button onClick={() => setDrawer(null)} className="neo-btn neo-btn-ghost p-1"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 flex gap-2">
              <button onClick={() => grant(drawer, 10)} className="neo-btn neo-btn-primary text-xs px-3 py-1.5 inline-flex items-center gap-1">
                <Plus className="w-3 h-3" /> Grant 10
              </button>
              <button onClick={() => grant(drawer, 50)} className="neo-btn neo-btn-primary text-xs px-3 py-1.5 inline-flex items-center gap-1">
                <Plus className="w-3 h-3" /> Grant 50
              </button>
              <button onClick={() => customGrant(drawer)} className="neo-btn neo-btn-ghost text-xs px-3 py-1.5 inline-flex items-center gap-1">
                <Coins className="w-3 h-3" /> Custom
              </button>
              <button onClick={() => grant(drawer, -1)} className="neo-btn neo-btn-danger text-xs px-3 py-1.5 inline-flex items-center gap-1">
                <Minus className="w-3 h-3" /> -1
              </button>
            </div>
            <div className="px-5 pb-5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted mb-2">Recent transactions</div>
              {drawerLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="w-4 h-4 animate-spin text-emerald-400" /></div>
              ) : drawerTx.length === 0 ? (
                <p className="text-sm text-muted">No transactions yet.</p>
              ) : (
                <ul className="space-y-1.5">
                  {drawerTx.map((t) => (
                    <li key={t.id} className="flex items-center justify-between text-sm py-1 border-b-[3px] border-neo-border last:border-0">
                      <div className="flex flex-col">
                        <span className="font-mono text-xs font-bold uppercase tracking-wide text-white">{t.action}</span>
                        <span className="text-[10px] text-muted">{new Date(t.created_at).toLocaleString()}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`font-mono text-sm font-bold ${t.delta > 0 ? 'text-brand-light' : 'text-red-400'}`}>
                          {t.delta > 0 ? '+' : ''}{t.delta}
                        </span>
                        <span className="font-mono text-xs text-subtle w-10 text-right">{t.balance_after}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
