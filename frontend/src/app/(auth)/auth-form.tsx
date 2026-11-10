'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { z } from 'zod';

import { ThemeToggle } from '@/components/theme-toggle';
import { GitHubIcon } from '@/components/ui/github-icon';
import { Logo } from '@/components/ui/logo';
import { Alert, Button, Field, Spinner } from '@/components/ui/primitives';
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
    submit: 'Sign in with email',
    switchText: "Don't have an account?",
    switchLabel: 'Register',
    switchHref: '/register',
  },
  register: {
    title: 'Create your account',
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
    <main id="main" className="grid min-h-screen lg:grid-cols-2">
      <section className="bg-base-200 hidden flex-col justify-between p-10 pb-16 lg:flex">
        <Link href="/" className="flex items-center gap-2.5 text-sm font-semibold">
          <Logo size={22} />
          ReviewPulse
        </Link>

        <div className="max-w-lg">
          <h2 className="text-3xl font-semibold tracking-tight">
            GitHub PRs reviewed automatically.
          </h2>
          <p className="text-muted mt-3 text-sm leading-relaxed">
            Install the app on a repository. Agents check security and quality, then static
            tools confirm what they find.
          </p>
          <div className="mockup-code bg-neutral text-neutral-content mt-8 text-sm">
            <pre data-prefix="38">
              <code>query += username</code>
            </pre>
            <pre data-prefix="!" className="bg-error text-error-content">
              <code>SQL injection — user input concatenated into SQL</code>
            </pre>
            <pre data-prefix="✓" className="text-success">
              <code>bandit confirmed · high</code>
            </pre>
          </div>
        </div>

        <p className="text-muted text-sm">No personal access token required</p>
      </section>

      <section className="relative flex items-center justify-center px-4 py-16">
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>

        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold">
              <Logo size={20} />
              ReviewPulse
            </Link>
          </div>

          <h1 className="text-title">{copy.title}</h1>
          <p className="text-muted mt-1 mb-6 text-sm leading-relaxed">
            Use GitHub to connect repositories, or continue with email.
          </p>

          <a
            href={api.githubLoginUrl()}
            className="btn btn-block min-h-11 border-0 bg-[#1f883d]! text-white! hover:bg-[#1a7f37]!"
          >
            <GitHubIcon className="size-5" />
            Sign in with GitHub
          </a>

          <div className="divider text-base-content/40 text-xs">or</div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-2" noValidate>
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

            <Button type="submit" className="btn-block mt-2" disabled={submitting}>
              {submitting && <Spinner />}
              {copy.submit}
            </Button>
          </form>

          <p className="text-muted mt-5 text-center text-sm">
            {copy.switchText}{' '}
            <Link href={copy.switchHref} className="link link-primary">
              {copy.switchLabel}
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
