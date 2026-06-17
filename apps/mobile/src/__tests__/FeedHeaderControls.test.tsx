import React from 'react';
import { act, create } from 'react-test-renderer';

import { FeedHeaderControls } from '../components/shared/FeedHeaderControls';

const mockReact = React;
const theme = {
  colors: {
    background: {
      inverse: 'inverse-background',
      muted: 'muted-background',
      surface: 'surface-background',
    },
    border: {
      default: 'default-border',
      info: 'info-border',
      subtle: 'subtle-border',
    },
    fill: {
      brand: 'brand-fill',
    },
    status: {
      infoBg: 'info-background',
    },
    text: {
      info: 'info-text',
      inverse: 'inverse-text',
      muted: 'muted-text',
      primary: 'primary-text',
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
  typography: {
    bodyLg: {},
  },
} as const;

jest.mock('react-native', () => {
  const React = jest.requireActual<typeof import('react')>('react');

  return {
    Keyboard: {
      dismiss: jest.fn(),
    },
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
    TextInput: (props: Record<string, unknown>) => React.createElement('TextInput', props),
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
  Text: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Text', props, children),
}));

jest.mock('../components/shared/SegmentedControl', () => ({
  SegmentedControl: (props: Record<string, unknown>) => mockReact.createElement('SegmentedControl', props),
}));

function renderControls(overrides: Partial<React.ComponentProps<typeof FeedHeaderControls>> = {}) {
  return create(
    <FeedHeaderControls
      feedMode="mine"
      filtersExpanded={false}
      onClearSearch={jest.fn()}
      onFeedModeChange={jest.fn()}
      onSearchQueryChange={jest.fn()}
      onSortFilterChange={jest.fn()}
      onToggleFilters={jest.fn()}
      onTypeFilterChange={jest.fn()}
      onViewModeChange={jest.fn()}
      searchQuery="pizza"
      sortFilter="created"
      summaryText="3 ratings"
      typeFilter="all"
      viewMode="list"
      {...overrides}
    />,
  );
}

describe('FeedHeaderControls', () => {
  it('exposes Clear and Filters controls as buttons with filter expanded state', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = renderControls({ filtersExpanded: true });
    });

    const clearButton = renderer.root.findByProps({ accessibilityLabel: 'Clear search' });
    const filtersButton = renderer.root.findByProps({ accessibilityLabel: 'Filters' });

    expect(clearButton.props.accessibilityRole).toBe('button');
    expect(filtersButton.props.accessibilityRole).toBe('button');
    expect(filtersButton.props.accessibilityState).toEqual({ expanded: true });
  });
});
