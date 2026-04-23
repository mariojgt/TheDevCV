import { Link } from 'react-router-dom';
import { Sparkles, Target, Zap, FileCheck, ArrowRight, Check, Code2 } from 'lucide-react';
import Logo from '../components/Logo';
import { CREDIT_COSTS } from '../lib/types';

const features = [
  { icon: FileCheck, title: '100% ATS-compliant',  copy: 'Single-column, semantic PDF output that every applicant-tracking system can parse.' },
  { icon: Target,    title: 'Tailored to each job', copy: 'Paste a job description, get a keyword-matched CV + cover letter in under a minute.' },
  { icon: Zap,       title: 'Smart field-level AI', copy: 'Quantify bullets, rewrite summaries, and strengthen verbs with one click.' },
  { icon: Sparkles,  title: 'Built for devs',       copy: 'Import from GitHub, Markdown, or an existing PDF. Everything is keyboard-friendly.' },
];

const packs: { credits: number; price: string; unit: string; tagline: string; highlighted?: boolean }[] = [
  { credits: 50,  price: '£5',  unit: '£0.10 / credit',  tagline: 'A couple of tailored applications.' },
  { credits: 200, price: '£15', unit: '£0.075 / credit', tagline: 'The sweet spot for an active hunt.', highlighted: true },
  { credits: 500, price: '£30', unit: '£0.06 / credit',  tagline: 'Career move, many tracks in flight.' },
];

const creditLegend: { cost: number; label: string }[] = [
  { cost: CREDIT_COSTS.create_cv,   label: 'Create a CV' },
  { cost: CREDIT_COSTS.export_pdf,  label: 'Export PDF' },
  { cost: CREDIT_COSTS.ai_improve,  label: 'AI rewrite a section' },
  { cost: CREDIT_COSTS.ats_score,   label: 'ATS gap analysis' },
  { cost: CREDIT_COSTS.ai_optimize, label: 'Optimise full CV' },
  { cost: CREDIT_COSTS.ai_tailor,   label: 'Tailor + cover letter' },
];

export default function Landing() {
  return (
    <div className="min-h-screen text-white">
      {/* Nav — 3px border bottom, uppercase links, neo CTA */}
      <header className="border-b-[3px] border-neo-border sticky top-0 z-40 bg-[#080d19]/90 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Logo />
          <nav className="flex items-center gap-1 sm:gap-3">
            <Link to="/pricing" className="hidden sm:inline-block text-xs font-bold uppercase tracking-wider text-muted hover:text-white px-3 py-2 transition-colors">
              Pricing
            </Link>
            <Link to="/login" className="text-xs font-bold uppercase tracking-wider text-muted hover:text-white px-3 py-2 transition-colors">
              Sign in
            </Link>
            <Link to="/signup" className="neo-btn neo-btn-primary px-4 py-2 text-xs">
              Start free
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero — neo-hero wrapper with diagonal stripes under the title */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-12 sm:pt-16">
        <div className="neo-hero rounded-md py-16 px-6 sm:px-10 text-center">
          <div className="relative z-10">
            <span className="neo-tag neo-tag-accent neo-tag-rotate mb-5 inline-block">
              <Sparkles className="inline-block w-3 h-3 mr-1 -mt-0.5" /> The Dev CV · v1
            </span>
            <h1 className="font-display text-5xl sm:text-6xl md:text-7xl font-extrabold uppercase tracking-wide text-white leading-[0.95] mb-6">
              Craft a CV that<br />
              <span className="hero-gradient-text animate-gradient-shift">ships past</span><br />
              every ATS filter.
            </h1>
            <p className="text-base sm:text-lg text-muted max-w-2xl mx-auto mb-8 normal-case">
              A fast, opinionated CV builder for developers. Drop in a job description, watch the AI tailor your
              experience, and export an ATS-compliant PDF in one click.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <Link to="/signup" className="neo-btn neo-btn-primary px-6 py-3 text-sm inline-flex items-center gap-2">
                Start with 10 free credits <ArrowRight className="w-4 h-4" />
              </Link>
              <Link to="/pricing" className="neo-btn neo-btn-ghost px-6 py-3 text-sm">
                See pricing
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Features — neo cards with brand icon frames */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
        <h2 className="text-xl font-extrabold uppercase tracking-wide text-white mb-6 flex items-center gap-3">
          <span className="inline-block w-2 h-6 bg-brand rounded-sm" />
          Why The Dev CV
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {features.map(({ icon: Icon, title, copy }) => (
            <div key={title} className="neo-card p-6">
              <div className="w-12 h-12 rounded-md border-[3px] border-black bg-brand flex items-center justify-center text-white mb-4 shadow-[3px_3px_0_#000]">
                <Icon className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-extrabold uppercase tracking-wide text-white mb-2">{title}</h3>
              <p className="text-sm text-muted">{copy}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing — credit packs, dev-to-dev honest pricing */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-20">
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <span className="inline-block w-2 h-6 bg-brand rounded-sm" />
          <h2 className="text-xl font-extrabold uppercase tracking-wide text-white">
            Pay as you go
          </h2>
          <span className="neo-tag neo-tag-accent text-[10px] -rotate-2 inline-flex items-center gap-1">
            <Code2 className="w-3 h-3" /> By a dev, for devs
          </span>
        </div>
        <p className="text-sm text-muted mb-8 max-w-2xl">
          No subscription. No expiry. No feature paywalls. You get{' '}
          <strong className="text-brand-light">10 free credits</strong> on signup — enough to
          build, polish, and export your first CV. Top up only when you're actively hunting.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-6">
          {packs.map(p => <PackCard key={p.credits} {...p} />)}
        </div>

        <div className="neo-card p-5">
          <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-muted mb-3">
            What credits buy
          </div>
          <ul className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 text-sm text-white">
            {creditLegend.map(item => (
              <li key={item.label} className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-brand-light tabular-nums min-w-7">
                  {item.cost}c
                </span>
                <span className="text-muted">{item.label}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <footer className="border-t-[3px] border-neo-border py-8 text-center text-xs font-bold uppercase tracking-wider text-muted">
        The Dev CV — part of <a href="https://thedevrealm.com" className="text-brand-light hover:text-brand transition-colors">The Dev Realm</a>
      </footer>
    </div>
  );
}

function PackCard({
  credits, price, unit, tagline, highlighted = false,
}: {
  credits: number; price: string; unit: string; tagline: string; highlighted?: boolean;
}) {
  return (
    <div className={`${highlighted ? 'neo-card-brand' : 'neo-card'} p-6 overflow-hidden flex flex-col`}>
      {highlighted && (
        <div className="neo-header-bar -mx-6 -mt-6 mb-5">
          <span>Best value</span>
          <span className="neo-tag neo-tag-accent text-[10px] -rotate-2">Popular</span>
        </div>
      )}
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="text-xl font-extrabold uppercase tracking-wide text-white">{credits} credits</h3>
        <span className="neo-price text-4xl">{price}</span>
      </div>
      <div className="text-[11px] font-mono uppercase tracking-wider text-muted mb-3">{unit}</div>
      <p className="text-sm text-muted mb-5">{tagline}</p>
      <ul className="space-y-2 mb-6 text-sm text-white">
        <li className="flex items-center gap-2">
          <Check className="w-4 h-4 text-brand-light shrink-0" />
          <span>~{Math.floor(credits / CREDIT_COSTS.ai_tailor)} full tailor-to-job runs</span>
        </li>
        <li className="flex items-center gap-2">
          <Check className="w-4 h-4 text-brand-light shrink-0" />
          <span>~{Math.floor(credits / CREDIT_COSTS.ai_optimize)} full CV optimisations</span>
        </li>
        <li className="flex items-center gap-2">
          <Check className="w-4 h-4 text-brand-light shrink-0" />
          <span>Never expires</span>
        </li>
      </ul>
      <Link
        to="/signup"
        className={`neo-btn ${highlighted ? 'neo-btn-primary' : 'neo-btn-ghost'} w-full px-5 py-3 text-sm mt-auto`}
      >
        Start free — top up later
      </Link>
    </div>
  );
}
