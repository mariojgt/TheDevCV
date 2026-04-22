import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'gradient';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
}

/**
 * Neo-brutalist button — 3px black border, hard offset shadow, uppercase
 * extrabold. Hover translates up-left; active pushes down. Five legacy
 * variants kept for API compat: `gradient` is folded into `primary`
 * (brand forbids gradient fills), and `ghost` stays chromeless for
 * icon-only escape hatches.
 */
const variantClasses: Record<ButtonVariant, string> = {
  primary:   'neo-btn neo-btn-primary',
  gradient:  'neo-btn neo-btn-primary',
  secondary: 'neo-btn neo-btn-ghost',
  danger:    'neo-btn neo-btn-danger',
  /** Chromeless — used for icon-only/quiet actions. Never gets a border. */
  ghost:     'inline-flex items-center justify-center rounded-md font-bold uppercase tracking-wide text-[var(--color-muted)] hover:text-white hover:bg-[var(--color-surface-light)] transition-colors',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs gap-1.5',
  md: 'px-5 py-2.5 text-sm gap-2',
  lg: 'px-7 py-3.5 text-base gap-2',
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  children,
  className = '',
  disabled,
  ...props
}, ref) => (
  <button
    ref={ref}
    disabled={disabled || loading}
    className={`${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
    {...props}
  >
    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}
    {children}
  </button>
));

Button.displayName = 'Button';
export default Button;
