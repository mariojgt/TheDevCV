interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  withWordmark?: boolean;
  className?: string;
}

const sizeMap = { sm: 20, md: 28, lg: 40 } as const;

/**
 * The Dev CV mark — brackets + pipe forming "CV". Palette matches
 * thedevrealm.com/brand: muted sage #4a7a60 outline + signature
 * brand green #0d9668 strokes. The wordmark uses Teko (the brand
 * display font) so the name carries the same voice as the parent
 * site's hero typography.
 */
export default function Logo({ size = 'md', withWordmark = true, className = '' }: LogoProps) {
  const px = sizeMap[size];
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg width={px} height={px} viewBox="0 0 32 32" aria-label="The Dev CV" className="shrink-0">
        <rect width="32" height="32" rx="7" fill="#0a0e14" stroke="var(--color-brand-stroke)" strokeWidth="1" />
        <path d="M8 10l5 6-5 6"  stroke="var(--color-brand)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <path d="M24 10l-5 6 5 6" stroke="var(--color-brand)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <line x1="18" y1="8" x2="14" y2="24" stroke="var(--color-brand)" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
      {withWordmark && (
        <span className="flex items-baseline gap-1.5">
          <span className="font-display font-semibold text-[1.15em] tracking-tight text-[var(--color-text)] leading-none">The Dev CV</span>
          <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400/70 hidden sm:inline">v1</span>
        </span>
      )}
    </span>
  );
}
