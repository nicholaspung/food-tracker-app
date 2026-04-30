import React from 'react';
import { StyleSheet } from 'react-native';
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
  it('keeps a surface screen shell without rendering a midpoint underlay by default', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = renderScaffold();
    });

    const screen = renderer!.root.findByType('Screen');
    expect(screen.props.background).toBe('surface');

    const backgroundUnderlays = renderer!.root.findAll(
      (node: any) => node.type === 'View' && node.props.pointerEvents === 'none',
    );
    expect(backgroundUnderlays).toHaveLength(0);
  });

  it('renders header bottom content and the body container on the app background by default', async () => {
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

    expect(headerBottomStyle.backgroundColor).toBe(TEST_THEME.colors.background.app);
    expect(headerBottomStyle.borderBottomWidth).toBe(1);

    const bodyContainer = renderer!.root.find(
      (node: any) =>
        node.type === 'View' &&
        flattenStyle(node.props.style).backgroundColor === TEST_THEME.colors.background.app &&
        node.findAllByType('KeyboardAwareScrollView').length > 0,
    );

    expect(flattenStyle(bodyContainer.props.style).flex).toBe(1);
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

  it('renders the shared sticky action footer with scaffold actions', async () => {
    const primaryAction = {
      label: 'Save',
      onPress: jest.fn(),
      testID: 'save-button',
    };
    const secondaryAction = {
      label: 'Cancel',
      onPress: jest.fn(),
      testID: 'cancel-button',
    };
    let renderer: any = null;

    await act(async () => {
      renderer = renderScaffold({
        primaryAction,
        secondaryAction,
      });
    });

    const buttons = renderer!.root.findAllByType('Button');

    expect(buttons.map((button: any) => button.props.label)).toEqual(['Cancel', 'Save']);
    expect(buttons[0].props).toEqual(
      expect.objectContaining({
        onPress: secondaryAction.onPress,
        testID: 'cancel-button',
        variant: 'secondary',
      }),
    );
    expect(buttons[1].props).toEqual(
      expect.objectContaining({
        onPress: primaryAction.onPress,
        testID: 'save-button',
        variant: 'primary',
      }),
    );
  });

  it('updates the keyboard bottom offset from the measured footer height', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = renderScaffold();
    });

    const footer = renderer!.root.find(
      (node: any) =>
        node.type === 'View' &&
        typeof node.props.onLayout === 'function' &&
        node.findAllByType('Button').length > 0,
    );

    act(() => {
      footer.props.onLayout({
        nativeEvent: {
          layout: {
            height: 80,
            width: 360,
            x: 0,
            y: 0,
          },
        },
      });
    });

    const scrollView = renderer!.root.findByType('KeyboardAwareScrollView');

    expect(scrollView.props.bottomOffset).toBe(80 + TEST_THEME.spacing.sm);
  });
});
