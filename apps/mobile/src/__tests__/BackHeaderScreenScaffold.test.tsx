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
  },
  spacing: {
    md: 16,
    sm: 12,
    xl: 24,
  },
} as const;

jest.mock('react-native', () => ({
  View: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('View', props, children),
  useWindowDimensions: () => ({
    height: 640,
    width: 360,
  }),
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
  Screen: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Screen', props, children),
}));

jest.mock('../components/shared/ScreenHeader', () => ({
  ScreenHeader: (props: Record<string, unknown>) => mockReact.createElement('ScreenHeader', props),
}));

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
      title="Example"
      {...props}
    >
      Body
    </BackHeaderScreenScaffold>,
  );
}

describe('BackHeaderScreenScaffold', () => {
  it('uses the measured header height for the default overscroll split', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = renderScaffold();
    });

    triggerHeaderLayout(renderer, 96);

    const screen = renderer.root.findByType('Screen');

    expect(screen.props.background).toBe('surface');
    expect(screen.props.scrollUnderlayColor).toBe('app-background');
    expect(screen.props.scrollUnderlayTopInset).toBe(96);
  });

  it('keeps the measured-header split when the content tone is muted', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = renderScaffold({
        contentBackgroundTone: 'muted',
      });
    });

    triggerHeaderLayout(renderer, 88);

    const screen = renderer.root.findByType('Screen');

    expect(screen.props.scrollUnderlayColor).toBe('muted-background');
    expect(screen.props.scrollUnderlayTopInset).toBe(88);
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

    expect(screen.props.scrollUnderlayTopInset).toBe(320);
  });
});
