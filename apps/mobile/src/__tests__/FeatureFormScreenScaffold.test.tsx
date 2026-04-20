import React from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import { act, create } from 'react-test-renderer';

import { FeatureFormScreenScaffold } from '../components/shared/FeatureFormScreenScaffold';

const mockReact = React;

const TEST_THEME = {
  colors: {
    background: {
      app: 'app-background',
      surface: 'surface-background',
    },
    border: {
      subtle: 'subtle-border',
    },
  },
  spacing: {
    none: 0,
    xs: 8,
    sm: 12,
    md: 16,
    xl: 24,
  },
  sizes: {
    buttonHeight: 48,
  },
} as const;

jest.mock('react-native-keyboard-controller', () => ({
  KeyboardAwareScrollView: (
    { children, ...props }: Record<string, unknown> & { children?: React.ReactNode },
  ) => mockReact.createElement('KeyboardAwareScrollView', props, children),
}));

jest.mock('../theme', () => ({
  createThemedStyles:
    <Args extends unknown[], Styles>(
      factory: (theme: typeof TEST_THEME, ...args: Args) => Styles,
    ) =>
    (...args: Args) =>
      factory(TEST_THEME, ...args),
  useTheme: () => TEST_THEME,
}));

jest.mock('../ui', () => ({
  Button: (props: Record<string, unknown>) => mockReact.createElement('Button', props),
  Screen: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Screen', props, children),
}));

jest.mock('../components/shared/ScreenHeader', () => ({
  ScreenHeader: (props: Record<string, unknown>) => mockReact.createElement('ScreenHeader', props),
}));

function flattenStyle(style: unknown) {
  return StyleSheet.flatten(style) as Record<string, unknown>;
}

function renderScaffold(props: Partial<React.ComponentProps<typeof FeatureFormScreenScaffold>> = {}) {
  return create(
    <FeatureFormScreenScaffold
      onBackPress={() => {}}
      primaryAction={{
        label: 'Save',
        onPress: () => {},
      }}
      title="Feature Form"
      {...props}
    >
      {props.children ?? 'Body'}
    </FeatureFormScreenScaffold>,
  );
}

describe('FeatureFormScreenScaffold', () => {
  it('uses the split background treatment by default', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = renderScaffold();
    });

    const screen = renderer!.root.findByType('Screen');
    expect(screen.props.background).toBe('surface');

    const backgroundUnderlay = renderer!.root.find(
      (node: any) => node.type === 'View' && node.props.pointerEvents === 'none',
    );
    const backgroundStyle = flattenStyle(backgroundUnderlay.props.style);
    const expectedTopInset = Math.max(220, Math.round(Dimensions.get('window').height / 2));

    expect(backgroundStyle.backgroundColor).toBe(TEST_THEME.colors.background.app);
    expect(backgroundStyle.top).toBe(expectedTopInset);
  });

  it('keeps header bottom content on a surface background when split mode is enabled', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = renderScaffold({
        headerBottomContent: 'Header Bottom',
      });
    });

    const headerBottom = renderer!.root.find(
      (node: any) => node.type === 'View' && node.children.includes('Header Bottom'),
    );
    const headerBottomStyle = flattenStyle(headerBottom.props.style);

    expect(headerBottomStyle.backgroundColor).toBe(TEST_THEME.colors.background.surface);
    expect(headerBottomStyle.borderBottomWidth).toBe(1);
  });

  it('supports opting out of the split background treatment', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = renderScaffold({
        headerBottomContent: 'Flat Header Bottom',
        splitBackground: false,
      });
    });

    const screen = renderer!.root.findByType('Screen');
    expect(screen.props.background).toBe('app');

    const backgroundUnderlays = renderer!.root.findAll(
      (node: any) => node.type === 'View' && node.props.pointerEvents === 'none',
    );
    expect(backgroundUnderlays).toHaveLength(0);

    const headerBottom = renderer!.root.find(
      (node: any) => node.type === 'View' && node.children.includes('Flat Header Bottom'),
    );
    const headerBottomStyle = flattenStyle(headerBottom.props.style);

    expect(headerBottomStyle.backgroundColor).toBe(TEST_THEME.colors.background.app);
  });
});
