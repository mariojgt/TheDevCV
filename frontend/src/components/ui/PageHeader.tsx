import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

/**
 * Neo page header — h1 auto-renders Teko uppercase extrabold via global
 * CSS. A brand-green bar sits left of the title to anchor the page to
 * the sidebar hierarchy, matching the section-header pattern from the
 * brand page.
 */
export default function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between mb-6 gap-4">
      <div className="min-w-0">
        <h1 className="flex items-center gap-3 text-2xl sm:text-3xl font-extrabold tracking-wide text-white">
          <span className="inline-block w-2 h-7 bg-brand rounded-sm shrink-0" />
          <span className="truncate">{title}</span>
        </h1>
        {description && (
          <p className="text-sm text-muted mt-1.5 max-w-2xl">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
