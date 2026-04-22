import type { HTMLAttributes, ReactNode } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  hover?: boolean;
}

const paddingClasses = { none: '', sm: 'p-3', md: 'p-4', lg: 'p-6' };

/**
 * Neo-brutalist card — delegated to the global `.neo-card` class so
 * hover/active behaviour stays consistent with the rest of the brand
 * system. `hover` prop now only adds a pointer cursor; the lift + shadow
 * grow is always present (brand mandates it).
 */
export default function Card({ children, padding = 'md', hover = false, className = '', ...props }: CardProps) {
  return (
    <div
      className={`neo-card ${paddingClasses[padding]} ${hover ? 'cursor-pointer' : ''} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
