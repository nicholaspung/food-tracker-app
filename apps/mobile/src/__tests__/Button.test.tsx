import React from 'react';
import { act, create } from 'react-test-renderer';

import { Button } from '../ui/Button';

const mockReact = React;
const theme = {
  colors: {
    button: {
      primaryBg: 'primary-background',
      primaryDisabledBg: 'primary-disabled-background',
      primaryPressed: 'primary-pressed-background',
      primaryText: 'primary-text',
      secondaryBg: 'secondary-background',
      secondaryBorder: 'secondary-border',
      secondaryDisabledBg: 'secondary-disabled-background',
      secondaryPressed: 'secondary-pressed-background',
      secondaryText: 'secondary-text',
    },
    border: {
      subtle: 'subtle-border',
    },
  },
  radii: {
    md: 12,
  },
  sizes: {
    buttonHeight: 48,
    secondaryButtonHeight: 40,
  },
  spacing: {
    md: 16,
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
  };
});

jest.mock('../theme', () => ({
  createThemedStyles:
    (factory: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) =>
      factory(theme, ...args),
  useTheme: () => theme,
}));

jest.mock('../ui/Text', () => ({
  Text: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Text', props, children),
}));

describe('Button', () => {
  it('announces disabled state for disabled actions', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(<Button disabled label="Save" onPress={jest.fn()} />);
    });

    const button = renderer.root.findByType('Pressable');

    expect(button.props.accessibilityLabel).toBe('Save');
    expect(button.props.accessibilityState).toEqual({ busy: false, disabled: true });
  });

  it('keeps the action name and announces busy state while loading', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(<Button label="Submit" loading onPress={jest.fn()} />);
    });

    const button = renderer.root.findByType('Pressable');

    expect(button.props.accessibilityLabel).toBe('Submit');
    expect(button.props.accessibilityState).toEqual({ busy: true, disabled: true });
    expect(renderer.root.findByType('ActivityIndicator')).toBeTruthy();
  });
});
