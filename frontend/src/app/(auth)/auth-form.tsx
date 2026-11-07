'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { z } from 'zod';

import { Logo } from '@/components/ui/logo';
import { Alert, Button, Card, Field, Spinner } from '@/components/ui/primitives';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

const schema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

type Mode = 'login' | 'register';

const COPY = {
  login: {
    title: 'Sign in',
    submit: 'Sign in',
    switchText: "Don't have an account?",
    switchLabel: 'Register',
    switchHref: '/register',
  },
  register: {
    title: 'Register',
    submit: 'Create account',
    switchText: 'Already have an account?',
    switchLabel: 'Sign in',
    switchHref: '/login',
  },
} as const;

export function AuthForm({ mode }: { mode: Mode }) {
  const copy = COPY[mode];
  const { login, register } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const searchParams = useSearchParams();
  const [formError, setFormError] = useState<string | undefined>(
    searchParams.get('error') === 'github'
      ? 'GitHub sign-in failed. Try again, or use email.'
      : undefined,
  );
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(undefined);

    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        errors[String(issue.path[0])] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setSubmitting(true);

    try {
      if (mode === 'login') {
        await login(parsed.data.email, parsed.data.password);
      } else {
        await register(parsed.data.email, parsed.data.password);
      }
      router.push('/dashboard');
    } catch (error) {
      setFormError(
        error instanceof ApiError
          ? error.message
          : 'Could not reach the server. Is the backend running?',
      );
      setSubmitting(false);
    }
  }

  return (
    <main id="main" className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-title inline-flex items-center gap-2.5">
            <Logo size={22} />
            Code Review Agent
          </h1>
          <p className="text-muted mt-1 text-sm">
            Multi-agent code review and security analysis
          </p>
        </div>

        <Card className="p-6">
          <h2 className="text-section mb-4">{copy.title}</h2>

          <a
            href={api.githubLoginUrl()}
            className="border-border-default hover:border-accent-ring mb-4 flex h-9 items-center justify-center rounded-md border bg-surface-raised text-sm font-medium transition-colors"
          >
            Continue with GitHub
          </a>
          <p className="text-muted mb-4 text-center text-xs">or</p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
            {formError !== undefined && <Alert>{formError}</Alert>}

            <Field
              label="Email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              error={fieldErrors.email}
            />
            <Field
              label="Password"
              name="password"
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              error={fieldErrors.password}
              hint={mode === 'register' ? 'At least 8 characters' : undefined}
            />

            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting && <Spinner />}
              {copy.submit}
            </Button>
          </form>
        </Card>

        <p className="text-muted mt-4 text-center text-sm">
          {copy.switchText}{' '}
          <Link
            href={copy.switchHref}
            className="text-accent hover:text-accent-hover font-medium transition-colors hover:underline"
          >
            {copy.switchLabel}
          </Link>
        </p>
      </div>
    </main>
  );
}
