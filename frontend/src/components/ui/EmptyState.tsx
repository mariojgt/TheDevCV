import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description: string;
  action?: { label: string; to?: string; onClick?: () => void };
}

/**
 * Neo empty state — squared icon frame with 3px border and brand-green
 * fill, title in Teko uppercase, body in muted, CTA is a neo-btn-primary
 * so the primary action gets the full shadow/hover treatment.
 */
export default function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-16 h-16 rounded-md border-[3px] border-neo-border bg-surface shadow-[4px_4px_0_#000] flex items-center justify-center mb-5 text-brand-light">
        {icon}
      </div>
      <h3 className="font-display text-xl font-extrabold uppercase tracking-wide text-white mb-2">{title}</h3>
      <p className="text-sm text-muted max-w-sm mb-6">{description}</p>
      {action && (
        action.to ? (
          <Link to={action.to} className="neo-btn neo-btn-primary px-5 py-2.5 text-sm">
            {action.label}
          </Link>
        ) : (
          <button onClick={action.onClick} className="neo-btn neo-btn-primary px-5 py-2.5 text-sm">
            {action.label}
          </button>
        )
      )}
    </div>
  );
}
