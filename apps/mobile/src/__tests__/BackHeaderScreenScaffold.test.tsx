import React from 'react';
import { act, create } from 'react-test-renderer';

import { BackHeaderScreenScaffold } from '../components/shared/BackHeaderScreenScaffold';

const mockReact = React;

const TEST_THEME = {
  colors: {
    background: {
      app: 'app-background',
      muted: 'muted-background',
      surface: 'surface-background',
    },
    border: {
      subtle: 'subtle-border',
    },
    text: {
      brand: 'brand-text',
    },
  },
  spacing: {
    md: 16,
    sm: 12,
    xl: 24,
  },
} as const;

jest.mock('react-native', () => ({
  Platform: {
    OS: 'ios',
  },
  RefreshControl: (props: Record<string, unknown>) => mockReact.createElement('RefreshControl', props),
  View: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('View', props, children),
  useWindowDimensions: () => ({
    height: 640,
    width: 360,
  }),
}));

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

function flattenStyle(style: unknown): Record<string, unknown> {
  if (!style || typeof style !== 'object') {
    return {};
  }

  if (Array.isArray(style)) {
    return style.reduce<Record<string, unknown>>(
      (accumulator, entry) => ({ ...accumulator, ...flattenStyle(entry) }),
      {},
    );
  }

  return style as Record<string, unknown>;
}

function triggerHeaderLayout(renderer: any, height: number) {
  const headerWrapper = renderer.root.find(
    (node: any) =>
      node.type === 'View' &&
      typeof node.props.onLayout === 'function' &&
      node.findAllByType('ScreenHeader').length > 0,
  );

  act(() => {
    headerWrapper.props.onLayout({
      nativeEvent: {
        layout: {
          height,
          width: 360,
          x: 0,
          y: 0,
        },
      },
    });
  });
}

function renderScaffold(props: Partial<React.ComponentProps<typeof BackHeaderScreenScaffold>> = {}) {
  return create(
    <BackHeaderScreenScaffold
      onBackPress={() => {}}
      testID="example-screen"
      title="Example"
      {...props}
    >
      Body
    </BackHeaderScreenScaffold>,
  );
}

describe('BackHeaderScreenScaffold', () => {
  it('keeps the default attached scroll behavior for screens that do not opt in', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = renderScaffold();
    });

    triggerHeaderLayout(renderer, 96);

    const screen = renderer.root.findByType('Screen');

    expect(screen.props.background).toBe('surface');
    expect(flattenStyle(screen.props.contentStyle)).toEqual(
      expect.objectContaining({
        backgroundColor: 'app-background',
      }),
    );
    expect(screen.props.scroll).toBe(true);
    expect(screen.props.scrollUnderlayColor).toBe('app-background');
    expect(screen.props.scrollUnderlayTopInset).toBe(96);
  });

  it('supports fixed-header scrolling for targeted screens', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = renderScaffold({
        headerScrollMode: 'fixed',
      });
    });

    const screen = renderer.root.findByType('Screen');
    const scrollView = renderer.root.findByType('KeyboardAwareScrollView');

    expect(screen.props.scroll).toBe(false);
    expect(flattenStyle(screen.props.contentStyle)).toEqual(
      expect.objectContaining({
        backgroundColor: 'surface-background',
      }),
    );
    expect(flattenStyle(scrollView.props.style)).toEqual(
      expect.objectContaining({
        backgroundColor: 'app-background',
        flex: 1,
      }),
    );
    expect(flattenStyle(scrollView.props.contentContainerStyle)).toEqual(
      expect.objectContaining({
        backgroundColor: 'app-background',
        flexGrow: 1,
      }),
    );
    expect(scrollView.props.extraKeyboardSpace).toBe(0);
  });

  it('can reduce fixed-header keyboard spacing by the measured header height', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = renderScaffold({
        adjustKeyboardSpaceForFixedHeader: true,
        headerScrollMode: 'fixed',
      });
    });

    triggerHeaderLayout(renderer, 96);

    const scrollView = renderer.root.findByType('KeyboardAwareScrollView');

    expect(scrollView.props.extraKeyboardSpace).toBe(-96);
  });

  it('keeps the body tone when fixed-header mode is used with muted content', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = renderScaffold({
        contentBackgroundTone: 'muted',
        headerScrollMode: 'fixed',
      });
    });

    const scrollView = renderer.root.findByType('KeyboardAwareScrollView');

    expect(flattenStyle(scrollView.props.style)).toEqual(
      expect.objectContaining({
        backgroundColor: 'muted-background',
      }),
    );
    expect(flattenStyle(scrollView.props.contentContainerStyle)).toEqual(
      expect.objectContaining({
        backgroundColor: 'muted-background',
      }),
    );
  });

  it('supports opting back into the legacy midpoint overscroll split', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = renderScaffold({
        overscrollBackgroundStrategy: 'legacy-midpoint',
      });
    });

    triggerHeaderLayout(renderer, 72);

    const screen = renderer.root.findByType('Screen');

    expect(flattenStyle(screen.props.contentStyle)).toEqual(
      expect.objectContaining({
        backgroundColor: 'app-background',
      }),
    );
    expect(screen.props.scroll).toBe(true);
    expect(screen.props.scrollUnderlayTopInset).toBe(320);
  });

  it('does not render a sticky action footer by default', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = renderScaffold({
        headerScrollMode: 'fixed',
      });
    });

    expect(renderer.root.findAllByType('Button')).toHaveLength(0);
  });

  it('renders a sticky action footer after the fixed-header scroll body', async () => {
    const onPress = jest.fn();
    let renderer: any = null;

    await act(async () => {
      renderer = renderScaffold({
        headerScrollMode: 'fixed',
        primaryAction: {
          label: 'Save Settings',
          onPress,
          testID: 'settings-save-button',
        },
      });
    });

    const screen = renderer.root.findByType('Screen');
    const scrollView = renderer.root.findByType('KeyboardAwareScrollView');
    const button = renderer.root.findByType('Button');

    expect(screen.props.scroll).toBe(false);
    expect(flattenStyle(scrollView.props.style)).toEqual(
      expect.objectContaining({
        flex: 1,
      }),
    );
    expect(button.props).toEqual(
      expect.objectContaining({
        label: 'Save Settings',
        onPress,
        testID: 'settings-save-button',
        variant: 'primary',
      }),
    );
  });
});
