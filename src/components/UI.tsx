import React from 'react';
import { cn } from '../lib/utils';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', isLoading, children, ...props }, ref) => {
    const variants = {
      primary: 'bg-brand-primary text-white hover:opacity-90 shadow-xl shadow-brand-primary/20',
      secondary: 'bg-brand-secondary text-brand-primary hover:bg-white border border-brand-primary/10',
      outline: 'border border-slate-200 bg-white text-slate-700 hover:bg-brand-secondary',
      ghost: 'text-slate-500 hover:bg-brand-secondary',
      danger: 'bg-red-500 text-white hover:bg-red-600 shadow-xl shadow-red-100',
    };

    const sizes = {
      sm: 'px-4 py-2 text-sm',
      md: 'px-6 py-3.5 text-base',
      lg: 'px-8 py-4 text-lg',
    };

    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center rounded-2xl font-semibold transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none cursor-pointer',
          variants[variant],
          sizes[size],
          className
        )}
        disabled={isLoading}
        {...props}
      >
        {isLoading ? (
          <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : null}
        {children}
      </button>
    );
  }
);

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  containerClassName?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, containerClassName, ...props }, ref) => {
    const input = (
      <input
        ref={ref}
        className={cn(
          'flex w-full rounded-xl border border-slate-100 bg-white px-4 py-3 text-sm ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-all shadow-sm',
          className
        )}
        {...props}
      />
    );

    if (label) {
      return (
        <div className={cn('space-y-2', containerClassName)}>
          <label className="text-sm font-bold text-slate-700">{label}</label>
          {input}
        </div>
      );
    }

    return input;
  }
);

export const Card = ({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div 
    className={cn('bg-white rounded-3xl border border-slate-200 shadow-sm p-6', className)}
    {...props}
  >
    {children}
  </div>
);
