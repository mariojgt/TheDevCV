import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Mail, Lock, Loader2 } from 'lucide-react';
import Logo from '../components/Logo';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? '/';

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signIn(email, password);
      navigate(from, { replace: true });
    } catch (err: any) {
      setError(err?.message ?? 'Sign-in failed');
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
            <p className="text-sm text-muted">Sign in to keep shipping.</p>
          </div>

          <label className="block">
            <span className="block text-xs font-bold uppercase tracking-wider text-muted mb-1.5">Email</span>
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-subtle pointer-events-none" />
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email"
                className="neo-input pl-10 pr-3 py-2.5" />
            </div>
          </label>

          <label className="block">
            <span className="block text-xs font-bold uppercase tracking-wider text-muted mb-1.5">Password</span>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-subtle pointer-events-none" />
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password"
                className="neo-input pl-10 pr-3 py-2.5" />
            </div>
          </label>

          {error && (
            <p className="border-2 border-red-500 bg-red-500/10 text-red-400 text-xs font-bold uppercase tracking-wide px-3 py-2 rounded-md">
              {error}
            </p>
          )}

          <button type="submit" disabled={loading}
            className="neo-btn neo-btn-primary w-full px-5 py-3 text-sm inline-flex items-center gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Sign in
          </button>

          <p className="text-xs text-center text-muted">
            No account yet?{' '}
            <Link to="/signup" className="text-brand-light font-bold uppercase tracking-wider hover:text-brand transition-colors">
              Create one
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
