import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FindingThread } from '@/components/review/finding-thread';
import type { Finding } from '@/lib/types';

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'f1',
    file_path: 'app.py',
    line_start: 31,
    line_end: 31,
    severity: 'critical',
    category: 'sql-injection',
    title: 'SQL query built from user input',
    explanation: 'Input is concatenated directly into the query.',
    suggested_fix: 'conn.execute("SELECT 1 WHERE x = ?", (x,))',
    owasp: 'A03:2021-Injection',
    cwe: 'CWE-89',
    origin: 'hybrid',
    tool: 'bandit',
    rule_id: 'B608',
    agent: 'BackendAgent',
    lens: 'security',
    layer: 'backend',
    confidence: 0.95,
    corroborated_by: ['bandit:B608', 'ruff:S608'],
    status: 'open',
    ...overrides,
  };
}

describe('FindingThread', () => {
  it('shows the severity, title and explanation', () => {
    render(<FindingThread finding={makeFinding()} onStatusChange={vi.fn()} />);

    expect(screen.getByText('Critical')).toBeInTheDocument();
    expect(screen.getByText('SQL query built from user input')).toBeInTheDocument();
    expect(
      screen.getByText('Input is concatenated directly into the query.'),
    ).toBeInTheDocument();
  });

  it('names the tools that corroborated an agent finding', () => {
    render(<FindingThread finding={makeFinding()} onStatusChange={vi.fn()} />);

    expect(screen.getByText(/Confirmed by bandit:B608, ruff:S608/)).toBeInTheDocument();
    expect(screen.getByText('BackendAgent')).toBeInTheDocument();
  });

  it('warns when nothing corroborated the model', () => {
    render(
      <FindingThread
        finding={makeFinding({ origin: 'llm', corroborated_by: [] })}
        onStatusChange={vi.fn()}
      />,
    );

    expect(screen.getByText('No static confirmation')).toBeInTheDocument();
  });

  it('keeps the suggested fix collapsed until asked for', async () => {
    const user = userEvent.setup();
    render(<FindingThread finding={makeFinding()} onStatusChange={vi.fn()} />);

    expect(screen.queryByText(/SELECT 1 WHERE/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Suggested fix/ }));

    expect(screen.getByText(/SELECT 1 WHERE/)).toBeInTheDocument();
  });

  it('reports a resolve action to its caller', async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn();
    render(<FindingThread finding={makeFinding()} onStatusChange={onStatusChange} />);

    await user.click(screen.getByRole('button', { name: /Mark as resolved/ }));

    expect(onStatusChange).toHaveBeenCalledWith('resolved');
  });

  it('offers to reopen a dismissed finding', async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn();
    render(
      <FindingThread
        finding={makeFinding({ status: 'dismissed' })}
        onStatusChange={onStatusChange}
      />,
    );

    expect(screen.getByText('Dismissed')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reopen' }));

    expect(onStatusChange).toHaveBeenCalledWith('open');
  });

  it('omits the fix control when the agent could not propose one', () => {
    render(
      <FindingThread
        finding={makeFinding({ suggested_fix: undefined })}
        onStatusChange={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole('button', { name: /Suggested fix/ }),
    ).not.toBeInTheDocument();
  });
});
