import { Outlet } from 'react-router-dom';
import CommandPalette from './CommandPalette';

/**
 * Chromeless shell for the CV editor. Strips the sidebar so the editor can
 * use the full viewport (resume.io-style), but keeps ⌘K available and the
 * page background consistent. The editor supplies its own sticky top bar.
 */
export default function FullScreenShell() {
  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
      <Outlet />
      <CommandPalette />
    </div>
  );
}
