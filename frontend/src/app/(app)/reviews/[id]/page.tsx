'use client';

import { AlertTriangle, Check, Download, GitPullRequest, Trash2 } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AgentProgress } from '@/components/review/agent-progress';
import { FileCard, anchorId } from '@/components/review/file-card';
import { FileTree } from '@/components/review/file-tree';
import { FindingThread } from '@/components/review/finding-thread';
import { ReviewToolbar } from '@/components/review/review-toolbar';
import { SummaryPanel } from '@/components/review/summary-panel';
import {
  Alert,
  Button,
  Card,
  EmptyState,
  ListSkeleton,
  Page,
  Spinner,
} from '@/components/ui/primitives';
import { useReviewSocket } from '@/hooks/use-review-socket';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { SEVERITY_ORDER } from '@/lib/display';
import type { Finding, FindingStatus, Patch, ReviewDetail, Severity } from '@/lib/types';
import { cn } from '@/lib/utils';

type Tab = 'conversation' | 'files' | 'checks';

export default function ReviewPage() {
  const params = useParams<{ id: string }>();
  const reviewId = params.id;
  const router = useRouter();
  const { accessToken } = useAuth();

  const [review, setReview] = useState<ReviewDetail | undefined>(undefined);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [patches, setPatches] = useState<Patch[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);
  const [tab, setTab] = useState<Tab>('conversation');
  const [pendingId, setPendingId] = useState<string | undefined>(undefined);

  const inFlight =
    review?.status === 'queued' || review?.status === 'running' || review === undefined;
  const socket = useReviewSocket(reviewId, inFlight, accessToken);

  // Fetches the review and, once it has finished, its findings and patches.
  // State is written from promise callbacks and guarded by `isCancelled`, so a
  // slow response cannot clobber newer state after the user navigates away.
  const load = useCallback(
    (isCancelled: () => boolean = () => false) =>
      api
        .getReview(reviewId)
        .then(async (detail) => {
          if (isCancelled()) return;
          setReview(detail);
          if (detail.status !== 'completed') return;

          const [loadedFindings, loadedPatches] = await Promise.all([
            api.listFindings(reviewId),
            api.listPatches(reviewId),
          ]);
          if (isCancelled()) return;
          setFindings(loadedFindings);
          setPatches(loadedPatches);
          // Findings only exist once the run finishes; that is the moment the
          // file view becomes the more useful one.
          setTab((current) => (current === 'conversation' ? 'files' : current));
        })
        .catch(() => {
          if (!isCancelled()) setError('Could not load the review.');
        }),
    [reviewId],
  );

  useEffect(() => {
    let cancelled = false;
    void load(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [load]);

  // The socket says when the run ends; re-read the authoritative result then.
  useEffect(() => {
    if (socket.terminal === undefined) return;
    let cancelled = false;
    void load(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [socket.terminal, load]);

  // Fallback for a socket that never connected.
  useEffect(() => {
    if (review === undefined) return;
    if (review.status !== 'queued' && review.status !== 'running') return;
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
  }, [review, load]);

  const handleStatusChange = useCallback(
    async (finding: Finding, status: FindingStatus) => {
      setPendingId(finding.id);
      try {
        const updated = await api.updateFinding(reviewId, finding.id, status);
        setFindings((current) =>
          current.map((item) => (item.id === updated.id ? updated : item)),
        );
      } finally {
        setPendingId(undefined);
      }
    },
    [reviewId],
  );

  async function handleDelete() {
    await api.deleteReview(reviewId);
    router.push('/dashboard');
  }

  async function handleDownload() {
    try {
      const { blob, filename } = await api.downloadRefactored(reviewId);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError('Could not download the refactored code.');
    }
  }

  if (error !== undefined) {
    return (
      <Page className="max-w-3xl">
        <Alert>{error}</Alert>
      </Page>
    );
  }

  if (review === undefined) {
    return (
      <Page wide>
        <div className="mb-8 flex flex-col gap-3">
          <div className="skeleton h-8 w-64" />
          <div className="skeleton h-4 w-40" />
        </div>
        <ListSkeleton rows={5} />
      </Page>
    );
  }

  const openFindings = findings.filter((f) => f.status === 'open');

  return (
    <Page wide>
      <header className="border-base-300 border-b">
        <div className="flex flex-wrap items-start justify-between gap-3 pb-4">
          <div className="min-w-0">
            <h1 className="text-title flex items-center gap-2">
              {review.source.kind === 'pull_request' && (
                <GitPullRequest aria-hidden className="text-muted size-5 shrink-0" />
              )}
              <span className="truncate">{review.source.label}</span>
            </h1>
            <p className="text-muted mt-2 text-sm">
              {review.stats.files_analysed || review.files.length} files ·{' '}
              <code className="font-mono">{review.llm_model}</code>
              {review.source.commit_sha !== undefined &&
                review.source.commit_sha !== null && (
                  <>
                    {' '}
                    ·{' '}
                    <code className="font-mono">
                      {review.source.commit_sha.slice(0, 7)}
                    </code>
                  </>
                )}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {patches.length > 0 && (
              <Button size="sm" variant="secondary" onClick={() => void handleDownload()}>
                <Download aria-hidden className="size-3.5" />
                Download refactored code
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => void handleDelete()}>
              <Trash2 aria-hidden className="size-3.5" />
              Delete
            </Button>
          </div>
        </div>

        <nav role="tablist" aria-label="Review sections" className="tabs tabs-border">
          <TabButton id="conversation" active={tab} onSelect={setTab} label="Summary" />
          <TabButton
            id="files"
            active={tab}
            onSelect={setTab}
            label="Files"
            count={review.files.length}
          />
          <TabButton
            id="checks"
            active={tab}
            onSelect={setTab}
            label="Fixes"
            count={patches.length}
          />
        </nav>
      </header>

      {review.status === 'failed' && (
        <div className="mt-4">
          <Alert>{review.error ?? 'The review failed.'}</Alert>
        </div>
      )}

      {(review.status === 'queued' || review.status === 'running') && (
        <div className="mt-4">
          <AgentProgress stages={socket.stages} connected={socket.connected} />
        </div>
      )}

      <div className="mt-6">
        {tab === 'conversation' && (
          <ConversationTab
            review={review}
            findings={openFindings}
            allFindings={findings}
            pendingId={pendingId}
            onStatusChange={handleStatusChange}
          />
        )}
        {tab === 'files' && (
          <FilesTab
            review={review}
            findings={findings}
            pendingId={pendingId}
            onStatusChange={handleStatusChange}
          />
        )}
        {tab === 'checks' && <ChecksTab patches={patches} />}
      </div>
    </Page>
  );
}

function TabButton({
  id,
  active,
  onSelect,
  label,
  count,
}: {
  id: Tab;
  active: Tab;
  onSelect: (tab: Tab) => void;
  label: string;
  count?: number;
}) {
  const isActive = active === id;
  return (
    <button
      role="tab"
      type="button"
      aria-selected={isActive}
      onClick={() => onSelect(id)}
      className={cn('tab gap-2', isActive && 'tab-active')}
    >
      {label}
      {count !== undefined && (
        <span
          className={cn(
            'badge badge-sm tabular-nums',
            isActive ? 'badge-primary badge-soft' : 'badge-ghost',
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function ConversationTab({
  review,
  findings,
  allFindings,
  pendingId,
  onStatusChange,
}: {
  review: ReviewDetail;
  findings: Finding[];
  allFindings: Finding[];
  pendingId: string | undefined;
  onStatusChange: (finding: Finding, status: FindingStatus) => void;
}) {
  const ranked = useMemo(
    () =>
      [...findings].sort(
        (a, b) =>
          SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) ||
          b.confidence - a.confidence,
      ),
    [findings],
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
      <div className="min-w-0">
        {review.status === 'completed' && allFindings.length === 0 ? (
          <EmptyState
            title="No findings"
            description="Neither static analysis nor the agents found a defect worth reporting in this code."
          />
        ) : ranked.length === 0 && allFindings.length > 0 ? (
          <EmptyState
            title="No open findings left"
            description="Every finding was resolved or dismissed. Open the Files tab to see them all."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {ranked.map((finding) => (
              <li key={finding.id}>
                <Card className="overflow-hidden">
                  <div className="border-base-300 bg-base-200/60 border-b px-4 py-1.5">
                    <code className="text-muted font-mono text-xs">
                      {finding.file_path}:{finding.line_start}
                    </code>
                  </div>
                  <FindingThread
                    finding={finding}
                    busy={pendingId === finding.id}
                    onStatusChange={(status) => onStatusChange(finding, status)}
                  />
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>

      <aside>
        <SummaryPanel review={review} />
      </aside>
    </div>
  );
}

/**
 * Every reviewed file in one scroll, the way a pull request's "files changed"
 * page presents them: a pinned toolbar, a map on the left, and the source
 * stacked on the right with findings threaded in.
 *
 * Files arrive ordered by how much is wrong with them, and only the ones
 * carrying findings open by default - the reviewer's attention is the scarce
 * resource, and a clean file does not deserve any of it.
 */
function FilesTab({
  review,
  findings,
  pendingId,
  onStatusChange,
}: {
  review: ReviewDetail;
  findings: Finding[];
  pendingId: string | undefined;
  onStatusChange: (finding: Finding, status: FindingStatus) => void;
}) {
  const ordered = useMemo(
    () => [...review.files].sort((a, b) => b.finding_count - a.finding_count),
    [review.files],
  );

  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(ordered.filter((file) => file.finding_count > 0).map((f) => f.path)),
  );
  const [viewed, setViewed] = useState<Set<string>>(() => new Set());
  const [severityFilter, setSeverityFilter] = useState<Set<Severity>>(() => new Set());
  const [query, setQuery] = useState('');
  const [activePath, setActivePath] = useState<string | undefined>(ordered[0]?.path);

  const byPath = useMemo(() => {
    const map = new Map<string, Finding[]>();
    for (const finding of findings) {
      const bucket = map.get(finding.file_path);
      if (bucket === undefined) map.set(finding.file_path, [finding]);
      else bucket.push(finding);
    }
    return map;
  }, [findings]);

  const worstByPath = useMemo(() => {
    const map = new Map<string, Severity>();
    for (const [path, list] of byPath) {
      for (const finding of list) {
        const current = map.get(path);
        if (
          current === undefined ||
          SEVERITY_ORDER.indexOf(finding.severity) < SEVERITY_ORDER.indexOf(current)
        ) {
          map.set(path, finding.severity);
        }
      }
    }
    return map;
  }, [byPath]);

  const counts = useMemo(() => {
    const totals = Object.fromEntries(SEVERITY_ORDER.map((s) => [s, 0])) as Record<
      Severity,
      number
    >;
    for (const finding of findings) totals[finding.severity] += 1;
    return totals;
  }, [findings]);

  /** Findings a file should show under the active severity filter. */
  const shownFindings = useCallback(
    (path: string) => {
      const list = byPath.get(path) ?? [];
      if (severityFilter.size === 0) return list;
      return list.filter((finding) => severityFilter.has(finding.severity));
    },
    [byPath, severityFilter],
  );

  // A severity filter narrows the file list too: asking for "critical only"
  // and still being handed forty clean files is not a filter.
  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('en');
    return ordered.filter((file) => {
      if (needle !== '' && !file.path.toLocaleLowerCase('en').includes(needle)) {
        return false;
      }
      if (severityFilter.size === 0) return true;
      return shownFindings(file.path).length > 0;
    });
  }, [ordered, query, severityFilter, shownFindings]);

  // Which file the reviewer is looking at, so the tree can follow along.
  const onScreen = useRef<Set<string>>(new Set());
  const visiblePaths = useMemo(() => visible.map((file) => file.path), [visible]);

  useEffect(() => {
    onScreen.current = new Set();
    const elements = visiblePaths
      .map((path) => document.getElementById(anchorId(path)))
      .filter((element): element is HTMLElement => element !== null);
    // Nothing to watch. Any leftover active path simply matches no rendered
    // tree entry, so the tree shows no selection - which is the truth.
    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const path = entry.target.getAttribute('data-path');
          if (path === null) continue;
          if (entry.isIntersecting) onScreen.current.add(path);
          else onScreen.current.delete(path);
        }
        // The topmost file still on screen is the one being read.
        setActivePath(
          visiblePaths.find((path) => onScreen.current.has(path)) ?? visiblePaths[0],
        );
      },
      { rootMargin: '-140px 0px -55% 0px' },
    );

    for (const element of elements) observer.observe(element);
    return () => observer.disconnect();
  }, [visiblePaths]);

  function toggle(set: Set<string>, key: string): Set<string> {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  }

  function handleSelect(path: string) {
    setExpanded((current) => (current.has(path) ? current : new Set(current).add(path)));
    const element = document.getElementById(anchorId(path));
    if (element === null) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    element.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  }

  if (review.files.length === 0) {
    return <EmptyState title="No files" description="This review has no files." />;
  }

  return (
    <div>
      <ReviewToolbar
        fileCount={visible.length}
        counts={counts}
        active={severityFilter}
        onToggleSeverity={(severity) =>
          setSeverityFilter((current) => {
            const next = new Set(current);
            if (next.has(severity)) next.delete(severity);
            else next.add(severity);
            return next;
          })
        }
        query={query}
        onQueryChange={setQuery}
        onExpandAll={() => setExpanded(new Set(visiblePaths))}
        onCollapseAll={() => setExpanded(new Set())}
      />

      <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
        <Card className="top-[calc(var(--app-header-height)+var(--review-toolbar-height)+1rem)] hidden h-fit max-h-[calc(100vh-10rem)] overflow-y-auto py-1 lg:sticky lg:block">
          <FileTree
            files={visible}
            worstByPath={worstByPath}
            viewed={viewed}
            activePath={activePath}
            onSelect={handleSelect}
          />
        </Card>

        <div className="min-w-0">
          {visible.length === 0 ? (
            <EmptyState
              title="No matching files"
              description="Change the search term or clear the severity filter."
            />
          ) : (
            <ul className="flex flex-col gap-4">
              {visible.map((file) => (
                <li key={file.path}>
                  <FileCard
                    reviewId={review.id}
                    file={file}
                    findings={shownFindings(file.path)}
                    expanded={expanded.has(file.path) && !viewed.has(file.path)}
                    viewed={viewed.has(file.path)}
                    onToggleExpanded={() =>
                      setExpanded((current) => toggle(current, file.path))
                    }
                    onToggleViewed={() =>
                      setViewed((current) => toggle(current, file.path))
                    }
                    onStatusChange={onStatusChange}
                    pendingId={pendingId}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function ChecksTab({ patches }: { patches: Patch[] }) {
  if (patches.length === 0) {
    return (
      <EmptyState
        title="No fixes generated"
        description="The refactor agent only produces fixes for medium-or-higher findings."
      />
    );
  }

  return (
    <ul className="flex flex-col gap-4">
      {patches.map((patch) => (
        <li key={patch.file_path}>
          <Card className="overflow-hidden">
            <header className="border-base-300 bg-base-200/60 flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
              <code className="font-mono text-xs font-medium">{patch.file_path}</code>
              <span className="text-muted text-xs">
                {patch.addresses_findings}{' '}
                {patch.addresses_findings === 1 ? 'finding targeted' : 'findings targeted'}
              </span>
              <span
                className={cn(
                  'ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset',
                  patch.validated
                    ? 'bg-verified-soft text-verified ring-verified-ring'
                    : 'bg-severity-medium-soft text-severity-medium ring-severity-medium-ring',
                )}
              >
                {patch.validated ? (
                  <Check aria-hidden className="size-3.5" />
                ) : (
                  <AlertTriangle aria-hidden className="size-3.5" />
                )}
                {patch.validated ? 'Validated' : 'Not validated'}
              </span>
            </header>

            <p className="border-base-300 text-muted border-b px-4 py-2 font-mono text-xs">
              {patch.validation_output}
            </p>

            <pre className="code-surface bg-code-background max-h-[28rem] overflow-auto p-4">
              <code>
                {patch.unified_diff.split('\n').map((line, index) => (
                  <div
                    key={index}
                    className={cn(
                      'px-1',
                      line.startsWith('+') && !line.startsWith('+++')
                        ? 'bg-line-added text-verified'
                        : line.startsWith('-') && !line.startsWith('---')
                          ? 'bg-line-removed text-danger'
                          : undefined,
                    )}
                  >
                    {line || ' '}
                  </div>
                ))}
              </code>
            </pre>
          </Card>
        </li>
      ))}
    </ul>
  );
}
