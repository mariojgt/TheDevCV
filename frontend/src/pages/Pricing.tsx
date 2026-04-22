import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { Check, Loader2, Sparkles, Coins } from 'lucide-react';
import Logo from '../components/Logo';
import { useAuth } from '../contexts/AuthContext';
import { useApp } from '../contexts/AppContext';
import { supabase } from '../lib/supabase';
import { useToast } from '../components/ui/Toast';
import { CREDIT_COSTS } from '../lib/types';

type PackId = 'small' | 'medium' | 'large';

const PACKS: { id: PackId; credits: number; price: string; unitPrice: string; highlight?: boolean }[] = [
  { id: 'small',  credits: 50,  price: '£5',  unitPrice: '£0.10 per credit' },
  { id: 'medium', credits: 200, price: '£15', unitPrice: '£0.075 per credit', highlight: true },
  { id: 'large',  credits: 500, price: '£30', unitPrice: '£0.06 per credit' },
];

const perks = [
  { label: `Create a CV version — ${CREDIT_COSTS.create_cv} credit`,    detail: 'Save as many polished CVs as your balance allows.' },
  { label: `Export to PDF — ${CREDIT_COSTS.export_pdf} credit`,         detail: 'Downloads the current template as an ATS-safe PDF.' },
  { label: `ATS gap analysis — ${CREDIT_COSTS.ats_score} credits`,      detail: 'Score your CV against a real job post and see the gaps.' },
  { label: `AI improve a section — ${CREDIT_COSTS.ai_improve} credit`,  detail: 'Rewrite a bullet or summary with Claude.' },
  { label: `AI optimise full CV — ${CREDIT_COSTS.ai_optimize} credits`, detail: 'Scan the whole CV and return 10–15 suggestions.' },
  { label: `AI tailor to a job — ${CREDIT_COSTS.ai_tailor} credits`,    detail: 'Full rewrite + cover letter + tracked application.' },
];

export default function Pricing() {
  const { user } = useAuth();
  const { credits } = useApp();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState<PackId | null>(null);

  const buy = async (pack: PackId) => {
    if (!user) { navigate('/signup?redirect=/pricing'); return; }
    setLoading(pack);
    try {
      const { data, error } = await supabase.functions.invoke('stripe-checkout', { body: { pack } });
      if (error) throw error;
      const url = (data as { url?: string } | null)?.url;
      if (!url) throw new Error('Missing checkout URL');
      window.location.href = url;
    } catch (err: any) {
      toast(err?.message ?? 'Could not start checkout', 'error');
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen text-white">
      <header className="border-b-[3px] border-neo-border sticky top-0 z-40 bg-[#080d19]/90 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/"><Logo /></Link>
          <nav className="flex items-center gap-2 sm:gap-3">
            {user ? (
              <>
                <span className="neo-tag neo-tag-brand inline-flex items-center gap-1">
                  <Coins className="w-3 h-3" /> {credits} credits
                </span>
                <Link to="/" className="neo-btn neo-btn-primary px-4 py-2 text-xs">Dashboard</Link>
              </>
            ) : (
              <>
                <Link to="/login" className="text-xs font-bold uppercase tracking-wider text-muted hover:text-white px-3 py-2 transition-colors">Sign in</Link>
                <Link to="/signup" className="neo-btn neo-btn-primary px-4 py-2 text-xs">Start free</Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-14">
        <div className="text-center mb-12">
          <h1 className="font-display text-4xl sm:text-5xl font-extrabold uppercase tracking-wide text-white mb-4">
            Top up your<br /><span className="hero-gradient-text">credits</span>
          </h1>
          <p className="text-muted max-w-xl mx-auto text-sm">
            Every new account starts with <strong className="text-brand-light">10 free credits</strong>.
            Buy a pack whenever you're running low — no subscription, credits never expire.
          </p>
        </div>

        {/* Packs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-14">
          {PACKS.map((pack) => (
            <div key={pack.id} className={`${pack.highlight ? 'neo-card-brand' : 'neo-card'} p-6 flex flex-col relative`}>
              {pack.highlight && (
                <span className="neo-tag neo-tag-accent neo-tag-rotate absolute -top-3 left-4">
                  <Sparkles className="w-3 h-3 inline -mt-0.5 mr-0.5" /> Best value
                </span>
              )}
              <div className="flex items-center gap-2 mb-1 mt-1">
                <Coins className="w-5 h-5 text-brand-light" />
                <h3 className="text-xl font-extrabold uppercase tracking-wide text-white">{pack.credits} credits</h3>
              </div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-subtle mb-5">{pack.unitPrice}</p>
              <span className="neo-price text-4xl mb-1">{pack.price}</span>
              <p className="text-xs text-muted mt-3 mb-5">One-time purchase · VAT handled at checkout</p>

              <ul className="space-y-2 mb-6 flex-1 text-sm">
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-brand-light" /> ~{Math.floor(pack.credits / CREDIT_COSTS.ai_tailor)} full AI tailor-to-job runs</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-brand-light" /> ~{Math.floor(pack.credits / CREDIT_COSTS.ai_optimize)} full CV optimisations</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-brand-light" /> ~{Math.floor(pack.credits / CREDIT_COSTS.ats_score)} ATS gap analyses</li>
              </ul>

              <button
                onClick={() => buy(pack.id)}
                disabled={loading !== null}
                className={`neo-btn ${pack.highlight ? 'neo-btn-primary' : 'neo-btn-ghost'} w-full px-5 py-3 text-sm inline-flex items-center gap-2`}
              >
                {loading === pack.id && <Loader2 className="w-4 h-4 animate-spin" />}
                Buy {pack.credits} credits
              </button>
            </div>
          ))}
        </div>

        <div className="neo-card p-6">
          <h2 className="font-display text-xl font-extrabold uppercase tracking-wide text-white mb-5 flex items-center gap-3">
            <span className="inline-block w-2 h-6 bg-brand rounded-sm" />
            What do credits get me?
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {perks.map((p) => (
              <div key={p.label} className="flex items-start gap-3">
                <Coins className="w-4 h-4 text-brand-light mt-0.5 shrink-0" />
                <div>
                  <div className="text-sm font-bold text-white">{p.label}</div>
                  <div className="text-xs text-muted mt-0.5">{p.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-center text-[11px] font-bold uppercase tracking-wider text-subtle mt-10">
          Payments by Stripe · Credits never expire · Failed AI calls auto-refund
        </p>
      </section>
    </div>
  );
}
