import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { KeyRound, Mail, Lock, Loader2 } from 'lucide-react';
import Logo from '../components/Logo';
import { useAuth } from '../contexts/AuthContext';
import { redirectFromState } from '../lib/redirect';

const ERROR_MESSAGES: Record<string, string> = {
  invalid_email: 'Enter a valid email address.',
  password_too_short: 'Password must be at least 8 characters.',
  password_too_long: 'Password is too long.',
  email_taken: 'An account with this email already exists.',
  registration_disabled: 'New account registration is disabled on this server.',
  invalid_setup_token: 'That first-account setup token is not valid.',
  too_many_attempts: 'Too many attempts. Please wait a few minutes.',
};

interface HealthStatus {
  registration_open: boolean;
  setup_required: boolean;
}

export default function Signup() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [setupToken, setSetupToken] = useState('');
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [healthError, setHealthError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const from = redirectFromState(location.state);

  useEffect(() => {
    fetch('/api/health')
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('health_failed')))
      .then((data) => setHealth(data))
      .catch(() => setHealthError(true));
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!health) {
      setError('Could not verify the server setup status. Refresh and try again.');
      return;
    }
    if (!health.registration_open) {
      setError(ERROR_MESSAGES.registration_disabled);
      return;
    }
    if (health.setup_required && !setupToken.trim()) {
      setError('Enter the first-account setup token from the server logs.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      await signUp(email, password, setupToken.trim() || undefined);
      navigate(from, { replace: true });
    } catch (err: unknown) {
      const code = err instanceof Error ? err.message : 'request_failed';
      setError(ERROR_MESSAGES[code] ?? 'Sign-up failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/"><Logo size="lg" /></Link>
        </div>
        <form onSubmit={onSubmit} className="neo-card-brand p-6 space-y-5">
          <div>
            <h1 className="font-display text-2xl font-extrabold uppercase tracking-wide text-white mb-1">Create your account</h1>
            <p className="text-sm text-muted">Your data stays on this server — no cloud account needed.</p>
          </div>

          {health?.setup_required && health.registration_open && (
            <label className="block p-3 rounded-md border-2 border-amber-500/60 bg-amber-500/10">
              <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-200 mb-1.5">
                <KeyRound className="w-4 h-4" /> First-account setup token
              </span>
              <input
                type="password"
                value={setupToken}
                onChange={(event) => setSetupToken(event.target.value)}
                required
                autoComplete="off"
                spellCheck={false}
                className="neo-input px-3 py-2.5 font-mono"
              />
              <span className="text-[11px] text-amber-100/75 mt-2 block">
                Copy it from the server startup logs. With Docker, run <code>docker compose logs thedevcv</code>.
              </span>
            </label>
          )}

          {!health && !healthError && (
            <p className="text-xs text-muted inline-flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking server setup…</p>
          )}
          {healthError && (
            <p className="border-2 border-red-500 bg-red-500/10 text-red-400 text-xs px-3 py-2 rounded-md">
              Could not read the server setup status. Refresh this page to try again.
            </p>
          )}
          {health && !health.registration_open && (
            <p className="border-2 border-amber-500 bg-amber-500/10 text-amber-200 text-xs px-3 py-2 rounded-md">
              New account registration is closed on this server.
            </p>
          )}

          <label className="block">
            <span className="block text-xs font-bold uppercase tracking-wider text-muted mb-1.5">Email</span>
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-subtle pointer-events-none" />
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={254} autoComplete="email"
                className="neo-input pl-10 pr-3 py-2.5" />
            </div>
          </label>

          <label className="block">
            <span className="block text-xs font-bold uppercase tracking-wider text-muted mb-1.5">Password</span>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-subtle pointer-events-none" />
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} maxLength={256} autoComplete="new-password"
                className="neo-input pl-10 pr-3 py-2.5" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-subtle mt-1.5 block">At least 8 characters.</span>
          </label>

          <label className="block">
            <span className="block text-xs font-bold uppercase tracking-wider text-muted mb-1.5">Confirm password</span>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-subtle pointer-events-none" />
              <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={8} maxLength={256} autoComplete="new-password"
                className="neo-input pl-10 pr-3 py-2.5" />
            </div>
          </label>

          {error && (
            <p className="border-2 border-red-500 bg-red-500/10 text-red-400 text-xs font-bold uppercase tracking-wide px-3 py-2 rounded-md">
              {error}
            </p>
          )}

          <button type="submit" disabled={loading || !health || healthError || !health.registration_open}
            className="neo-btn neo-btn-primary w-full px-5 py-3 text-sm inline-flex items-center justify-center gap-2 disabled:opacity-60">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Create account
          </button>

          <p className="text-center text-sm text-muted">
            Already have an account?{' '}
            <Link to="/login" state={location.state} className="text-brand-light hover:underline font-bold">Sign in</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
