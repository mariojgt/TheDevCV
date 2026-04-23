import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Cookie, X } from 'lucide-react';
import {
  acceptClarity,
  declineClarity,
  getCookieConsent,
  loadClarity,
} from '../lib/clarity';

/**
 * GDPR-minded cookie consent banner.
 *
 * - Shows once per browser until the user picks Accept or Decline.
 * - Decision is stored in localStorage so returning users aren't nagged.
 * - On mount, if an "accepted" decision is already on file, we silently
 *   re-load Clarity so repeat visits keep tracking without re-prompting.
 * - Fires a global 'cv:open-cookie-prefs' event so a footer link can
 *   re-open the banner for users who want to change their mind.
 */
export default function CookieBanner() {
  const [visible, setVisible] = useState(false);

  // First-load behaviour: either re-hydrate Clarity (user already accepted)
  // or show the banner (no decision yet). We never re-show the banner for
  // users who already declined — they explicitly said no.
  useEffect(() => {
    const prior = getCookieConsent();
    if (prior === 'accepted') {
      loadClarity();
      return;
    }
    if (prior === null) {
      // Tiny defer so the banner slides in after first paint.
      const t = window.setTimeout(() => setVisible(true), 400);
      return () => window.clearTimeout(t);
    }
  }, []);

  // Reopen-from-footer: any component can dispatch a CustomEvent and the
  // banner re-appears for re-consent.
  useEffect(() => {
    const onOpen = () => setVisible(true);
    window.addEventListener('cv:open-cookie-prefs', onOpen);
    return () => window.removeEventListener('cv:open-cookie-prefs', onOpen);
  }, []);

  if (!visible) return null;

  const onAccept = () => {
    acceptClarity();
    setVisible(false);
  };
  const onDecline = () => {
    declineClarity();
    setVisible(false);
  };

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      className="fixed inset-x-0 bottom-0 z-40 p-3 sm:p-4 animate-fade-in-up pointer-events-none"
    >
      <div className="mx-auto max-w-3xl rounded-md border-[3px] border-neo-border bg-surface shadow-2xl pointer-events-auto">
        <div className="flex items-start gap-3 p-3 sm:p-4">
          <div className="hidden sm:flex shrink-0 w-8 h-8 border-[3px] border-neo-border bg-brand/20 rounded-sm items-center justify-center text-brand-light">
            <Cookie className="w-4 h-4" />
          </div>

          <div className="flex-1 min-w-0">
            <h2 className="text-xs font-extrabold uppercase tracking-wide text-white mb-1.5 flex items-center gap-2">
              <Cookie className="w-4 h-4 text-brand-light sm:hidden" /> Cookies
            </h2>
            <p className="text-xs text-muted leading-snug">
              We use cookies to keep you signed in and remember your CV edits.
              With your permission, we also use <span className="text-white font-medium">Microsoft Clarity</span>{' '}
              (anonymous session analytics) to see which features break so we can fix them faster.
              No cross-site tracking, no advertising. You can change this any time from the footer.{' '}
              <Link to="/privacy" className="text-brand-light hover:text-brand underline">Privacy policy</Link>
              {' · '}
              <Link to="/terms" className="text-brand-light hover:text-brand underline">Terms</Link>.
            </p>

            <div className="flex flex-wrap items-center gap-2 mt-3">
              <button
                type="button"
                onClick={onAccept}
                className="neo-btn neo-btn-primary px-3.5 py-1.5 text-xs"
              >
                Accept analytics
              </button>
              <button
                type="button"
                onClick={onDecline}
                className="neo-btn neo-btn-ghost px-3.5 py-1.5 text-xs"
              >
                Decline all
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={onDecline}
            title="Decline all"
            aria-label="Decline all and close"
            className="shrink-0 text-muted hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Public helper for "Cookie preferences" links in the footer. Dispatches
 * a CustomEvent the CookieBanner listens for to re-open itself.
 */
export function openCookiePreferences(): void {
  window.dispatchEvent(new CustomEvent('cv:open-cookie-prefs'));
}
