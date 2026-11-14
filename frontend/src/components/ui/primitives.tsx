/**
 * daisyUI primitives: buttons, fields, cards, alerts, page chrome.
 */

import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Logo } from '@/components/ui/logo';
import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';

import { cn } from '@/lib/utils';

const buttonVariants = cva('btn', {
  variants: {
    variant: {
      primary: 'btn-primary',
      secondary: 'btn-outline',
      neutral: 'btn-neutral',
      ghost: 'btn-ghost',
      danger: 'btn-error btn-soft',
    },
    size: {
      sm: 'btn-sm',
      md: '',
    },
  },
  defaultVariants: {
    variant: 'secondary',
    size: 'md',
  },
});

interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({
  variant,
  size,
  className,
  asChild = false,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : 'button';
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
}

export function Field({ label, hint, error, id, className, ...props }: FieldProps) {
  const inputId = id ?? props.name ?? label;
  const describedBy = error !== undefined ? `${inputId}-error` : undefined;

  return (
    <fieldset className="fieldset p-0">
      <label htmlFor={inputId} className="fieldset-legend pt-0">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error !== undefined}
        aria-describedby={describedBy}
        className={cn('input w-full', error !== undefined && 'input-error', className)}
        {...props}
      />
      {hint !== undefined && error === undefined && <p className="label">{hint}</p>}
      {error !== undefined && (
        <p id={describedBy} className="label text-error">
          {error}
        </p>
      )}
    </fieldset>
  );
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn('select w-full', className)} {...props} />;
}

export function TextArea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn('textarea code-surface w-full font-mono', className)}
      {...props}
    />
  );
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('card card-border bg-base-100', className)} {...props} />;
}

export function Alert({
  tone = 'error',
  children,
}: {
  tone?: 'error' | 'info' | 'success';
  children: ReactNode;
}) {
  const tones = {
    error: 'alert-error',
    info: 'alert-info',
    success: 'alert-success',
  };
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn('alert alert-soft', tones[tone])}
    >
      {children}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span aria-hidden className={cn('loading loading-spinner loading-sm', className)} />;
}

export function Page({
  children,
  className,
  wide = false,
}: {
  children: ReactNode;
  className?: string;
  wide?: boolean;
}) {
  return (
    <div
      className={cn(
        'page-enter mx-auto w-full px-4 py-8 sm:px-8 lg:py-10',
        wide ? 'max-w-6xl' : 'max-w-5xl',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-title">{title}</h1>
        {description !== undefined && (
          <p className="text-muted mt-2 max-w-xl text-sm leading-relaxed">{description}</p>
        )}
      </div>
      {actions !== undefined && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="card card-border bg-base-100">
      <div className="card-body items-center px-8 py-14 text-center">
        <div className="bg-primary/10 text-primary mb-1 flex size-14 items-center justify-center rounded-2xl">
          <Logo size={28} />
        </div>
        <h2 className="card-title mt-2 text-lg font-semibold tracking-tight">{title}</h2>
        <p className="text-muted max-w-md text-sm leading-relaxed">{description}</p>
        {action !== undefined && <div className="card-actions mt-3">{action}</div>}
      </div>
    </div>
  );
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div
      className="overflow-hidden rounded-box border border-base-300 bg-base-100"
      aria-busy="true"
      aria-label="Loading"
    >
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="border-base-300 flex items-center gap-4 border-b px-4 py-4 last:border-b-0"
        >
          <div className="skeleton size-10 shrink-0 rounded-xl" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="skeleton h-4 w-2/5" />
            <div className="skeleton h-3 w-1/4" />
          </div>
          <div className="skeleton hidden h-8 w-16 sm:block" />
        </div>
      ))}
    </div>
  );
}
