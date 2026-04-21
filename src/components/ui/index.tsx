'use client';
import { ButtonHTMLAttributes, InputHTMLAttributes, HTMLAttributes, forwardRef } from 'react';

// ── Button ──────────────────────────────────────────────────────────────────

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

const variantStyles: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-[#1D9E75] text-white hover:bg-[#18896a]',
  secondary: 'bg-[rgba(255,255,255,0.06)] text-[#e5e7eb] border border-[rgba(255,255,255,0.1)] hover:bg-[rgba(255,255,255,0.1)]',
  ghost: 'text-[#9ca3af] hover:text-white hover:bg-[rgba(255,255,255,0.04)]',
  danger: 'bg-[rgba(239,68,68,0.15)] text-[#ef4444] hover:bg-[rgba(239,68,68,0.25)]',
};

const sizeStyles: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'px-3 py-1.5 text-xs rounded-lg',
  md: 'px-4 py-2.5 text-sm rounded-xl',
  lg: 'px-6 py-3 text-base rounded-xl',
};

export function Button({ variant = 'primary', size = 'md', className = '', disabled, children, ...props }: ButtonProps) {
  return (
    <button
      disabled={disabled}
      className={`font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

// ── Input ──────────────────────────────────────────────────────────────────

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = '', ...props }, ref) => (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-sm font-medium text-[#d1d5db]">{label}</label>}
      <input
        ref={ref}
        className={`px-4 py-2.5 rounded-xl text-sm text-white outline-none transition-all bg-[rgba(255,255,255,0.06)] border ${error ? 'border-red-500' : 'border-[rgba(255,255,255,0.1)]'} focus:border-[#1D9E75] placeholder:text-[#6b7280] ${className}`}
        {...props}
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
);
Input.displayName = 'Input';

// ── Card ──────────────────────────────────────────────────────────────────

export function Card({ className = '', children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-xl bg-[#13131a] border border-[rgba(255,255,255,0.07)] ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

// ── Badge ──────────────────────────────────────────────────────────────────

type BadgeVariant = 'default' | 'green' | 'yellow' | 'red' | 'blue';

const badgeStyles: Record<BadgeVariant, string> = {
  default: 'bg-[rgba(255,255,255,0.06)] text-[#9ca3af]',
  green: 'bg-[rgba(29,158,117,0.15)] text-[#1D9E75]',
  yellow: 'bg-[rgba(251,191,36,0.15)] text-[#fbbf24]',
  red: 'bg-[rgba(239,68,68,0.15)] text-[#ef4444]',
  blue: 'bg-[rgba(96,165,250,0.15)] text-[#60a5fa]',
};

export function Badge({ variant = 'default', className = '', children }: { variant?: BadgeVariant; className?: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${badgeStyles[variant]} ${className}`}>
      {children}
    </span>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────

export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-lg bg-[rgba(255,255,255,0.06)] ${className}`} />
  );
}

// ── Toggle ──────────────────────────────────────────────────────────────────

interface ToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  disabled?: boolean;
}

export function Toggle({ checked, onChange, label, disabled }: ToggleProps) {
  return (
    <label className={`flex items-center gap-3 ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}>
      <div
        onClick={() => !disabled && onChange(!checked)}
        className="relative w-10 h-6 rounded-full transition-colors"
        style={{ background: checked ? '#1D9E75' : 'rgba(255,255,255,0.1)' }}
      >
        <div
          className="absolute top-1 w-4 h-4 rounded-full bg-white transition-transform"
          style={{ transform: `translateX(${checked ? '18px' : '4px'})` }}
        />
      </div>
      {label && <span className="text-sm text-[#d1d5db]">{label}</span>}
    </label>
  );
}