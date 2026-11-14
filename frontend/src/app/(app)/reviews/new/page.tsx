'use client';

import { FileCode2, GitPullRequest, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import {
  Alert,
  Button,
  Card,
  Field,
  Page,
  PageHeader,
  Spinner,
  TextArea,
} from '@/components/ui/primitives';
import { ApiError, api } from '@/lib/api';
import type { Capabilities } from '@/lib/types';
import { cn } from '@/lib/utils';

type Tab = 'upload' | 'paste' | 'pull_request';

const TABS: { id: Tab; label: string; hint: string; icon: typeof Upload }[] = [
  { id: 'upload', label: 'Upload files', hint: 'Files or a ZIP archive', icon: Upload },
  { id: 'paste', label: 'Paste code', hint: 'A single snippet', icon: FileCode2 },
  { id: 'pull_request', label: 'GitHub PR', hint: 'Connected repository', icon: GitPullRequest },
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
    <Page className="max-w-3xl">
      <PageHeader
        title="New review"
        description="Pick a source. Agents review security and quality, then static analysis confirms findings."
      />

      {capabilities !== undefined && !capabilities.llm_reachable && (
        <div className="mb-6">
          <Alert>
            Gemini is not configured. Agent reviews need <code>GEMINI_API_KEY</code> in
            the server environment. Static analysis still runs.
          </Alert>
        </div>
      )}

      <div role="tablist" aria-label="Input source" className="tabs tabs-box">
        {TABS.map((item) => {
          const Icon = item.icon;
          const selected = tab === item.id;
          return (
            <button
              key={item.id}
              role="tab"
              type="button"
              aria-selected={selected}
              onClick={() => setTab(item.id)}
              className={cn('tab h-auto flex-1 gap-2 py-3', selected && 'tab-active')}
            >
              <Icon className="size-4" />
              <span className="flex flex-col items-start text-left">
                <span>{item.label}</span>
                <span className="text-xs font-normal opacity-60">{item.hint}</span>
              </span>
            </button>
          );
        })}
      </div>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        {error !== undefined && <Alert>{error}</Alert>}

        {tab === 'upload' && (
          <Card>
            <div className="card-body p-6">
            <label htmlFor="files" className="text-sm font-medium">
              Source files
            </label>
            <input
              id="files"
              type="file"
              multiple
              accept=".py,.ts,.tsx,.js,.jsx,.sql,.yml,.yaml,.json,.zip,.sh,.css,.html"
              onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
              className="file-input file-input-primary mt-2 w-full"
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
            </div>
          </Card>
        )}

        {tab === 'paste' && (
          <Card>
            <div className="card-body gap-3 p-6">
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
                  className="link link-primary text-xs"
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
            </div>
          </Card>
        )}

        {tab === 'pull_request' && (
          <Card>
            <div className="card-body p-6">
            <Field
              label="Pull request URL"
              name="pr"
              type="url"
              value={prUrl}
              onChange={(event) => setPrUrl(event.target.value)}
              placeholder="https://github.com/owner/repo/pull/123"
              hint="Only the PR's changed lines are reviewed. The repo must be connected under Repositories (GitHub App). Opened PRs are reviewed automatically."
            />
            </div>
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
    </Page>
  );
}
