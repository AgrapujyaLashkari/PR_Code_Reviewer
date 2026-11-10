'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { AppShell } from '@/components/app-shell';
import { Spinner } from '@/components/ui/primitives';
import { useAuth } from '@/lib/auth-context';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user === undefined) router.replace('/login');
  }, [user, loading, router]);

  if (loading || user === undefined) {
    return (
      <main className="text-base-content/60 flex min-h-screen items-center justify-center gap-2 text-sm">
        <Spinner />
        Checking session…
      </main>
    );
  }

  return (
    <AppShell email={user.email} onSignOut={() => void logout()}>
      {children}
    </AppShell>
  );
}
