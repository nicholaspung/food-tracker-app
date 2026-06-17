import React from 'react';
import { act, create } from 'react-test-renderer';

import { IconActionCard } from '../components/shared/IconActionCard';

const mockReact = React;
const theme = {
  colors: {
    background: {
      muted: 'muted-background',
      surface: 'surface-background',
    },
    border: {
      brand: 'brand-border',
      default: 'default-border',
      subtle: 'subtle-border',
    },
  },
  radii: {
    md: 12,
  },
  spacing: {
    sm: 12,
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
}));

jest.mock('../ui', () => ({
  Card: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Card', props, children),
  Text: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Text', props, children),
}));

function flattenStyle(style: unknown) {
  const entries = Array.isArray(style) ? style : [style];

  return entries.reduce<Record<string, unknown>>((accumulator, entry) => {
    if (!entry || typeof entry !== 'object') {
      return accumulator;
    }

    return {
      ...accumulator,
      ...entry,
    };
  }, {});
}

describe('IconActionCard', () => {
  it('announces disabled state for disabled cards', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <IconActionCard
          disabled
          iconBackground="icon-background"
          iconColor="icon-color"
          iconName="image-outline"
          onPress={jest.fn()}
          title="Upload Image"
        />,
      );
    });

    const cardButton = renderer.root.findByType('Pressable');

    expect(cardButton.props.accessibilityState).toEqual({ disabled: true });
  });

  it('uses muted styling and quieter text tones when tone is muted', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <IconActionCard
          description="Photo Library"
          iconBackground="icon-background"
          iconColor="icon-color"
          iconName="image-outline"
          onPress={jest.fn()}
          title="Upload Image"
          tone="muted"
        />,
      );
    });

    const card = renderer.root.findByType('Card');
    const texts = renderer.root.findAllByType('Text');

    expect(flattenStyle(card.props.style)).toMatchObject({
      backgroundColor: 'muted-background',
      borderColor: 'subtle-border',
    });
    expect(texts[0].props.tone).toBe('secondary');
    expect(texts[1].props.tone).toBe('muted');
  });
});
