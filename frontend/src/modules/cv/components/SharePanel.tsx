import { useState } from 'react';
import { Link2, Copy, Check, RefreshCw, Loader2, AlertTriangle } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useToast } from '../../../components/ui/Toast';

/**
 * Public-share controls for a single CV. Wraps two RPCs:
 *   - ensure_share_token(profile_id): turn sharing on, mint a token if needed
 *   - (direct UPDATE)                : turn sharing off, or rotate the token
 *
 * Shows the copyable URL and a regenerate-link affordance so users can revoke
 * old copies of the link (e.g. after applying to a role they don't want to
 * advertise further).
 */
export default function SharePanel({
  profileId,
  isShared,
  shareToken,
  onChange,
}: {
  profileId: string | undefined;
  isShared: boolean;
  shareToken: string | null;
  onChange: (next: { is_shared: boolean; share_token: string | null; shared_at: string | null }) => void;
}) {
  const { toast } = useToast();
  const [pending, setPending] = useState<'toggle' | 'rotate' | null>(null);
  const [copied, setCopied] = useState(false);

  // Unsaved CV — user needs an id before RLS can identify the row.
  if (!profileId || profileId === 'new') {
    return (
      <div className="neo-card p-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-md border-2 border-brand bg-brand/10 text-brand-light shrink-0"><Link2 className="w-4 h-4" /></div>
          <div>
            <h3 className="font-display text-sm font-extrabold uppercase tracking-wide text-white">Share this CV publicly</h3>
            <p className="text-xs text-muted mt-1">
              Save this CV first — sharing needs a saved draft to link to.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const publicUrl = shareToken ? `${window.location.origin}/s/${shareToken}` : null;

  const turnOn = async () => {
    setPending('toggle');
    const { data, error } = await supabase.rpc('ensure_share_token', { p_profile_id: profileId });
    setPending(null);
    if (error || !data) {
      toast('Could not enable sharing.', 'error');
      return;
    }
    onChange({ is_shared: true, share_token: data as string, shared_at: new Date().toISOString() });
    toast('Public link is live.', 'success');
  };

  const turnOff = async () => {
    setPending('toggle');
    const { error } = await supabase.from('cv_profiles').update({ is_shared: false }).eq('id', profileId);
    setPending(null);
    if (error) {
      toast('Could not disable sharing.', 'error');
      return;
    }
    onChange({ is_shared: false, share_token: shareToken, shared_at: null });
    toast('Link revoked. Old URLs no longer work.', 'success');
  };

  const rotate = async () => {
    setPending('rotate');
    // Drop token first so ensure_share_token mints a fresh one.
    const { error: e1 } = await supabase.from('cv_profiles').update({ share_token: null }).eq('id', profileId);
    if (e1) { setPending(null); toast('Could not rotate link.', 'error'); return; }
    const { data, error: e2 } = await supabase.rpc('ensure_share_token', { p_profile_id: profileId });
    setPending(null);
    if (e2 || !data) { toast('Could not rotate link.', 'error'); return; }
    onChange({ is_shared: true, share_token: data as string, shared_at: new Date().toISOString() });
    toast('New link minted. Old one no longer works.', 'success');
  };

  const copy = async () => {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast('Copy blocked — select the URL manually.', 'error');
    }
  };

  return (
    <div className="neo-card-brand p-5">
      <div className="flex items-start gap-3 mb-3">
        <div className="p-2 rounded-md border-2 border-brand bg-brand/10 text-brand-light shrink-0"><Link2 className="w-4 h-4" /></div>
        <div className="flex-1">
          <h3 className="font-display text-sm font-extrabold uppercase tracking-wide text-white">Share this CV publicly</h3>
          <p className="text-xs text-muted mt-1">
            Anyone with the link can view the CV in their browser — great for applications, recruiters, portfolios.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={isShared}
          onClick={isShared ? turnOff : turnOn}
          disabled={pending !== null}
          className={`relative shrink-0 w-11 h-6 rounded-sm border-2 transition-colors ${
            isShared ? 'bg-brand border-black' : 'bg-surface-light border-neo-border'
          } disabled:opacity-50`}
        >
          <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-sm bg-white border border-black transition-transform ${isShared ? 'translate-x-4.5' : ''}`} />
        </button>
      </div>

      {isShared && publicUrl && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 p-2 rounded-md border-[3px] border-neo-border bg-surface-light">
            <code className="flex-1 text-[11px] font-mono text-white truncate">{publicUrl}</code>
            <button
              type="button"
              onClick={copy}
              className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-md border-2 border-brand bg-brand/10 text-brand-light text-[10px] font-bold uppercase tracking-wide hover:bg-brand/20 transition-colors"
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-start gap-1.5 text-[10px] font-bold uppercase tracking-wider text-subtle">
              <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0 text-accent" />
              <span>Your email, phone, and links appear publicly. Review before sharing.</span>
            </div>
            <button
              type="button"
              onClick={rotate}
              disabled={pending !== null}
              title="Mint a new link and revoke the previous one"
              className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-md border-2 border-neo-border text-[10px] font-bold uppercase tracking-wider text-muted hover:text-brand-light hover:border-brand transition-colors disabled:opacity-40"
            >
              {pending === 'rotate' ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              Rotate link
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
