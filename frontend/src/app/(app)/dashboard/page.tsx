'use client';

import { FileText, FolderGit2, GitPullRequest, Terminal, Upload } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  Alert,
  Button,
  ListSkeleton,
  Page,
  PageHeader,
  Spinner,
} from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { SEVERITY_FILL, SEVERITY_LABEL, SEVERITY_ORDER, riskLabel } from '@/lib/display';
import type { ReviewSummary } from '@/lib/types';
import { cn, formatDuration, formatRelativeTime } from '@/lib/utils';

const SOURCE_ICON = {
  upload: Upload,
  paste: FileText,
  pull_request: GitPullRequest,
  github_app: GitPullRequest,
  ci: Terminal,
} as const;

const STATUS_LABEL = {
  queued: 'Queued',
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed',
} as const;

export default function DashboardPage() {
  const [reviews, setReviews] = useState<ReviewSummary[] | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  const load = useCallback(
    (isCancelled: () => boolean = () => false) =>
      api
        .listReviews()
        .then((loaded) => {
          if (!isCancelled()) setReviews(loaded);
        })
        .catch(() => {
          if (!isCancelled()) setError('Could not load reviews.');
        }),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    void load(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [load]);

  useEffect(() => {
    const pending = reviews?.some(
      (review) => review.status === 'queued' || review.status === 'running',
    );
    if (pending !== true) return;
    const timer = setInterval(() => void load(), 4000);
    return () => clearInterval(timer);
  }, [reviews, load]);

  const inFlight = useMemo(
    () =>
      reviews?.filter(
        (review) => review.status === 'queued' || review.status === 'running',
      ) ?? [],
    [reviews],
  );
  const settled = useMemo(
    () =>
      reviews?.filter(
        (review) => review.status !== 'queued' && review.status !== 'running',
      ) ?? [],
    [reviews],
  );

  return (
    <Page>
      <PageHeader
        title="Reviews"
        description="Pull requests and uploads, checked by security and quality agents."
        actions={
          <Button asChild variant="primary" className="hidden lg:inline-flex">
            <Link href="/reviews/new">Start a review</Link>
          </Button>
        }
      />

      {error !== undefined && (
        <div className="mb-6">
          <Alert>{error}</Alert>
        </div>
      )}

      {reviews === undefined ? (
        <ListSkeleton />
      ) : reviews.length === 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            href="/repos"
            className="card card-border bg-base-100 hover:border-primary/40 group transition-colors duration-200"
          >
            <div className="card-body gap-3 p-6">
              <span className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-xl">
                <FolderGit2 aria-hidden className="size-4" />
              </span>
              <h2 className="card-title text-base">Connect a repository</h2>
              <p className="text-muted text-sm leading-relaxed">
                Install the GitHub App. New pull requests are reviewed automatically.
              </p>
              <span className="text-primary text-sm font-medium">Connect GitHub</span>
            </div>
          </Link>
          <Link
            href="/reviews/new"
            className="card card-border bg-base-100 hover:border-primary/40 group transition-colors duration-200"
          >
            <div className="card-body gap-3 p-6">
              <span className="bg-secondary/10 text-secondary flex size-10 items-center justify-center rounded-xl">
                <Upload aria-hidden className="size-4" />
              </span>
              <h2 className="card-title text-base">Start from a file</h2>
              <p className="text-muted text-sm leading-relaxed">
                Upload files or paste a snippet to run agents and static analysis now.
              </p>
              <span className="text-primary text-sm font-medium">Start a review</span>
            </div>
          </Link>
        </div>
      ) : (
        <div className="space-y-8">
          {inFlight.length > 0 && (
            <section>
              <h2 className="text-eyebrow mb-3">In progress</h2>
              <ReviewList reviews={inFlight} />
            </section>
          )}
          <section>
            {inFlight.length > 0 && <h2 className="text-eyebrow mb-3">Completed</h2>}
            <ReviewList reviews={settled} />
          </section>
        </div>
      )}
    </Page>
  );
}

function ReviewList({ reviews }: { reviews: ReviewSummary[] }) {
  return (
    <ul className="border-base-300 bg-base-100 overflow-hidden rounded-box border">
      {reviews.map((review) => (
        <li key={review.id} className="border-base-300 border-b last:border-b-0">
          <ReviewRow review={review} />
        </li>
      ))}
    </ul>
  );
}

function ReviewRow({ review }: { review: ReviewSummary }) {
  const Icon = SOURCE_ICON[review.source.kind];
  const risk = riskLabel(review.risk_score);
  const total = SEVERITY_ORDER.reduce(
    (sum, severity) => sum + (review.stats.by_severity[severity] ?? 0),
    0,
  );
  const pending = review.status === 'queued' || review.status === 'running';

  return (
    <Link
      href={`/reviews/${review.id}`}
      className="hover:bg-base-200/70 flex min-h-16 items-center gap-4 px-4 py-3.5 transition-colors duration-200"
    >
      <span className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-xl">
        <Icon aria-hidden className="size-4" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium tracking-tight">
          {review.source.label || 'Untitled review'}
        </p>
        <p className="text-muted mt-0.5 flex flex-wrap items-center gap-x-2 text-xs">
          <span>{formatRelativeTime(review.created_at)}</span>
          <span aria-hidden>·</span>
          <span className="font-mono">{review.llm_model}</span>
          {review.duration_ms !== undefined && review.duration_ms !== null && (
            <>
              <span aria-hidden>·</span>
              <span className="tabular-nums">{formatDuration(review.duration_ms)}</span>
            </>
          )}
        </p>
      </div>

      {total > 0 && (
        <div className="hidden w-32 shrink-0 sm:block">
          <div className="bg-base-200 flex h-1.5 gap-px overflow-hidden rounded-full">
            {SEVERITY_ORDER.map((severity) => {
              const count = review.stats.by_severity[severity] ?? 0;
              if (count === 0) return null;
              return (
                <span
                  key={severity}
                  title={`${count} ${SEVERITY_LABEL[severity]}`}
                  className={SEVERITY_FILL[severity]}
                  style={{ width: `${(count / total) * 100}%` }}
                />
              );
            })}
          </div>
          <p className="text-muted mt-1 text-right text-xs tabular-nums">
            {total} {total === 1 ? 'finding' : 'findings'}
          </p>
        </div>
      )}

      <div className="w-28 shrink-0 text-right">
        {pending ? (
          <span className="text-primary inline-flex items-center gap-1.5 text-xs font-medium">
            <Spinner />
            {STATUS_LABEL[review.status]}
          </span>
        ) : review.status === 'failed' ? (
          <span className="text-error text-xs font-medium">{STATUS_LABEL.failed}</span>
        ) : (
          <>
            <p className={cn('text-lg font-semibold tabular-nums', risk.className)}>
              {review.risk_score}
            </p>
            <p className={cn('text-xs', risk.className)}>{risk.label}</p>
          </>
        )}
      </div>
    </Link>
  );
}
