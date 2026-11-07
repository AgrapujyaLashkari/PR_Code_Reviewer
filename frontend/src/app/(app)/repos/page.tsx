'use client';

import { useCallback, useEffect, useState } from 'react';

import { Alert, Button, Card, Spinner, TextArea } from '@/components/ui/primitives';
import { ApiError, api } from '@/lib/api';
import type { ConnectedRepo } from '@/lib/types';

export default function ReposPage() {
  const [repos, setRepos] = useState<ConnectedRepo[] | undefined>(undefined);
  const [installUrl, setInstallUrl] = useState<string>('');
  const [configured, setConfigured] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState<string | undefined>(undefined);
  const [guidelines, setGuidelines] = useState<Record<string, string>>({});

  const load = useCallback((isCancelled: () => boolean = () => false) => {
    return Promise.all([api.listRepos(), api.githubInstallUrl()])
      .then(([list, install]) => {
        if (isCancelled()) return;
        setRepos(list);
        setInstallUrl(install.url);
        setConfigured(install.configured);
        setGuidelines(
          Object.fromEntries(list.map((repo) => [repo.full_name, repo.extra_guidelines])),
        );
      })
      .catch((caught: unknown) => {
        if (isCancelled()) return;
        setError(
          caught instanceof ApiError ? caught.message : 'Could not load repositories.',
        );
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    void load(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function handleSync() {
    setSaving('sync');
    try {
      const list = await api.syncRepos();
      setRepos(list);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Sync failed.');
    } finally {
      setSaving(undefined);
    }
  }

  async function handleToggle(repo: ConnectedRepo) {
    setSaving(repo.full_name);
    try {
      const updated = await api.updateRepo(repo.full_name, { enabled: !repo.enabled });
      setRepos((current) =>
        current?.map((item) => (item.full_name === updated.full_name ? updated : item)),
      );
    } finally {
      setSaving(undefined);
    }
  }

  async function handleSaveGuidelines(repo: ConnectedRepo) {
    setSaving(repo.full_name);
    try {
      const updated = await api.updateRepo(repo.full_name, {
        extra_guidelines: guidelines[repo.full_name] ?? '',
      });
      setRepos((current) =>
        current?.map((item) => (item.full_name === updated.full_name ? updated : item)),
      );
    } finally {
      setSaving(undefined);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-title">Repositories</h1>
          <p className="text-muted mt-1 text-sm">
            Install the GitHub App on a repo — the same way you connect a project on Vercel.
            Pull requests are reviewed automatically. No personal access token.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => void handleSync()} disabled={saving === 'sync'}>
            {saving === 'sync' && <Spinner />}
            Sync
          </Button>
          {configured && installUrl !== '' && (
            <a href={installUrl}>
              <Button variant="primary" size="sm">
                Connect GitHub repos
              </Button>
            </a>
          )}
        </div>
      </div>

      {!configured && (
        <Alert>
          This server has no GitHub App credentials. Add GITHUB_APP_* to .env (see
          .env.example).
        </Alert>
      )}
      {error !== undefined && <Alert>{error}</Alert>}

      {repos === undefined ? (
        <div className="text-muted flex items-center gap-2 py-12 text-sm">
          <Spinner />
          Loading…
        </div>
      ) : repos.length === 0 ? (
        <Card className="p-6">
          <p className="text-sm">
            No repositories yet. Click <strong>Connect GitHub repos</strong> and pick the
            repositories this app may review.
          </p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {repos.map((repo) => (
            <li key={repo.full_name}>
              <Card className="flex flex-col gap-3 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-mono text-sm font-medium">{repo.full_name}</p>
                    <p className="text-muted text-xs">
                      {repo.private ? 'Private' : 'Public'}
                      {repo.enabled ? ' · reviewing PRs' : ' · paused'}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant={repo.enabled ? 'secondary' : 'primary'}
                    disabled={saving === repo.full_name}
                    onClick={() => void handleToggle(repo)}
                  >
                    {repo.enabled ? 'Pause' : 'Enable'}
                  </Button>
                </div>
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium">Repo guidelines (optional)</span>
                  <TextArea
                    rows={4}
                    value={guidelines[repo.full_name] ?? ''}
                    onChange={(event) =>
                      setGuidelines((current) => ({
                        ...current,
                        [repo.full_name]: event.target.value,
                      }))
                    }
                  />
                  <span className="text-muted text-xs">
                    Passed to every agent as extra repo-specific context.
                  </span>
                </label>
                <div>
                  <Button
                    size="sm"
                    disabled={saving === repo.full_name}
                    onClick={() => void handleSaveGuidelines(repo)}
                  >
                    Save guidelines
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
