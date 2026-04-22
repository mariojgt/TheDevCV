import { Coins, Loader2, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useApp } from '../contexts/AppContext';

/**
 * Compact credit-balance pill for the sidebar. Shows "… / loading" while the
 * RPC is in flight, a warning color when credits run low, and a mini "+" link
 * to /pricing so users can top up without leaving the screen they're on.
 */
export default function PlanBadge() {
  const { credits, creditsLoading } = useApp();

  const low = !creditsLoading && credits <= 3;

  return (
    <div className="inline-flex items-center gap-1">
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wider border transition-colors ${
          low
            ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
            : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
        }`}
        title={`${credits} credits remaining`}
      >
        {creditsLoading
          ? <Loader2 className="w-3 h-3 animate-spin" />
          : <Coins className="w-3 h-3" />}
        {creditsLoading ? '…' : credits}
      </span>
      <Link
        to="/pricing"
        title="Buy more credits"
        className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-emerald-400/40 hover:text-emerald-400 transition-colors"
      >
        <Plus className="w-3 h-3" />
      </Link>
    </div>
  );
}
