'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';

import { Alert, Button, Card, Page, PageHeader, Select, Spinner } from '@/components/ui/primitives';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { SEVERITY_LABEL, SEVERITY_ORDER } from '@/lib/display';
import type { Capabilities } from '@/lib/types';

export default function SettingsPage() {
  const { user, refreshUser } = useAuth();
  const [capabilities, setCapabilities] = useState<Capabilities | undefined>(undefined);
  const [model, setModel] = useState(user?.preferences.llm_model ?? '');
  const [minSeverity, setMinSeverity] = useState(user?.preferences.min_severity ?? 'low');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    void api
      .capabilities()
      .then(setCapabilities)
      .catch(() => setCapabilities(undefined));
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage(undefined);
    setError(undefined);

    try {
      await api.updatePreferences({
        llm_model: model,
        min_severity: minSeverity,
      });
      await refreshUser();
      setMessage('Settings saved.');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Page className="max-w-2xl">
      <PageHeader
        title="Settings"
        description="Model, severity, and GitHub connection."
      />

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {message !== undefined && <Alert tone="success">{message}</Alert>}
        {error !== undefined && <Alert>{error}</Alert>}

        <Card>
          <div className="card-body gap-5 p-6">
            <h2 className="text-eyebrow">Model</h2>

            <fieldset className="fieldset p-0">
              <label htmlFor="model" className="fieldset-legend pt-0">
                Review model
              </label>
              <Select
                id="model"
                value={model}
                onChange={(event) => setModel(event.target.value)}
              >
                <option value="">
                  Server default
                  {capabilities !== undefined && ` (${capabilities.default_model})`}
                </option>
                {capabilities?.available_models.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </Select>
              <p className="label">
                {capabilities?.llm_reachable === false
                  ? 'GEMINI_API_KEY is missing or Gemini is unreachable.'
                  : 'Reviews run on the Gemini API.'}
              </p>
            </fieldset>

            <fieldset className="fieldset p-0">
              <label htmlFor="severity" className="fieldset-legend pt-0">
                Minimum severity to show
              </label>
              <Select
                id="severity"
                value={minSeverity}
                onChange={(event) => setMinSeverity(event.target.value)}
              >
                {SEVERITY_ORDER.map((severity) => (
                  <option key={severity} value={severity}>
                    {SEVERITY_LABEL[severity]}
                  </option>
                ))}
              </Select>
            </fieldset>
          </div>
        </Card>

        <Card>
          <div className="card-body gap-3 p-6">
            <h2 className="text-eyebrow">GitHub</h2>
            {user?.github_login ? (
              <p className="text-sm">
                Signed in as <span className="font-mono">@{user.github_login}</span>
                {user.github_connected ? ' · GitHub App installed' : ' · App not installed yet'}
              </p>
            ) : (
              <p className="text-muted text-sm">
                Sign in with GitHub, then install the app on the repositories to review.
              </p>
            )}
            <div className="card-actions">
              <Button asChild type="button" variant="primary">
                <Link href="/repos">Manage repositories</Link>
              </Button>
            </div>
          </div>
        </Card>

        {capabilities !== undefined && (
          <Card>
            <div className="card-body p-6">
              <h2 className="text-eyebrow">Active static analysis tools</h2>
              <p className="text-muted mt-2 text-xs">
                Agent findings can only be cross-checked with these tools.
              </p>
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {capabilities.static_analysers.map((tool) => (
                  <li key={tool} className="badge badge-success badge-soft font-mono">
                    {tool}
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        )}

        <div>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving && <Spinner />}
            Save
          </Button>
        </div>
      </form>
    </Page>
  );
}
