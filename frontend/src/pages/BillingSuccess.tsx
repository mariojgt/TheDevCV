import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle, Loader2, Coins } from 'lucide-react';
import Logo from '../components/Logo';
import { useApp } from '../contexts/AppContext';

/**
 * Reached after a successful Stripe checkout. The webhook credits the user
 * asynchronously, so we poll `refreshCredits` up to ~12s until the balance
 * grows past what we saw on this page's first render.
 */
export default function BillingSuccess() {
  const { credits, refreshCredits, creditsLoading } = useApp();
  const startingBalance = useRef<number | null>(null);
  const [ticks, setTicks] = useState(0);

  useEffect(() => {
    if (startingBalance.current === null && !creditsLoading) {
      startingBalance.current = credits;
    }
  }, [credits, creditsLoading]);

  const granted = startingBalance.current != null && credits > startingBalance.current;

  useEffect(() => {
    if (granted || ticks > 8) return;
    const t = setTimeout(() => { refreshCredits(); setTicks((n) => n + 1); }, 1500);
    return () => clearTimeout(t);
  }, [granted, ticks, refreshCredits]);

  const delta = startingBalance.current != null && granted ? credits - startingBalance.current : 0;

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full text-center">
        <div className="mb-6 inline-flex"><Logo size="lg" /></div>
        <div className="neo-card-brand p-8">
          {granted ? (
            <>
              <div className="w-14 h-14 rounded-md border-[3px] border-black bg-brand flex items-center justify-center mx-auto mb-4 shadow">
                <CheckCircle className="w-7 h-7 text-white" />
              </div>
              <h1 className="font-display text-3xl font-extrabold uppercase tracking-wide text-white mb-2">Credits added</h1>
              <div className="inline-flex items-center gap-2 mb-4">
                <span className="neo-price text-3xl">+{delta}</span>
                <Coins className="w-5 h-5 text-brand-light" />
              </div>
              <p className="text-sm text-muted mb-6">
                New balance: <strong className="text-white">{credits} credits</strong>. Spend them on CV creation, exports, ATS analysis, and AI tailoring.
              </p>
              <Link to="/" className="neo-btn neo-btn-primary px-5 py-3 text-sm inline-block">
                Open dashboard
              </Link>
            </>
          ) : (
            <>
              <Loader2 className="w-8 h-8 text-brand-light mx-auto animate-spin mb-4" />
              <h1 className="font-display text-xl font-extrabold uppercase tracking-wide text-white mb-2">Finalising your purchase</h1>
              <p className="text-sm text-muted">
                Stripe is letting us know — credits usually land in a few seconds.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
