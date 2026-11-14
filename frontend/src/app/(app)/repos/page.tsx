'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  Alert,
  Button,
  EmptyState,
  ListSkeleton,
  Page,
  PageHeader,
  Spinner,
  TextArea,
} from '@/components/ui/primitives';
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
    <Page className="max-w-3xl">
      <PageHeader
        title="Repositories"
        description="Install the GitHub App on a repo. Pull requests are reviewed automatically. No personal access token."
        actions={
          <div className="flex shrink-0 gap-2">
            <Button onClick={() => void handleSync()} disabled={saving === 'sync'}>
              {saving === 'sync' && <Spinner />}
              Sync
            </Button>
            {configured && installUrl !== '' && (
              <Button asChild variant="primary">
                <a href={installUrl}>Connect GitHub repos</a>
              </Button>
            )}
          </div>
        }
      />

      {!configured && (
        <div className="mb-4">
          <Alert>
            This server has no GitHub App credentials. Add GITHUB_APP_* to .env (see
            .env.example).
          </Alert>
        </div>
      )}
      {error !== undefined && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      {repos === undefined ? (
        <ListSkeleton rows={3} />
      ) : repos.length === 0 ? (
        <EmptyState
          title="No repositories yet"
          description="Install the GitHub App and pick the repositories ReviewPulse may review. Pull requests are then reviewed automatically."
          action={
            configured && installUrl !== '' ? (
              <Button asChild variant="primary">
                <a href={installUrl}>Connect GitHub repos</a>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {repos.map((repo) => (
            <li key={repo.full_name}>
              <article className="card card-border bg-base-100">
                <div className="card-body gap-4 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-sm font-medium">{repo.full_name}</p>
                      <p className="text-muted mt-1 text-xs">
                        {repo.private ? 'Private' : 'Public'}
                        {repo.enabled ? ' · reviewing PRs' : ' · paused'}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className={
                          repo.enabled
                            ? 'badge badge-success badge-soft'
                            : 'badge badge-ghost'
                        }
                      >
                        {repo.enabled ? 'Active' : 'Paused'}
                      </span>
                      <Button
                        size="sm"
                        variant={repo.enabled ? 'secondary' : 'primary'}
                        disabled={saving === repo.full_name}
                        onClick={() => void handleToggle(repo)}
                      >
                        {repo.enabled ? 'Pause' : 'Enable'}
                      </Button>
                    </div>
                  </div>

                  <div className="collapse-arrow border-base-300 collapse rounded-box border">
                    <input type="checkbox" />
                    <div className="collapse-title min-h-11 text-sm font-medium">
                      Repo guidelines
                    </div>
                    <div className="collapse-content">
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
                      <p className="text-muted mt-2 text-xs">
                        Passed to every agent as extra repo-specific context.
                      </p>
                      <Button
                        size="sm"
                        className="mt-3"
                        disabled={saving === repo.full_name}
                        onClick={() => void handleSaveGuidelines(repo)}
                      >
                        {saving === repo.full_name && <Spinner />}
                        Save guidelines
                      </Button>
                    </div>
                  </div>
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
