/**
 * daisyUI primitives: buttons, fields, cards, alerts.
 */

import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
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
      secondary: '',
      ghost: 'btn-ghost',
      danger: 'btn-error',
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
      <label htmlFor={inputId} className="fieldset-legend">
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
    <div role={tone === 'error' ? 'alert' : 'status'} className={cn('alert', tones[tone])}>
      {children}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span aria-hidden className={cn('loading loading-spinner loading-sm', className)} />;
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
    <div className="card card-border bg-base-200">
      <div className="card-body items-center text-center">
        <h2 className="card-title">{title}</h2>
        <p className="text-muted max-w-md text-sm leading-relaxed">{description}</p>
        {action !== undefined && <div className="card-actions mt-2">{action}</div>}
      </div>
    </div>
  );
}
