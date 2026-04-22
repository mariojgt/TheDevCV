import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  icon?: ReactNode;
  error?: string;
}

/**
 * Neo input — 3px border, brand-green focus ring, uppercase tracked label.
 * Uses the global `.neo-input` class so focus behaviour stays consistent
 * with selects/textareas elsewhere.
 */
const Input = forwardRef<HTMLInputElement, InputProps>(({ label, icon, error, className = '', id, ...props }, ref) => {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-xs font-bold uppercase tracking-wider text-muted">{label}</label>
      )}
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle pointer-events-none">{icon}</div>
        )}
        <input
          ref={ref}
          id={inputId}
          className={`neo-input px-3 py-2.5 ${icon ? 'pl-10' : ''} ${error ? 'border-red-500!' : ''} ${className}`}
          {...props}
        />
      </div>
      {error && <p className="text-xs font-bold uppercase tracking-wider text-red-400">{error}</p>}
    </div>
  );
});

Input.displayName = 'Input';
export default Input;
