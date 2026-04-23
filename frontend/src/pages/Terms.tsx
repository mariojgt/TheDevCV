import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

/**
 * Terms of Service. Drafted to cover the actual product surface (CV
 * builder, AI features, job tracker, portfolio export, credits via Stripe)
 * but MUST be reviewed by a lawyer before public launch. Placeholders are
 * marked {{TODO …}} — in particular the legal entity, governing law, and
 * contact address.
 */
export default function Terms() {
  return (
    <main className="mx-auto max-w-3xl px-4 sm:px-6 py-10 sm:py-14">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted hover:text-white mb-6"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back
      </Link>

      <h1 className="font-display text-3xl sm:text-4xl font-extrabold uppercase tracking-wide text-white mb-2">
        Terms of Service
      </h1>
      <p className="text-xs text-subtle mb-10">
        Last updated: {new Date().toISOString().slice(0, 10)}
      </p>

      <Section title="1. Agreement">
        <P>
          These Terms govern your use of The Dev CV (the "Service") operated by{' '}
          <strong>{'{{TODO: legal entity name}}'}</strong> ("we", "us"). By
          creating an account or using the Service you agree to these Terms. If
          you don't agree, don't use the Service.
        </P>
      </Section>

      <Section title="2. The Service">
        <P>
          The Service is a CV-building tool with AI-assisted drafting, tailoring,
          cover-letter generation, a job-application tracker, public CV share
          links, and an HTML portfolio export. Features may be added, changed,
          or removed at our discretion; we aim to give reasonable notice for
          breaking changes.
        </P>
      </Section>

      <Section title="3. Eligibility and accounts">
        <P>
          You must be at least 16 years old to use the Service. You are
          responsible for keeping your login credentials secure and for all
          activity under your account. Notify us promptly if you suspect
          unauthorised access.
        </P>
      </Section>

      <Section title="4. Credits and billing">
        <P>
          The Service runs on a credit model. Every account starts with a free
          allowance; additional credits are purchased via Stripe. Current pricing
          is on the <Link to="/pricing" className="link">pricing page</Link> and
          may change prospectively.
        </P>
        <ul className="space-y-1.5 text-sm text-muted list-disc pl-5 leading-relaxed">
          <li>Credits are consumed when you trigger a billable action (create CV, export PDF, AI improve, AI optimize, AI tailor, portfolio export, etc.).</li>
          <li>Consumed credits are non-refundable.</li>
          <li>Unused credits do not expire but are non-transferrable and non-redeemable for cash.</li>
          <li>If a billable action fails due to our error we will refund the credit automatically.</li>
        </ul>
        <P>
          Stripe processes all payments under its own terms; we never see or
          store your card details.
        </P>
      </Section>

      <Section title="5. AI features — your responsibility">
        <P>
          AI output is generated on demand and we do not review it before it
          reaches you. AI-produced CV content, cover letters, and interview
          answers are suggestions, not guarantees of accuracy, employability, or
          tone. <strong>You are responsible for reviewing every AI output before
          sending it to a recruiter or using it professionally.</strong>
        </P>
        <P>
          You agree not to use the AI features to fabricate qualifications,
          experience, companies, metrics, or credentials. Our prompts instruct
          the model to synthesise only what you've written, but nothing prevents
          you from entering false input.
        </P>
      </Section>

      <Section title="6. Acceptable use">
        <P>You agree not to:</P>
        <ul className="space-y-1.5 text-sm text-muted list-disc pl-5 leading-relaxed">
          <li>Abuse the AI or export endpoints (scripted credit consumption, scraping for another tool, etc.).</li>
          <li>Upload content that infringes someone else's rights (copyrighted resumes, private data belonging to others, etc.).</li>
          <li>Use the public share links (<code>/s/:token</code>) to host illegal, harmful, or defamatory content.</li>
          <li>Attempt to probe, break, or bypass our security or row-level access controls.</li>
          <li>Resell the Service or offer it to third parties as a substitute for an account they should hold themselves.</li>
        </ul>
        <P>
          We may suspend or terminate accounts that materially breach this
          section, with or without notice depending on severity.
        </P>
      </Section>

      <Section title="7. Your content, your ownership">
        <P>
          You retain full ownership of every CV, cover letter, portfolio,
          description, and piece of content you create in the Service. By using
          the Service you grant us a limited licence to host, transmit, process,
          and display your content solely to operate and improve the Service —
          never to sell, train models on, or otherwise commercialise it.
        </P>
        <P>
          You can export or delete your content at any time via the editor and
          account settings.
        </P>
      </Section>

      <Section title="8. Public share links">
        <P>
          When you flip a CV to "shared", anyone with the token URL can view it.
          The URL contains a 32-character random token so it is only discoverable
          by those you send it to, but it is not password-protected. Rotate the
          token or disable sharing to revoke access.
        </P>
      </Section>

      <Section title="9. Third-party services">
        <P>
          The Service integrates with Anthropic (Claude), Stripe, Supabase,
          GitHub's public API, Microsoft Clarity (optional analytics), and
          public job-aggregator APIs (Remotive, RemoteOK, Arbeitnow). Each has
          its own terms; using the Service implies acceptance of theirs as they
          apply to the processed data. See the{' '}
          <Link to="/privacy" className="link">Privacy Policy</Link> for details.
        </P>
      </Section>

      <Section title="10. Availability and service levels">
        <P>
          We do our best to keep the Service online, but offer no SLA. We may
          perform planned maintenance with reasonable notice and unplanned
          maintenance without notice when critical. You accept the Service on
          an "as is" and "as available" basis.
        </P>
      </Section>

      <Section title="11. Disclaimers">
        <P>
          To the maximum extent permitted by law, the Service and all its output
          are provided without warranty of any kind, express or implied. We do
          not warrant that AI suggestions will land you a job, that the PDF
          output will pass every ATS, or that the Service will be uninterrupted
          or error-free.
        </P>
      </Section>

      <Section title="12. Limitation of liability">
        <P>
          To the maximum extent permitted by law, our aggregate liability for
          any claim arising out of or relating to the Service is limited to the
          greater of (a) the amount you paid us in the twelve months before the
          claim arose, or (b) £50. We are not liable for indirect, incidental,
          consequential, or loss-of-profit damages. Nothing in these Terms
          limits liability that cannot be limited under applicable law.
        </P>
      </Section>

      <Section title="13. Termination">
        <P>
          You can delete your account at any time from the Account page. We may
          suspend or terminate accounts for material breach of these Terms or
          extended inactivity. Credits purchased are not refunded on termination
          caused by your breach; we will offer a pro-rated refund if we
          terminate for our own convenience.
        </P>
      </Section>

      <Section title="14. Changes to these terms">
        <P>
          We may update these Terms. Material changes will be announced in-app
          or by email. Continued use of the Service after the effective date
          constitutes acceptance of the updated Terms.
        </P>
      </Section>

      <Section title="15. Governing law">
        <P>
          These Terms are governed by the laws of{' '}
          <strong>{'{{TODO: e.g. England and Wales}}'}</strong>, and any dispute
          will be resolved exclusively in the courts of{' '}
          <strong>{'{{TODO: jurisdiction}}'}</strong>, without affecting any
          mandatory consumer-protection rights you may have under the law of
          your country of residence.
        </P>
      </Section>

      <Section title="16. Contact">
        <P>
          Questions about these Terms:{' '}
          <a className="link" href="mailto:{{TODO:legal@example.com}}">
            {'{{TODO: legal@thedevrealm.com}}'}
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
