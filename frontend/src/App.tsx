import { Routes, Route, Navigate } from 'react-router-dom';
import AppShell from './components/AppShell';
import Settings from './pages/Settings';

import CVDashboard from './modules/cv/pages/CVDashboard';
import CVEditor from './modules/cv/pages/CVEditor';
import CVImport from './modules/cv/pages/CVImport';
import CVJobMatch from './modules/cv/pages/CVJobMatch';
import JobTracker from './modules/cv/pages/JobTracker';
import PublicCV from './modules/cv/pages/PublicCV';
import JobsDiscovery from './modules/jobs/pages/JobsDiscovery';
import FullScreenShell from './components/FullScreenShell';

export default function App() {
  return (
    <Routes>
      {/* Public share links still work — tokenised, read-only. */}
      <Route path="/s/:token" element={<PublicCV />} />

      {/* App — no auth in self-hosted mode, straight to the dashboard. */}
      <Route path="/" element={<AppShell />}>
        <Route index element={<CVDashboard />} />
        <Route path="settings" element={<Settings />} />
      </Route>

      {/* CV module — dashboard + peripheral pages keep the sidebar chrome. */}
      <Route path="/cv" element={<AppShell />}>
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
      <Route element={<FullScreenShell />}>
        <Route path="/cv/new" element={<CVEditor />} />
        <Route path="/cv/:id" element={<CVEditor />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
