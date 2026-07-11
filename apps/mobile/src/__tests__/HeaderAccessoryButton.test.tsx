import React from 'react';
import { act, create } from 'react-test-renderer';

import { HeaderAccessoryButton } from '../components/shared/HeaderAccessoryButton';

const mockReact = React;
const theme = {
  colors: {
    background: {
      muted: 'muted-background',
      surface: 'surface-background',
    },
    border: { subtle: 'subtle-border' },
    text: { primary: 'primary-text' },
  },
  radii: { pill: 999 },
  spacing: { sm: 12, xxs: 4 },
} as const;

jest.mock('react-native', () => ({
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
}));

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

describe('HeaderAccessoryButton', () => {
  it('provides a reliable 44-point target without changing label sizing', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <HeaderAccessoryButton label="Add note" onPress={jest.fn()} testID="header-action" />,
      );
    });

    const button = renderer.root.findByType('Pressable');
    expect(button.props.testID).toBe('header-action');
    expect(button.props.style).toEqual(expect.arrayContaining([
      expect.objectContaining({ minHeight: 44 }),
    ]));
    expect(button.props.accessibilityRole).toBe('button');
  });
});
