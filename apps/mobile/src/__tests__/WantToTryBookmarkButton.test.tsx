import React from 'react';
import { act, create } from 'react-test-renderer';

import { WantToTryBookmarkButton } from '../components/shared/WantToTryBookmarkButton';

const mockReact = React;
const theme = {
  colors: {
    background: { muted: 'muted-background', surface: 'surface-background' },
    border: { default: 'default-border' },
    status: {
      infoBg: 'info-background',
      warningBg: 'warning-background',
      warningBorder: 'warning-border',
    },
    text: { secondary: 'secondary-text', warning: 'warning-text' },
  },
  radii: { md: 12, sm: 8 },
} as const;

jest.mock('react-native', () => ({
  ActivityIndicator: (props: Record<string, unknown>) =>
    mockReact.createElement('ActivityIndicator', props),
  Pressable: ({
    children,
    style,
    ...props
  }: Record<string, unknown> & {
    children?: React.ReactNode;
    style?: unknown | ((state: { pressed: boolean }) => unknown);
  }) =>
    mockReact.createElement(
      'Pressable',
      { ...props, style: typeof style === 'function' ? style({ pressed: false }) : style },
      children,
    ),
  StyleSheet: { create: <T,>(styles: T) => styles },
}));

jest.mock('../theme', () => ({ useTheme: () => theme }));

jest.mock('../ui/AppIcon', () => ({
  Ionicons: (props: Record<string, unknown>) => mockReact.createElement('Ionicons', props),
}));

describe('WantToTryBookmarkButton', () => {
  it('uses a 44-point inline target and exposes selected state', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <WantToTryBookmarkButton
          accessibilityLabel="Remove ramen from Want to Try"
          onPress={jest.fn()}
          saved
          testID="bookmark"
          variant="inline"
        />,
      );
    });

    const button = renderer.root.findByType('Pressable');
    expect(button.props.style).toEqual(expect.arrayContaining([
      expect.objectContaining({ height: 44, width: 44 }),
    ]));
    expect(button.props.accessibilityLabel).toBe('Remove ramen from Want to Try');
    expect(button.props.accessibilityRole).toBe('button');
    expect(button.props.accessibilityState).toEqual({ disabled: false, selected: true });
  });
});
