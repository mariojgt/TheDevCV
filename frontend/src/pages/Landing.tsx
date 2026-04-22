import { Link } from 'react-router-dom';
import { Sparkles, Target, Zap, FileCheck, ArrowRight, Check } from 'lucide-react';
import Logo from '../components/Logo';

const features = [
  { icon: FileCheck, title: '100% ATS-compliant',  copy: 'Single-column, semantic PDF output that every applicant-tracking system can parse.' },
  { icon: Target,    title: 'Tailored to each job', copy: 'Paste a job description, get a keyword-matched CV + cover letter in under a minute.' },
  { icon: Zap,       title: 'Smart field-level AI', copy: 'Quantify bullets, rewrite summaries, and strengthen verbs with one click.' },
  { icon: Sparkles,  title: 'Built for devs',       copy: 'Import from GitHub, Markdown, or an existing PDF. Everything is keyboard-friendly.' },
];

const freePerks = ['1 CV version', 'ATS score & gap analysis', 'PDF export (ATS template)', 'Unlimited edits & autosave'];
const proPerks  = ['Unlimited CV versions', 'AI tailor-to-job', 'Premium templates', 'Cover-letter generator', 'Job pipeline & analytics', 'Priority AI queue'];

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
                Start free — 1 CV <ArrowRight className="w-4 h-4" />
              </Link>
              <Link to="/pricing" className="neo-btn neo-btn-ghost px-6 py-3 text-sm">
                See Pro features
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

      {/* Pricing preview */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 pb-20">
        <h2 className="text-xl font-extrabold uppercase tracking-wide text-white mb-6 flex items-center gap-3">
          <span className="inline-block w-2 h-6 bg-brand rounded-sm" />
          Simple pricing
        </h2>
        <p className="text-sm text-muted mb-8 max-w-xl">
          Start free. Go Pro when you're job-hunting hard.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <PricingCard name="Free" price="£0" copy="Everything you need to ship one great CV." perks={freePerks} cta="Start free" href="/signup" />
          <PricingCard name="Pro"  price="£8" priceSuffix="/mo" copy="For active job hunters running multiple tracks." perks={proPerks} cta="Go Pro" href="/signup?plan=pro" highlighted />
        </div>
      </section>

      <footer className="border-t-[3px] border-neo-border py-8 text-center text-xs font-bold uppercase tracking-wider text-muted">
        The Dev CV — part of <a href="https://thedevrealm.com" className="text-brand-light hover:text-brand transition-colors">The Dev Realm</a>
      </footer>
    </div>
  );
}

function PricingCard({
  name, price, priceSuffix, copy, perks, cta, href, highlighted = false,
}: {
  name: string; price: string; priceSuffix?: string; copy: string; perks: string[]; cta: string; href: string; highlighted?: boolean;
}) {
  return (
    <div className={`${highlighted ? 'neo-card-brand' : 'neo-card'} p-6 overflow-hidden`}>
      {highlighted && (
        <div className="neo-header-bar -mx-6 -mt-6 mb-5">
          <span>Most popular</span>
          <span className="neo-tag neo-tag-accent text-[10px] -rotate-2">Pro</span>
        </div>
      )}
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="text-2xl font-extrabold uppercase tracking-wide text-white">{name}</h3>
        <span className="neo-price text-4xl">
          {price}
          {priceSuffix && <span className="text-base font-normal text-muted font-body normal-case ml-1">{priceSuffix}</span>}
        </span>
      </div>
      <p className="text-sm text-muted mb-5 mt-2">{copy}</p>
      <ul className="space-y-2 mb-6">
        {perks.map(p => (
          <li key={p} className="flex items-start gap-2 text-sm text-white">
            <Check className="w-4 h-4 text-brand-light shrink-0 mt-0.5" />
            <span>{p}</span>
          </li>
        ))}
      </ul>
      <Link to={href} className={`neo-btn ${highlighted ? 'neo-btn-primary' : 'neo-btn-ghost'} w-full px-5 py-3 text-sm`}>
        {cta}
      </Link>
    </div>
  );
}
