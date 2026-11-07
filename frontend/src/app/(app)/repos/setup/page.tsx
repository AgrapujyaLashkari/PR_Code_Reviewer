'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import { Alert, Spinner } from '@/components/ui/primitives';
import { ApiError, api } from '@/lib/api';

function SetupInner() {
  const params = useSearchParams();
  const router = useRouter();
  const [error, setError] = useState<string | undefined>(undefined);
  const installationId = params.get('installation_id');
  const parsedId = installationId === null || installationId === '' ? undefined : Number(installationId);
  const invalid = parsedId !== undefined && !Number.isFinite(parsedId);

  useEffect(() => {
    if (installationId === null || installationId === '') {
      router.replace('/repos');
      return;
    }
    if (parsedId === undefined || !Number.isFinite(parsedId)) {
      return;
    }
    let cancelled = false;
    void api
      .completeGithubInstall(parsedId)
      .then(() => {
        if (!cancelled) router.replace('/repos');
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setError(
          caught instanceof ApiError ? caught.message : 'Could not finish install.',
        );
      });
    return () => {
      cancelled = true;
    };
  }, [installationId, parsedId, router]);

  if (invalid) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <Alert>Invalid installation id from GitHub.</Alert>
      </div>
    );
  }

  if (error !== undefined) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <Alert>{error}</Alert>
      </div>
    );
  }

  return (
    <main className="text-muted flex flex-1 items-center justify-center gap-2 py-16 text-sm">
      <Spinner />
      Connecting GitHub repositories…
    </main>
  );
}

export default function RepoSetupPage() {
  return (
    <Suspense
      fallback={
        <main className="text-muted flex flex-1 items-center justify-center gap-2 py-16 text-sm">
          <Spinner />
          Connecting GitHub repositories…
        </main>
      }
    >
      <SetupInner />
    </Suspense>
  );
}
