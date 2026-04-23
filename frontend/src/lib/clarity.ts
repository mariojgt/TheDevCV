/**
 * Microsoft Clarity loader — consent-gated so Clarity only ever loads
 * after the user has accepted analytics cookies via the CookieBanner.
 *
 * - `loadClarity()` is idempotent: calling it twice never double-loads.
 * - Reading consent from localStorage lets the loader fire on every page
 *   reload without re-asking, until the user revokes.
 * - Not inlined in index.html on purpose: GDPR-compliant sites must hold
 *   off on behavioural analytics until explicit opt-in.
 */

/** Your Clarity project ID. Change here to swap projects or disable. */
export const CLARITY_ID = 'wg9rxtaiu5';

/** localStorage key that holds the user's cookie-consent decision.
 *  Values: 'accepted' | 'declined' | (unset → show banner). */
export const COOKIE_CONSENT_KEY = 'cv_cookie_consent';

export type CookieConsent = 'accepted' | 'declined' | null;

export function getCookieConsent(): CookieConsent {
  try {
    const v = localStorage.getItem(COOKIE_CONSENT_KEY);
    return v === 'accepted' || v === 'declined' ? v : null;
  } catch {
    return null;
  }
}

export function setCookieConsent(v: CookieConsent): void {
  try {
    if (v === null) localStorage.removeItem(COOKIE_CONSENT_KEY);
    else localStorage.setItem(COOKIE_CONSENT_KEY, v);
  } catch { /* SSR / privacy mode — silently ignore */ }
}

// Flag on window so React remounts / HMR can't double-inject the script.
declare global {
  interface Window {
    __clarityLoaded?: boolean;
    clarity?: (...args: unknown[]) => void;
  }
}

/**
 * Inject the Microsoft Clarity snippet. Matches the official vendor snippet
 * exactly so the init payload lands in `window.clarity.q` before the async
 * script finishes fetching.
 */
export function loadClarity(id: string = CLARITY_ID): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__clarityLoaded) return;
  window.__clarityLoaded = true;

  // Vendor snippet (window, document, 'clarity', 'script', id):
  //   window.clarity = window.clarity || function(){ (window.clarity.q = window.clarity.q || []).push(arguments) };
  //   script = document.createElement('script'); script.async = 1; script.src = 'https://www.clarity.ms/tag/' + id;
  //   firstScript = document.getElementsByTagName('script')[0]; firstScript.parentNode.insertBefore(script, firstScript);
  (function (c: Window, l: Document, a: 'clarity', r: 'script', i: string) {
    c[a] = c[a] || function () {
      ((c[a] as unknown as { q: unknown[] }).q = (c[a] as unknown as { q: unknown[] }).q || []).push(arguments);
    };
    const t = l.createElement(r);
    t.async = true;
    t.src = 'https://www.clarity.ms/tag/' + i;
    const y = l.getElementsByTagName(r)[0];
    y.parentNode?.insertBefore(t, y);
  })(window, document, 'clarity', 'script', id);
}

/**
 * Opposite of loadClarity — best-effort teardown when the user revokes
 * consent mid-session. We cannot fully unload a third-party script, but we
 * can stop further event pushes and mark the session as opted-out.
 */
export function disableClarity(): void {
  if (typeof window === 'undefined') return;
  try {
    window.clarity?.('stop');
    window.clarity?.('consent', false);
  } catch { /* ignore */ }
}

/** Call after the user picks "Accept analytics" in the banner. */
export function acceptClarity(): void {
  setCookieConsent('accepted');
  loadClarity();
}

/** Call after the user picks "Decline all" in the banner. */
export function declineClarity(): void {
  setCookieConsent('declined');
  disableClarity();
}
