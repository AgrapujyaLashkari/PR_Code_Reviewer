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
      <main className="bg-base-200 flex min-h-screen">
        <aside className="border-base-300 bg-base-100 hidden w-[var(--sidebar-width)] border-r lg:block">
          <div className="p-5">
            <div className="skeleton h-6 w-36" />
          </div>
          <div className="space-y-2 px-4">
            <div className="skeleton h-11 w-full" />
            <div className="skeleton h-11 w-full" />
            <div className="skeleton h-11 w-full" />
          </div>
        </aside>
        <div className="text-muted flex flex-1 items-center justify-center gap-2 text-sm">
          <Spinner />
          Checking session…
        </div>
      </main>
    );
  }

  return (
    <AppShell email={user.email} onSignOut={() => void logout()}>
      {children}
    </AppShell>
  );
}
