import { useState, useEffect } from 'react';
import { NavLink, Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { FileUser, Briefcase, Target, LogOut, User, CreditCard, Coins, Shield, Compass, Command, Menu, X } from 'lucide-react';
import Logo from './Logo';
import PlanBadge from './PlanBadge';
import CommandPalette from './CommandPalette';
import { useAuth } from '../contexts/AuthContext';
import { useApp } from '../contexts/AppContext';

const baseNav = [
  { to: '/',            label: 'Dashboard',     icon: FileUser },
  { to: '/cv/discover', label: 'Discover',      icon: Compass },
  { to: '/cv/jobs',     label: 'Applications',  icon: Briefcase },
  { to: '/cv/match',    label: 'Tailor to job', icon: Target },
  { to: '/pricing',     label: 'Buy credits',   icon: Coins },
  { to: '/account',     label: 'Account',       icon: User },
];

export default function AppShell() {
  const { user, signOut } = useAuth();
  const { isAdmin } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const nav = isAdmin ? [...baseNav, { to: '/app/admin', label: 'Admin', icon: Shield }] : baseNav;
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => { setSidebarOpen(false); }, [location.pathname]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex text-white">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          aria-hidden
          className="md:hidden fixed inset-0 z-30 bg-black/60 backdrop-blur-sm"
        />
      )}

      {/* Sidebar — neo-brutalist rail with 3px right border + stripe header */}
      <aside
        className={`
          fixed md:static inset-y-0 left-0 z-40
          w-64 shrink-0 border-r-[3px] border-neo-border bg-surface
          flex flex-col
          transform transition-transform duration-200 ease-out
          md:translate-x-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
      >
        <div className="neo-header-bar flex items-center justify-between h-14 px-4">
          <Link to="/" className="flex items-center">
            <Logo size="md" />
          </Link>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="md:hidden p-1.5 text-white/80 hover:text-white"
            aria-label="Close menu"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) => `
                flex items-center gap-3 px-3 py-2.5 rounded-md text-xs font-bold uppercase tracking-wider
                border-[3px] transition-all
                ${isActive
                  ? 'bg-brand/10 text-brand-light border-brand shadow-[3px_3px_0_#000]'
                  : 'text-muted border-transparent hover:text-white hover:bg-surface-light hover:border-neo-border'}
              `}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="truncate">{label}</span>
            </NavLink>
          ))}

          <div className="mt-4 mx-2 px-2 py-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-subtle border-[3px] border-dashed border-neo-border rounded-md">
            <Command className="w-3 h-3" />
            <span className="flex-1">Press</span>
            <kbd className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-sm font-mono text-[10px] text-white bg-surface-light border-2 border-neo-border">
              ⌘K
            </kbd>
          </div>
        </nav>

        <div className="px-3 py-3 border-t-[3px] border-neo-border space-y-2 bg-surface-light">
          <div className="flex items-center justify-between px-1">
            <PlanBadge />
            <Link to="/account" className="text-muted hover:text-brand-light transition-colors" title="Account">
              <CreditCard className="w-4 h-4" />
            </Link>
          </div>
          <div className="flex items-center gap-2 px-1">
            <div className="w-7 h-7 rounded-sm border-2 border-brand bg-brand/20 flex items-center justify-center shrink-0">
              <span className="text-[10px] font-mono font-bold text-brand-light">
                {user?.email?.[0]?.toUpperCase() ?? '·'}
              </span>
            </div>
            <span className="text-[11px] font-mono text-muted truncate flex-1">{user?.email}</span>
            <button onClick={handleSignOut} className="text-muted hover:text-red-400 transition-colors" title="Sign out">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto min-w-0">
        {/* Mobile top bar — hamburger + compact logo + credit balance */}
        <div className="md:hidden sticky top-0 z-20 flex items-center gap-3 px-4 h-14 bg-[#080d19]/95 backdrop-blur-md border-b-[3px] border-neo-border">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-md border-2 border-neo-border text-white hover:border-brand transition-colors"
            aria-label="Open menu"
          >
            <Menu className="w-4 h-4" />
          </button>
          <Link to="/" className="flex items-center">
            <Logo size="sm" />
          </Link>
          <div className="ml-auto"><PlanBadge /></div>
        </div>

        <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-10">
          <Outlet />
        </div>
      </main>

      <CommandPalette />
    </div>
  );
}
