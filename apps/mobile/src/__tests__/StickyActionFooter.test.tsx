import React from 'react';
import { StyleSheet } from 'react-native';
import { act, create } from 'react-test-renderer';

import { StickyActionFooter } from '../components/shared/StickyActionFooter';

const mockReact = React;

const TEST_THEME = {
  colors: {
    background: {
      surface: 'surface-background',
    },
    border: {
      subtle: 'subtle-border',
    },
  },
  spacing: {
    sm: 12,
    md: 16,
  },
} as const;

jest.mock('react-native', () => {
  return {
    StyleSheet: {
      flatten: (style: unknown) => {
        if (Array.isArray(style)) {
          return Object.assign({}, ...style);
        }

        return style;
      },
    },
    View: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
      mockReact.createElement('View', props, children),
  };
});

jest.mock('../theme', () => ({
  createThemedStyles:
    <Args extends unknown[], Styles>(
      factory: (theme: typeof TEST_THEME, ...args: Args) => Styles,
    ) =>
    (...args: Args) =>
      factory(TEST_THEME, ...args),
}));

jest.mock('../ui', () => ({
  Button: (props: Record<string, unknown>) => mockReact.createElement('Button', props),
}));

function flattenStyle(style: unknown) {
  return StyleSheet.flatten(style) as Record<string, unknown>;
}

describe('StickyActionFooter', () => {
  it('renders the primary action in the shared footer container', () => {
    const onPress = jest.fn();
    let renderer: any = null;

    act(() => {
      renderer = create(
        <StickyActionFooter
          primaryAction={{
            disabled: true,
            label: 'Save Settings',
            loading: true,
            onPress,
            testID: 'settings-save-button',
            variant: 'secondary',
          }}
        />,
      );
    });

    const container = renderer.root.findByType('View');
    expect(flattenStyle(container.props.style)).toEqual(
      expect.objectContaining({
        backgroundColor: TEST_THEME.colors.background.surface,
        borderTopColor: TEST_THEME.colors.border.subtle,
        borderTopWidth: 1,
        flexDirection: 'row',
        gap: TEST_THEME.spacing.sm,
        paddingHorizontal: TEST_THEME.spacing.md,
        paddingVertical: TEST_THEME.spacing.sm,
      }),
    );

    const button = renderer.root.findByType('Button');
    expect(button.props).toEqual(
      expect.objectContaining({
        disabled: true,
        label: 'Save Settings',
        loading: true,
        onPress,
        testID: 'settings-save-button',
        variant: 'secondary',
      }),
    );
    expect(flattenStyle(button.props.style)).toEqual(
      expect.objectContaining({
        flex: 1,
      }),
    );
  });

  it('renders the secondary action before the primary action', () => {
    let renderer: any = null;

    act(() => {
      renderer = create(
        <StickyActionFooter
          primaryAction={{
            label: 'Save',
            onPress: jest.fn(),
          }}
          secondaryAction={{
            label: 'Cancel',
            onPress: jest.fn(),
            testID: 'cancel-button',
          }}
        />,
      );
    });

    const buttons = renderer.root.findAllByType('Button');

    expect(buttons.map((button: any) => button.props.label)).toEqual(['Cancel', 'Save']);
    expect(buttons[0].props.variant).toBe('secondary');
    expect(buttons[1].props.variant).toBe('primary');
    expect(buttons[0].props.testID).toBe('cancel-button');
  });
});
