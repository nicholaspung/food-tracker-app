import React from 'react';
import { act, create } from 'react-test-renderer';

import { RatingLegend } from '../components/shared/RatingLegend';

const mockReact = React;
const theme = {
  colors: {
    border: {
      info: 'info-border',
    },
    rating: {
      five: 'rating-five',
      four: 'rating-four',
      one: 'rating-one',
      three: 'rating-three',
      two: 'rating-two',
    },
    text: {
      inverse: 'inverse-text',
      muted: 'muted-text',
      primary: 'primary-text',
      secondary: 'secondary-text',
    },
  },
  spacing: {
    sm: 12,
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
    StyleSheet: {
      create: <T,>(styles: T) => styles,
    },
    View: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
      React.createElement('View', props, children),
  };
});

jest.mock('../localPersistence', () => ({
  localPersistence: {
    uiPreferences: {
      keys: {
        ratingGuideExpanded: 'ui.ratingGuide.expanded',
      },
      storage: {
        getItem: jest.fn(),
        setItem: jest.fn(),
      },
    },
  },
}));

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

describe('RatingLegend', () => {
  it('exposes the toggle as a button with expanded state', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(<RatingLegend initiallyExpanded={false} persistenceKey={null} />);
    });

    const toggle = renderer.root.findByProps({ testID: 'rating-legend-toggle' });

    expect(toggle.props.accessibilityLabel).toBe('Rating Guide');
    expect(toggle.props.accessibilityRole).toBe('button');
    expect(toggle.props.accessibilityState).toEqual({ expanded: false });

    await act(async () => {
      toggle.props.onPress();
    });

    expect(renderer.root.findByProps({ testID: 'rating-legend-toggle' }).props.accessibilityState).toEqual({
      expanded: true,
    });
  });
});
