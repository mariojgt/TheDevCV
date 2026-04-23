import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { openCookiePreferences } from '../components/CookieBanner';

/**
 * Privacy Policy page. The content is drafted to match what the app
 * actually does with user data (auth via Supabase, payments via Stripe,
 * AI via Anthropic, analytics via Microsoft Clarity, etc.) but a lawyer
 * should still review before launch. Placeholders are marked {{TODO …}}.
 */
export default function Privacy() {
  return (
    <main className="mx-auto max-w-3xl px-4 sm:px-6 py-10 sm:py-14">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted hover:text-white mb-6"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back
      </Link>

      <h1 className="font-display text-3xl sm:text-4xl font-extrabold uppercase tracking-wide text-white mb-2">
        Privacy Policy
      </h1>
      <p className="text-xs text-subtle mb-10">
        Last updated: {new Date().toISOString().slice(0, 10)}
      </p>

      <Section title="1. Who we are">
        <P>
          The Dev CV ("we", "us", "our") is a CV-building service operated by
          <strong> {'{{TODO: legal entity name}}'}</strong>, reachable at{' '}
          <a className="link" href="mailto:{{TODO:contact@example.com}}">
            {'{{TODO: privacy@thedevrealm.com}}'}
          </a>.
          We act as the <strong>data controller</strong> for information you enter
          into the product, and the <strong>data processor</strong> for CVs you
          choose to share publicly via <code>/s/:token</code> share links.
        </P>
      </Section>

      <Section title="2. What we collect">
        <P><strong>Account data</strong> — email, name (optional), and an OAuth
        identifier when you sign in with Google. Stored in our Supabase project.</P>
        <P><strong>CV content</strong> — every field you type in the editor:
        profile, summary, experience, education, skills, projects, certifications,
        languages. Stored encrypted-at-rest in Supabase Postgres.</P>
        <P><strong>Job tracker data</strong> — companies, positions, statuses,
        notes, interview dates, and recruiter contacts you add to the tracker.</P>
        <P><strong>Billing data</strong> — Stripe customer ID and the purchase
        history of credit packs. Card details never touch our servers; they are
        handled by Stripe directly.</P>
        <P><strong>Behavioural analytics (opt-in only)</strong> — when you accept
        cookies we load Microsoft Clarity, which records anonymised session replays,
        heatmaps, and click patterns so we can improve the product. Clarity masks
        input fields by default. No recording occurs if you decline cookies.</P>
        <P><strong>Technical logs</strong> — standard server access logs
        (IP address, user agent, request path) kept for debugging and abuse prevention.
        Retained for 30 days.</P>
      </Section>

      <Section title="3. How we use it">
        <ul className="space-y-1.5 text-sm text-muted list-disc pl-5 leading-relaxed">
          <li>Show you your CVs, job applications, and settings.</li>
          <li>Generate ATS-compliant PDFs, JSON Resume, plain-text, and portfolio HTML exports on your request.</li>
          <li>Call Anthropic's Claude API on your behalf when you use AI features (Draft, Beautify, Optimize, Tailor, cover-letter, interview prep). Your CV content is sent as prompt context; Anthropic does not retain prompts for training when we call via the API per their published policy.</li>
          <li>Charge credit packs via Stripe and keep a ledger of consumption.</li>
          <li>Fetch public repo metadata from GitHub's unauthenticated API when you import a repo URL (no personal data sent, just the URL).</li>
          <li>Show public job listings via Remotive, RemoteOK, and Arbeitnow (fetched server-side; your identity is not transmitted).</li>
        </ul>
      </Section>

      <Section title="4. AI processing">
        <P>
          AI features are optional. When you use them, the relevant portion of
          your CV is sent to <strong>Anthropic</strong> (Claude) via our backend
          edge function — your browser never holds the API key. Anthropic processes
          the prompt to generate a response and does not use API-submitted content
          to train their models (see Anthropic's
          {' '}<a className="link" href="https://www.anthropic.com/legal/privacy" rel="noopener" target="_blank">privacy policy</a>).
          You can use the app without AI features and never have CV content leave
          our infrastructure.
        </P>
      </Section>

      <Section title="5. Cookies and local storage">
        <P><strong>Essential cookies</strong> — Supabase sets an auth cookie to
        keep you signed in. Without it the app cannot function.</P>
        <P><strong>Preference storage</strong> — we use your browser's
        <code> localStorage</code> to remember your cookie-consent choice, the
        currently-open CV editor tab, your autosave indicator state, and similar
        UI preferences. This data never leaves your device.</P>
        <P><strong>Analytics (opt-in)</strong> — Microsoft Clarity cookies load
        only if you select "Accept analytics" in the banner. You can revoke this
        choice at any time from the footer.</P>
        <P>
          <button type="button" onClick={openCookiePreferences} className="link underline">
            Open cookie preferences →
          </button>
        </P>
      </Section>

      <Section title="6. Who we share data with">
        <P>We share only the minimum necessary with these processors:</P>
        <ul className="space-y-1.5 text-sm text-muted list-disc pl-5 leading-relaxed">
          <li><strong>Supabase</strong> (EU-hosted Postgres + auth) — hosts your account and CV data.</li>
          <li><strong>Stripe</strong> (PCI-compliant payments) — processes purchases, holds card data.</li>
          <li><strong>Anthropic</strong> (Claude API) — receives AI prompt payloads only when you use AI features.</li>
          <li><strong>Microsoft Clarity</strong> (product analytics) — anonymised session data, only after you consent.</li>
          <li><strong>GitHub</strong> / <strong>Remotive</strong> / <strong>RemoteOK</strong> / <strong>Arbeitnow</strong> — public APIs only; no user data is transmitted.</li>
        </ul>
        <P className="mt-3">We never sell your data, never share it for advertising, and never hand it to third parties except where legally compelled or to the processors above.</P>
      </Section>

      <Section title="7. International transfers">
        <P>
          Some processors (Anthropic, Stripe, Microsoft) are headquartered in the
          United States. Where applicable, transfers rely on the EU's Standard
          Contractual Clauses and the UK International Data Transfer Addendum.
          {' '}{'{{TODO: confirm SCC/UK-IDTA signed with each processor}}'}.
        </P>
      </Section>

      <Section title="8. Your rights">
        <P>If you are in the UK or EU you can at any time:</P>
        <ul className="space-y-1.5 text-sm text-muted list-disc pl-5 leading-relaxed">
          <li>Access a copy of the personal data we hold about you.</li>
          <li>Correct inaccurate data (most fields are editable directly in the app).</li>
          <li>Delete your account and all associated data (email <a className="link" href="mailto:{{TODO:privacy@example.com}}">{'{{TODO: privacy@thedevrealm.com}}'}</a>).</li>
          <li>Export your data (use the JSON Resume or plain-text export in the CV editor's Design tab).</li>
          <li>Withdraw consent to analytics (cookie preferences in the footer).</li>
          <li>Lodge a complaint with the UK ICO or your local data authority.</li>
        </ul>
      </Section>

      <Section title="9. Data retention">
        <P>Account and CV data is retained while your account is active. Deleted
        CVs are purged immediately. When you delete your account all data is
        erased within 30 days, except where we are legally required to retain
        records (e.g. financial transactions for up to 7 years).</P>
      </Section>

      <Section title="10. Security">
        <P>
          Data is encrypted at rest (Supabase) and in transit (TLS). AI calls go
          through a server-side proxy so the Anthropic key is never exposed to
          the browser. Row-level security policies scope every database read and
          write to your own rows. We do not store any third-party API keys on
          your behalf.
        </P>
      </Section>

      <Section title="11. Children">
        <P>The service is not intended for children under 16. If you are under 16, please do not use the product or create an account.</P>
      </Section>

      <Section title="12. Changes to this policy">
        <P>We will update the "last updated" date above when this policy changes. Material changes (new processors, new purposes) will be announced via an in-app notice or email.</P>
      </Section>

      <Section title="13. Contact">
        <P>
          Privacy questions or data-subject requests:{' '}
          <a className="link" href="mailto:{{TODO:privacy@example.com}}">
            {'{{TODO: privacy@thedevrealm.com}}'}
          </a>.
        </P>
      </Section>

      <p className="text-[10px] text-subtle mt-12 border-t border-neo-border pt-4">
        Draft reviewed by {'{{TODO: legal counsel}}'} on {'{{TODO: date}}'}. This document is a working template and not a substitute for legal advice.
      </p>

      <style>{`
        .link { color: var(--color-brand-light, #2bb885); text-decoration: none; }
        .link:hover { color: var(--color-brand, #0d9668); text-decoration: underline; }
        code { background: rgba(200, 214, 232, 0.08); padding: 1px 6px; border-radius: 3px; font-size: 11px; }
      `}</style>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-sm sm:text-base font-extrabold uppercase tracking-wide text-white mb-3 pb-1.5 border-b-2 border-neo-border">
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function P({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <p className={`text-sm text-muted leading-relaxed ${className}`}>{children}</p>;
}
