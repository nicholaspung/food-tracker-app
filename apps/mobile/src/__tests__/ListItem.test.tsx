import React from 'react';
import { act, create } from 'react-test-renderer';

import { ListItem } from '../ui/ListItem';

const mockReact = React;
const theme = {
  colors: {
    background: {
      muted: 'muted-background',
      surface: 'surface-background',
    },
    border: {
      subtle: 'subtle-border',
    },
  },
  radii: {
    md: 12,
  },
  spacing: {
    md: 16,
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
    StyleSheet: {
      create: <T,>(styles: T) => styles,
    },
    View: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
      React.createElement('View', props, children),
  };
});

jest.mock('../theme', () => ({
  useTheme: () => theme,
}));

jest.mock('../ui/Text', () => ({
  Text: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Text', props, children),
}));

function hasAncestor(node: any, possibleAncestor: any) {
  let current = node.parent;

  while (current) {
    if (current === possibleAncestor) {
      return true;
    }

    current = current.parent;
  }

  return false;
}

describe('ListItem', () => {
  it('announces disabled state for disabled pressable rows', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <ListItem
          disabled
          onPress={jest.fn()}
          testID="disabled-row"
          title="Disabled row"
        />,
      );
    });

    const rowPressable = renderer.root
      .findAllByType('Pressable')
      .find((node: any) => node.props.testID === 'disabled-row');

    expect(rowPressable?.props.accessibilityState).toEqual({ disabled: true });
  });

  it('keeps separate trailing actions outside the row press target', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <ListItem
          onPress={jest.fn()}
          separateTrailingAction
          testID="restaurant-row"
          title="Restaurant"
          trailing={<PressableAction />}
        />,
      );
    });

    const rowPressable = renderer.root
      .findAllByType('Pressable')
      .find((node: any) => node.props.testID === 'restaurant-row');
    const trailingAction = renderer.root
      .findAllByType('Pressable')
      .find((node: any) => node.props.testID === 'trailing-action');

    expect(rowPressable).toBeTruthy();
    expect(trailingAction).toBeTruthy();
    expect(hasAncestor(trailingAction, rowPressable)).toBe(false);
  });

  it('announces disabled state for rows with separate trailing actions', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <ListItem
          disabled
          onPress={jest.fn()}
          separateTrailingAction
          testID="disabled-content-row"
          title="Restaurant"
          trailing={<PressableAction />}
        />,
      );
    });

    const rowPressable = renderer.root
      .findAllByType('Pressable')
      .find((node: any) => node.props.testID === 'disabled-content-row');

    expect(rowPressable?.props.accessibilityState).toEqual({ disabled: true });
  });
});

function PressableAction() {
  return mockReact.createElement('Pressable', { testID: 'trailing-action' });
}
