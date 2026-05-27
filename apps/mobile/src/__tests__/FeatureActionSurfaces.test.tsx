import React from 'react';
import { act, create } from 'react-test-renderer';

import { FeatureActionCard } from '../components/shared/FeatureActionCard';
import { FeatureActionListRow } from '../components/shared/FeatureActionListRow';

const mockReact = React;
const theme = {
  colors: {
    background: {
      app: 'app-background',
      muted: 'muted-background',
      surface: 'surface-background',
    },
    border: {
      brand: 'brand-border',
      default: 'default-border',
      subtle: 'subtle-border',
    },
    text: {
      brand: 'brand-text',
      muted: 'muted-text',
      secondary: 'secondary-text',
    },
  },
  radii: {
    md: 12,
  },
  spacing: {
    sm: 12,
    xs: 8,
    xxs: 4,
  },
  typography: {
    bodySm: {},
    titleSm: {},
  },
} as const;

jest.mock('@expo/vector-icons', () => ({
  Ionicons: (props: Record<string, unknown>) => mockReact.createElement('Ionicons', props),
}));

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
    StyleSheet: {
      create: <T,>(styles: T) => styles,
    },
    View: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
      React.createElement('View', props, children),
  };
});

jest.mock('../theme', () => ({
  createThemedStyles:
    (factory: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) =>
      factory(theme, ...args),
  useTheme: () => theme,
}));

jest.mock('../ui', () => ({
  Card: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Card', props, children),
  Text: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Text', props, children),
}));

describe('FeatureActionCard', () => {
  it('uses a lock trailing icon when disabled', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <FeatureActionCard
          disabled
          iconBackground="icon-background"
          iconColor="icon-color"
          iconName="images-outline"
          onPress={jest.fn()}
          title="Process Photos"
        />,
      );
    });

    expect(renderer.root.findAllByType('Ionicons').map((node: any) => node.props.name)).toContain('lock-closed-outline');
  });

  it('omits the default chevron when trailing is hidden', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <FeatureActionCard
          iconBackground="icon-background"
          iconColor="icon-color"
          iconName="flash-outline"
          onPress={jest.fn()}
          showTrailing={false}
          title="Food Product"
        />,
      );
    });

    expect(renderer.root.findAllByType('Ionicons').map((node: any) => node.props.name)).not.toContain('chevron-forward');
  });
});

describe('FeatureActionListRow', () => {
  it('passes action copy and press behavior through to OptionListRow', async () => {
    const onPress = jest.fn();
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <FeatureActionListRow
          description="Create and manage bill splits"
          iconBackground="icon-background"
          iconColor="icon-color"
          iconName="cash-outline"
          onPress={onPress}
          testID="feature-bill-splitter"
          title="Split a Bill"
        />,
      );
    });

    const row = renderer.root.findByType('Pressable');
    expect(row.props.onPress).toBe(onPress);
    expect(row.props.testID).toBe('feature-bill-splitter');
    expect(renderer.root.findAllByType('Text').map((node: any) => node.children.join(''))).toEqual([
      'Split a Bill',
      'Create and manage bill splits',
    ]);
  });
});
