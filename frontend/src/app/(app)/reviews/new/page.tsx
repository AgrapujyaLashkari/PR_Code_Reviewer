'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import {
  Alert,
  Button,
  Card,
  Field,
  Spinner,
  TextArea,
} from '@/components/ui/primitives';
import { ApiError, api } from '@/lib/api';
import type { Capabilities } from '@/lib/types';
import { cn } from '@/lib/utils';

type Tab = 'upload' | 'paste' | 'pull_request';

const TABS: { id: Tab; label: string }[] = [
  { id: 'upload', label: 'Upload files / ZIP' },
  { id: 'paste', label: 'Paste code' },
  { id: 'pull_request', label: 'GitHub PR' },
];

const SAMPLE = `import sqlite3

API_KEY = "sk_live_EXAMPLEFIXTURENOTAREALKEY000000"


def get_user(username):
    conn = sqlite3.connect("app.db")
    query = "SELECT * FROM users WHERE name = '" + username + "'"
    return conn.execute(query).fetchall()
`;

export default function NewReviewPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('upload');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [capabilities, setCapabilities] = useState<Capabilities | undefined>(undefined);

  const [files, setFiles] = useState<File[]>([]);
  const [filename, setFilename] = useState('snippet.py');
  const [code, setCode] = useState('');
  const [prUrl, setPrUrl] = useState('');

  useEffect(() => {
    void api
      .capabilities()
      .then(setCapabilities)
      .catch(() => setCapabilities(undefined));
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(undefined);
    setSubmitting(true);

    try {
      const review =
        tab === 'upload'
          ? await api.createFromUpload(files)
          : tab === 'paste'
            ? await api.createFromPaste(filename, code)
            : await api.createFromPullRequest(prUrl);
      router.push(`/reviews/${review.id}`);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Could not start the review. Is the backend running?',
      );
      setSubmitting(false);
    }
  }

  const canSubmit =
    tab === 'upload'
      ? files.length > 0
      : tab === 'paste'
        ? code.trim().length > 0
        : prUrl.trim().length > 0;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-title">New review</h1>
      <p className="text-muted mt-1 text-sm">
        Code is split by layer. A separate agent reviews each layer for security and
        quality, then findings are cross-checked with static analysis.
      </p>

      {capabilities !== undefined && !capabilities.llm_reachable && (
        <div className="mt-4">
          <Alert>
            Gemini is not configured. Agent reviews need <code>GEMINI_API_KEY</code> in
            the server environment. Static analysis still runs.
          </Alert>
        </div>
      )}

      <div
        role="tablist"
        aria-label="Input source"
        className="border-border-default mt-6 flex gap-1 border-b"
      >
        {TABS.map((item) => (
          <button
            key={item.id}
            role="tab"
            type="button"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm transition-colors',
              tab === item.id
                ? 'border-b-accent text-foreground font-semibold'
                : 'text-muted hover:text-foreground border-b-transparent',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        {error !== undefined && <Alert>{error}</Alert>}

        {tab === 'upload' && (
          <Card className="p-4">
            <label htmlFor="files" className="text-sm font-medium">
              Source files
            </label>
            <input
              id="files"
              type="file"
              multiple
              accept=".py,.ts,.tsx,.js,.jsx,.sql,.yml,.yaml,.json,.zip,.sh,.css,.html"
              onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
              className="text-muted file:border-border-default file:bg-surface file:text-foreground hover:file:border-accent-ring mt-2 block w-full text-sm file:mr-3 file:cursor-pointer file:rounded-md file:border file:px-3 file:py-1.5 file:text-sm file:transition-colors"
            />
            <p className="text-muted mt-2 text-xs">
              Python, TypeScript/JavaScript, SQL, YAML, Dockerfile, and similar text
              files. ZIP archives are unpacked
              {capabilities !== undefined &&
                ` (max ${capabilities.max_upload_mb} MB, ${capabilities.max_files_per_review} files)`}
              .
            </p>
            {files.length > 0 && (
              <ul className="mt-3 flex flex-col gap-1">
                {files.map((file) => (
                  <li key={file.name} className="text-muted font-mono text-xs">
                    {file.name} · {(file.size / 1024).toFixed(1)} KB
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {tab === 'paste' && (
          <Card className="flex flex-col gap-3 p-4">
            <Field
              label="File name"
              name="filename"
              value={filename}
              onChange={(event) => setFilename(event.target.value)}
              hint="The extension sets the language: .py, .ts, .tsx, .sql…"
            />
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="code" className="text-sm font-medium">
                  Code
                </label>
                <button
                  type="button"
                  onClick={() => setCode(SAMPLE)}
                  className="text-accent text-xs hover:underline"
                >
                  Fill with sample vulnerable code
                </button>
              </div>
              <TextArea
                id="code"
                rows={16}
                value={code}
                spellCheck={false}
                onChange={(event) => setCode(event.target.value)}
                placeholder="Paste the code to review…"
              />
            </div>
          </Card>
        )}

        {tab === 'pull_request' && (
          <Card className="p-4">
            <Field
              label="Pull request URL"
              name="pr"
              type="url"
              value={prUrl}
              onChange={(event) => setPrUrl(event.target.value)}
              placeholder="https://github.com/owner/repo/pull/123"
              hint="Only the PR's changed lines are reviewed. The repo must be connected under Repositories (GitHub App). Opened PRs are reviewed automatically."
            />
          </Card>
        )}

        <div className="flex items-center gap-3">
          <Button type="submit" variant="primary" disabled={!canSubmit || submitting}>
            {submitting && <Spinner />}
            Start review
          </Button>
          {capabilities !== undefined && (
            <span className="text-muted text-xs">
              Model: <code className="font-mono">{capabilities.default_model}</code> ·
              Tools: {capabilities.static_analysers.join(', ')}
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
