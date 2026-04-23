import { Routes, Route, Navigate } from 'react-router-dom';
import AppShell from './components/AppShell';
import RequireAuth from './components/RequireAuth';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Pricing from './pages/Pricing';
import Privacy from './pages/Privacy';
import Terms from './pages/Terms';
import BillingSuccess from './pages/BillingSuccess';
import Account from './pages/Account';
import Admin from './pages/Admin';
import { useAuth } from './contexts/AuthContext';
import { useApp } from './contexts/AppContext';

import CVDashboard from './modules/cv/pages/CVDashboard';
import CVEditor from './modules/cv/pages/CVEditor';
import CVImport from './modules/cv/pages/CVImport';
import CVJobMatch from './modules/cv/pages/CVJobMatch';
import JobTracker from './modules/cv/pages/JobTracker';
import PublicCV from './modules/cv/pages/PublicCV';
import JobsDiscovery from './modules/jobs/pages/JobsDiscovery';
import FullScreenShell from './components/FullScreenShell';

import type { ReactElement } from 'react';

function AdminRoute({ children }: { children: ReactElement }) {
  const { isAdmin, creditsLoading } = useApp();
  if (creditsLoading) return null;
  if (!isAdmin) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const { user, loading } = useAuth();

  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={loading ? null : user ? <Navigate to="/app" replace /> : <Landing />} />
      <Route path="/login"    element={<Login />} />
      <Route path="/signup"   element={<Signup />} />
      <Route path="/pricing"  element={<Pricing />} />
      <Route path="/privacy"  element={<Privacy />} />
      <Route path="/terms"    element={<Terms />} />
      <Route path="/billing/success" element={<BillingSuccess />} />
      <Route path="/s/:token" element={<PublicCV />} />

      {/* App (auth required) */}
      <Route path="/app" element={<RequireAuth><AppShell /></RequireAuth>}>
        <Route index element={<CVDashboard />} />
        <Route path="account"     element={<Account />} />
        <Route path="admin"       element={<AdminRoute><Admin /></AdminRoute>} />
      </Route>

      {/* CV module — dashboard + peripheral pages keep the sidebar chrome. */}
      <Route path="/cv" element={<RequireAuth><AppShell /></RequireAuth>}>
        <Route index               element={<CVDashboard />} />
        <Route path="import"       element={<CVImport />} />
        <Route path="match"        element={<CVJobMatch />} />
        <Route path="jobs"         element={<JobTracker />} />
        <Route path="jobs/:id"     element={<JobTracker />} />
        <Route path="jobs/new"     element={<JobTracker />} />
        <Route path="discover"     element={<JobsDiscovery />} />
      </Route>

      {/* Full-page editor (resume.io-style) — no sidebar, viewport-wide split pane.
          Literal siblings above (/cv/new, /cv/import, /cv/match, /cv/jobs, /cv/discover)
          win over the :id param, so no conflict. */}
      <Route element={<RequireAuth><FullScreenShell /></RequireAuth>}>
        <Route path="/cv/new" element={<CVEditor />} />
        <Route path="/cv/:id" element={<CVEditor />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
