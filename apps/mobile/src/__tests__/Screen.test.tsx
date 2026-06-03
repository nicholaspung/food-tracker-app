import React from 'react';
import { act, create } from 'react-test-renderer';

import { LayoutChromeProvider } from '../providers/LayoutChromeProvider';
import { Screen } from '../ui/Screen';

const mockReact = React;

const TEST_THEME = {
  colors: {
    background: {
      app: 'app-background',
      surface: 'surface-background',
    },
    text: {
      brand: 'brand-text',
    },
  },
  spacing: {
    lg: 24,
    md: 16,
    none: 0,
    sm: 12,
  },
} as const;

jest.mock('react-native-keyboard-controller', () => ({
  KeyboardAvoidingView: (
    { children, ...props }: Record<string, unknown> & { children?: React.ReactNode },
  ) => mockReact.createElement('KeyboardAvoidingView', props, children),
  KeyboardAwareScrollView: (
    { children, ...props }: Record<string, unknown> & { children?: React.ReactNode },
  ) => mockReact.createElement('KeyboardAwareScrollView', props, children),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('SafeAreaView', props, children),
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

function renderScreen(topInsetConsumedByOverlay: boolean) {
  return create(
    <LayoutChromeProvider topInsetConsumedByOverlay={topInsetConsumedByOverlay}>
      <Screen>Body</Screen>
    </LayoutChromeProvider>,
  );
}

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

describe('Screen', () => {
  it("keeps the top safe-area edge when no overlay has already consumed it", async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = renderScreen(false);
    });

    const safeAreaView = renderer.root.findByType('SafeAreaView');

    expect(safeAreaView.props.edges).toEqual(['top', 'bottom']);
  });

  it("drops the top safe-area edge when an overlay already owns the top inset", async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = renderScreen(true);
    });

    const safeAreaView = renderer.root.findByType('SafeAreaView');

    expect(safeAreaView.props.edges).toEqual(['bottom']);
  });

  it('pushes the scroll underlay split down by the overlay height', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <LayoutChromeProvider topInsetConsumedByOverlay topOverlayHeight={72}>
          <Screen
            scroll
            scrollUnderlayColor="app-background"
            scrollUnderlayTopColor="surface-background"
            scrollUnderlayTopInset={240}
          >
            Body
          </Screen>
        </LayoutChromeProvider>,
      );
    });

    const underlays = renderer.root.findAll(
      (node: any) => node.type === 'View' && node.props.pointerEvents === 'none',
    );

    expect(underlays).toHaveLength(2);
    expect(flattenStyle(underlays[0].props.style)).toEqual(
      expect.objectContaining({
        backgroundColor: 'app-background',
        top: 312,
      }),
    );
    expect(flattenStyle(underlays[1].props.style)).toEqual(
      expect.objectContaining({
        backgroundColor: 'surface-background',
        height: 824,
      }),
    );
  });
});
