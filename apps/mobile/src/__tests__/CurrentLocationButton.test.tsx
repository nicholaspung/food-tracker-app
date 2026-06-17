import React from 'react';
import { act, create } from 'react-test-renderer';

import { CurrentLocationButton } from '../components/shared/CurrentLocationButton';

const mockReact = React;
const theme = {
  colors: {
    background: {
      surface: 'surface-background',
    },
    border: {
      default: 'default-border',
    },
    text: {
      secondary: 'secondary-text',
      success: 'success-text',
    },
  },
  radii: {
    md: 12,
  },
  sizes: {
    inputMinHeight: 44,
  },
  spacing: {
    sm: 12,
    xxs: 4,
  },
} as const;

jest.mock('react-native', () => {
  const React = jest.requireActual<typeof import('react')>('react');

  return {
    ActivityIndicator: (props: Record<string, unknown>) => React.createElement('ActivityIndicator', props),
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

jest.mock('../ui/AppIcon', () => ({
  Ionicons: (props: Record<string, unknown>) => mockReact.createElement('Ionicons', props),
}));

describe('CurrentLocationButton', () => {
  it('announces disabled and busy state while locating', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(<CurrentLocationButton loading onPress={jest.fn()} />);
    });

    const button = renderer.root.findByType('Pressable');

    expect(button.props.accessibilityLabel).toBe('Use current location');
    expect(button.props.accessibilityState).toEqual({ busy: true, disabled: true });
    expect(renderer.root.findByType('ActivityIndicator')).toBeTruthy();
  });
});
