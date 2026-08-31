import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Mail, Lock, Loader2 } from 'lucide-react';
import Logo from '../components/Logo';
import { useAuth } from '../contexts/AuthContext';
import { redirectFromState } from '../lib/redirect';

const ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: 'Invalid email or password.',
  invalid_email: 'Enter a valid email address.',
  password_too_short: 'Password must be at least 8 characters.',
  email_taken: 'An account with this email already exists.',
  password_too_long: 'Password is too long.',
  too_many_attempts: 'Too many attempts. Please wait a few minutes.',
};

export default function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [registrationOpen, setRegistrationOpen] = useState<boolean | null>(null);

  const from = redirectFromState(location.state);

  useEffect(() => {
    fetch('/api/health')
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('health_failed')))
      .then((health) => setRegistrationOpen(Boolean(health.registration_open)))
      .catch(() => setRegistrationOpen(null));
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signIn(email, password);
      navigate(from, { replace: true });
    } catch (err: unknown) {
      const code = err instanceof Error ? err.message : 'request_failed';
      setError(ERROR_MESSAGES[code] ?? 'Sign-in failed');
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
        <form onSubmit={onSubmit} className="neo-card p-6 space-y-5">
          <div>
            <h1 className="font-display text-2xl font-extrabold uppercase tracking-wide text-white mb-1">Welcome back</h1>
            <p className="text-sm text-muted">Sign in to your self-hosted instance.</p>
          </div>

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
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required maxLength={256} autoComplete="current-password"
                className="neo-input pl-10 pr-3 py-2.5" />
            </div>
          </label>

          {error && (
            <p className="border-2 border-red-500 bg-red-500/10 text-red-400 text-xs font-bold uppercase tracking-wide px-3 py-2 rounded-md">
              {error}
            </p>
          )}

          <button type="submit" disabled={loading}
            className="neo-btn neo-btn-primary w-full px-5 py-3 text-sm inline-flex items-center justify-center gap-2 disabled:opacity-60">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Sign in
          </button>

          {registrationOpen === true && (
            <p className="text-center text-sm text-muted">
              No account yet?{' '}
              <Link to="/signup" state={location.state} className="text-brand-light hover:underline font-bold">Create one</Link>
            </p>
          )}
          {registrationOpen === false && (
            <p className="text-center text-xs text-subtle">New account registration is closed on this server.</p>
          )}
        </form>
      </div>
    </div>
  );
}
