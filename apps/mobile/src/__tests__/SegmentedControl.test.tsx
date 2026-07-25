import React from 'react';
import { act, create } from 'react-test-renderer';

import { SegmentedControl } from '../components/shared/SegmentedControl';

const mockReact = React;
const theme = {
  colors: {
    background: {
      app: 'app-background',
      inverse: 'inverse-background',
      surface: 'surface-background',
    },
    border: {
      default: 'default-border',
    },
    text: {
      muted: 'muted-text',
      primary: 'primary-text',
    },
  },
  spacing: {
    xs: 8,
  },
} as const;

jest.mock('react-native', () => {
  const React = jest.requireActual<typeof import('react')>('react');

  return {
    Pressable: ({
      children,
      ...props
    }: Record<string, unknown> & {
      children?: React.ReactNode | ((state: { pressed: boolean }) => React.ReactNode);
    }) =>
      React.createElement(
        'Pressable',
        props,
        typeof children === 'function' ? children({ pressed: false }) : children,
      ),
    View: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
      React.createElement('View', props, children),
  };
});

jest.mock('../theme', () => ({
  createThemedStyles:
    (factory: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) =>
      factory(theme, ...args),
}));

jest.mock('../theme/shadows', () => ({
  createPlatformShadow: () => ({}),
}));

jest.mock('../ui', () => ({
  Text: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Text', props, children),
}));

jest.mock('../components/shared/StatusPill', () => ({
  StatusPill: (props: Record<string, unknown>) => mockReact.createElement('StatusPill', props),
}));

function flattenStyle(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) {
    return style.reduce(
      (result, entry) => ({ ...result, ...flattenStyle(entry) }),
      {},
    );
  }

  return style && typeof style === 'object' ? style as Record<string, unknown> : {};
}

describe('SegmentedControl', () => {
  it('enforces 44-point segments after consumer styles and preserves selection', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <SegmentedControl
          onChange={jest.fn()}
          options={[
            { label: 'All', value: 'all' },
            { label: 'Friends', value: 'friends' },
          ]}
          segmentStyle={{ minHeight: 20 }}
          value="friends"
        />,
      );
    });

    const segments = renderer.root.findAllByType('Pressable');

    expect(segments).toHaveLength(2);
    expect(flattenStyle(segments[0].props.style({ pressed: false })).minHeight).toBe(44);
    expect(flattenStyle(segments[1].props.style({ pressed: false })).minHeight).toBe(44);
    expect(segments[0].props.accessibilityState).toEqual({ selected: false });
    expect(segments[1].props.accessibilityState).toEqual({ selected: true });
  });
});
