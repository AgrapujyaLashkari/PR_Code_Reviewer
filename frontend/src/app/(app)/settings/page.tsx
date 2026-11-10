'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';

import { Alert, Button, Card, Select, Spinner } from '@/components/ui/primitives';
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
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-8">
      <h1 className="text-title">Settings</h1>
      <p className="text-muted mt-1 text-sm">Model, severity, and GitHub connection.</p>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        {message !== undefined && <Alert tone="success">{message}</Alert>}
        {error !== undefined && <Alert>{error}</Alert>}

        <Card className="flex flex-col gap-4 p-4">
          <h2 className="text-eyebrow">Model</h2>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="model" className="text-sm font-medium">
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
            <p className="text-muted text-xs">
              {capabilities?.llm_reachable === false
                ? 'GEMINI_API_KEY is missing or Gemini is unreachable.'
                : 'Reviews run on the Gemini API.'}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="severity" className="text-sm font-medium">
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
          </div>
        </Card>

        <Card className="flex flex-col gap-3 p-4">
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
          <Button asChild type="button" variant="primary">
            <Link href="/repos">Manage repositories</Link>
          </Button>
        </Card>

        {capabilities !== undefined && (
          <Card className="p-4">
            <h2 className="text-eyebrow">Active static analysis tools</h2>
            <p className="text-muted mt-2 text-xs">
              Agent findings can only be cross-checked with these tools.
            </p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {capabilities.static_analysers.map((tool) => (
                <li
                  key={tool}
                  className="bg-verified-soft text-verified border-verified-ring rounded-md border px-2 py-0.5 font-mono text-xs"
                >
                  {tool}
                </li>
              ))}
            </ul>
          </Card>
        )}

        <div>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving && <Spinner />}
            Save
          </Button>
        </div>
      </form>
    </div>
  );
}
