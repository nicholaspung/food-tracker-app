import React from 'react';
import { act, create } from 'react-test-renderer';

import { AuthTopBar } from '../components/shared/AuthTopBar';

const mockReact = React;

jest.mock('react-native', () => ({
  Pressable: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Pressable', props, children),
  View: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('View', props, children),
}));

jest.mock('../components/shared/AuthBrandMark', () => ({
  AuthBrandMark: (props: Record<string, unknown>) => mockReact.createElement('AuthBrandMark', props),
}));

jest.mock('../theme', () => ({
  createThemedStyles: (factory: (theme: Record<string, any>) => Record<string, unknown>) => () =>
    factory({
      colors: {
        background: { muted: 'muted' },
        border: { subtle: 'subtle' },
      },
      radii: { pill: 999 },
      spacing: { sm: 8 },
    }),
  useTheme: () => ({
    colors: { text: { primary: 'primary' } },
  }),
}));

jest.mock('../ui/AppIcon', () => ({
  Ionicons: (props: Record<string, unknown>) => mockReact.createElement('Ionicons', props),
}));

describe('AuthTopBar', () => {
  it('gives the back control a 44-point target without changing its icon or behavior', () => {
    const onBackPress = jest.fn();
    let renderer: any;

    act(() => {
      renderer = create(
        <AuthTopBar backAccessibilityLabel="Return to login" onBackPress={onBackPress} />,
      );
    });

    const backButton = renderer.root.findByProps({ testID: 'screen-back-button' });
    expect(backButton.props.accessibilityLabel).toBe('Return to login');
    expect(backButton.props.accessibilityRole).toBe('button');
    expect(backButton.props.style).toMatchObject({ height: 44, width: 44 });
    expect(renderer.root.findByProps({ testID: 'screen-back-button-visual' }).props.style).toMatchObject({
      height: 36,
      width: 36,
    });
    expect(renderer.root.findByType('Ionicons').props).toMatchObject({
      name: 'chevron-back',
      size: 18,
    });

    act(() => {
      backButton.props.onPress();
    });

    expect(onBackPress).toHaveBeenCalledTimes(1);
  });
});
