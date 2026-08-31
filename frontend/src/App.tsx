import { Routes, Route, Navigate } from 'react-router-dom';
import AppShell from './components/AppShell';
import ProtectedRoute, { GuestRoute } from './components/ProtectedRoute';
import Settings from './pages/Settings';
import Login from './pages/Login';
import Signup from './pages/Signup';

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
      <Route path="/login" element={<GuestRoute><Login /></GuestRoute>} />
      <Route path="/signup" element={<GuestRoute><Signup /></GuestRoute>} />

      {/* Public share links — tokenised, read-only. */}
      <Route path="/s/:token" element={<PublicCV />} />

      <Route path="/" element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
        <Route index element={<CVDashboard />} />
        <Route path="settings" element={<Settings />} />
      </Route>

      <Route path="/cv" element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
        <Route index               element={<CVDashboard />} />
        <Route path="import"       element={<CVImport />} />
        <Route path="match"        element={<CVJobMatch />} />
        <Route path="jobs"         element={<JobTracker />} />
        <Route path="jobs/:id"     element={<JobTracker />} />
        <Route path="jobs/new"     element={<JobTracker />} />
        <Route path="discover"     element={<JobsDiscovery />} />
      </Route>

      <Route element={<ProtectedRoute><FullScreenShell /></ProtectedRoute>}>
        <Route path="/cv/new" element={<CVEditor />} />
        <Route path="/cv/:id" element={<CVEditor />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
