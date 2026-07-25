import React from 'react';
import { act, create } from 'react-test-renderer';

import { FilterChipGroup } from '../components/shared/FilterChipGroup';

const mockReact = React;
const theme = {
  colors: {
    border: {
      info: 'info-border',
      subtle: 'subtle-border',
    },
    status: {
      infoBg: 'info-background',
    },
    text: {
      info: 'info-text',
      secondary: 'secondary-text',
    },
  },
  radii: {
    pill: 999,
  },
  spacing: {
    sm: 12,
    xs: 8,
    xxs: 4,
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
    ScrollView: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
      React.createElement('ScrollView', props, children),
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

jest.mock('../ui', () => ({
  Text: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Text', props, children),
}));

function getTextContent(node: any): string {
  if (typeof node === 'string') {
    return node;
  }

  return node.children.map(getTextContent).join('');
}

function flattenStyle(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) {
    return style.reduce(
      (result, entry) => ({ ...result, ...flattenStyle(entry) }),
      {},
    );
  }

  return style && typeof style === 'object' ? style as Record<string, unknown> : {};
}

describe('FilterChipGroup', () => {
  it('keeps every chip at least 44 points tall and announces selected state', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <FilterChipGroup
          onChange={jest.fn()}
          options={[
            { label: 'All', value: 'all' },
            { label: 'Visits', value: 'visits' },
          ]}
          chipStyle={{ minHeight: 20 }}
          value="visits"
        />,
      );
    });

    const chips = renderer.root.findAllByType('Pressable');
    const visitsChip = chips.find((node: any) => getTextContent(node) === 'Visits');
    const allChip = chips.find((node: any) => getTextContent(node) === 'All');

    expect(visitsChip?.props.accessibilityState).toEqual({ selected: true });
    expect(allChip?.props.accessibilityState).toEqual({ selected: false });
    expect(flattenStyle(visitsChip?.props.style)).toEqual(
      expect.objectContaining({
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 44,
      }),
    );
    expect(flattenStyle(allChip?.props.style)).toEqual(
      expect.objectContaining({
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 44,
      }),
    );
  });
});
