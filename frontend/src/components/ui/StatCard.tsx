import type { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  accent?: 'emerald' | 'blue' | 'amber' | 'red';
}

/**
 * Neo stat card — uses the global `.neo-stat-card` (3px border, 5px neo
 * shadow, right-edge brand-green bar). Value rendered in Teko for display
 * weight; label is uppercase tracked for brand voice.
 */
const accentMap: Record<NonNullable<StatCardProps['accent']>, string> = {
  emerald: 'text-[var(--color-brand-light)]',
  blue:    'text-blue-400',
  amber:   'text-[var(--color-accent)]',
  red:     'text-red-400',
};

export default function StatCard({ label, value, icon, accent = 'emerald' }: StatCardProps) {
  return (
    <div className="neo-stat-card flex items-center justify-between">
      <div>
        <div className={`font-display text-3xl font-extrabold leading-none ${accentMap[accent]}`}>{value}</div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-muted mt-1.5">{label}</div>
      </div>
      {icon && <div className={`${accentMap[accent]} opacity-60`}>{icon}</div>}
    </div>
  );
}
