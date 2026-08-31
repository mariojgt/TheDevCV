import { HardDrive } from 'lucide-react';

/** Compact sidebar pill — in self-hosted mode there are no plans or credits,
 *  so this simply marks the instance as local. */
export default function PlanBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wider border bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
      title="Self-hosted instance — all features unlocked"
    >
      <HardDrive className="w-3 h-3" />
      self-hosted
    </span>
  );
}
