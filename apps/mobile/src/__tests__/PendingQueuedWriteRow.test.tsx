import React from 'react';
import { act, create } from 'react-test-renderer';

import { PendingQueuedWriteRow } from '../components/shared/PendingQueuedWriteRow';

const mockReact = React;

const theme = {
  colors: {
    background: {
      muted: 'muted',
      surface: 'surface',
    },
    border: {
      default: 'border',
      subtle: 'subtle',
    },
  },
  spacing: {
    md: 16,
    sm: 12,
    xs: 8,
    xxs: 4,
  },
} as const;

jest.mock('react-native', () => ({
  View: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('View', props, children),
}));

jest.mock('../theme', () => ({
  createThemedStyles:
    (factory: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) =>
      factory(theme, ...args),
}));

jest.mock('../ui', () => ({
  Card: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Card', props, children),
  Text: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Text', props, children),
}));

jest.mock('../components/shared/StatusPill', () => ({
  StatusPill: (props: Record<string, unknown>) => mockReact.createElement('StatusPill', props),
}));

function findText(root: any, value: string) {
  return root.findAll(
    (node: { type: unknown; children?: unknown[] }) =>
      node.type === 'Text' &&
      Array.isArray(node.children) &&
      node.children.join('') === value,
  );
}

describe('PendingQueuedWriteRow', () => {
  it.each([
    ['pending', 'Queued', 'Will sync when your connection is available.'],
    ['retrying', 'Retrying', 'Waiting for the next sync attempt.'],
    ['in_flight', 'Sending', 'Sending this write now.'],
    ['failed', 'Failed', 'Retry failed writes from the sync banner.'],
  ] as const)('renders %s status copy', (status, label, helperText) => {
    let renderer: any = null;
    act(() => {
      renderer = create(
        <PendingQueuedWriteRow
          status={status}
          title="Queued write"
        />,
      );
    });

    expect(renderer?.root.findByType('StatusPill').props.label).toBe(label);
    expect(findText(renderer!.root, helperText)).toHaveLength(1);
  });

  it('renders optional details and normalized errors', () => {
    let renderer: any = null;
    act(() => {
      renderer = create(
        <PendingQueuedWriteRow
          details={[{ label: 'Restaurant', value: 'Ramen Shop' }]}
          idempotencyKey="idem-1"
          lastError="  Network failed  "
          status="failed"
          title="Queued write"
        />,
      );
    });

    expect(findText(renderer!.root, 'Restaurant: Ramen Shop')).toHaveLength(1);
    expect(findText(renderer!.root, 'Request: idem-1')).toHaveLength(1);
    expect(findText(renderer!.root, 'Network failed')).toHaveLength(1);
  });
});
