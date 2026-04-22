import type { ReactNode } from 'react';

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple';

interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  icon?: ReactNode;
  className?: string;
}

/**
 * Neo badge — 2px border, uppercase, squared. Each variant pairs a coloured
 * border with a tinted fill (`{color}/10`) per the brand's "Inline Badge"
 * pattern.
 */
const variantClasses: Record<BadgeVariant, string> = {
  default: 'border-[var(--color-neo-border)] bg-[var(--color-surface-light)] text-[var(--color-muted)]',
  success: 'border-[var(--color-brand)] bg-[var(--color-brand)]/10 text-[var(--color-brand-light)]',
  warning: 'border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-accent)]',
  danger:  'border-red-500 bg-red-500/10 text-red-400',
  info:    'border-blue-500 bg-blue-500/10 text-blue-400',
  purple:  'border-purple-500 bg-purple-500/10 text-purple-400',
};

export default function Badge({ children, variant = 'default', icon, className = '' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center gap-1 border-2 rounded-md px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide ${variantClasses[variant]} ${className}`}>
      {icon}
      {children}
    </span>
  );
}
