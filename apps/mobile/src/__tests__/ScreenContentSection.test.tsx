import React from 'react';
import { act, create } from 'react-test-renderer';

import { ScreenContentSection } from '../components/shared/ScreenContentSection';

const mockReact = React;

const TEST_THEME = {
  colors: {
    background: {
      app: 'app-background',
    },
  },
} as const;

jest.mock('react-native', () => ({
  StyleSheet: {
    absoluteFillObject: {
      bottom: 0,
      left: 0,
      position: 'absolute',
      right: 0,
      top: 0,
    },
  },
  View: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('View', props, children),
}));

jest.mock('../theme', () => ({
  createThemedStyles:
    <Args extends unknown[], Styles>(
      factory: (theme: typeof TEST_THEME, ...args: Args) => Styles,
    ) =>
    (...args: Args) =>
      factory(TEST_THEME, ...args),
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

describe('ScreenContentSection', () => {
  it('keeps the default app background and fill behavior without an overscroll split', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <ScreenContentSection fill testID="records-section">
          Body
        </ScreenContentSection>,
      );
    });

    const section = renderer.root.find(
      (node: any) => node.type === 'View' && node.props.testID === 'records-section',
    );

    expect(flattenStyle(section.props.style)).toEqual(
      expect.objectContaining({
        backgroundColor: 'app-background',
        flex: 1,
      }),
    );
    expect(renderer.root.findAllByProps({ testID: 'records-section-overscroll-backdrop' })).toHaveLength(0);
  });

  it('renders a split overscroll backdrop with the configured colors and ratio', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <ScreenContentSection
          overscrollBackgroundSplit={{
            bottomColor: 'bottom-color',
            topColor: 'top-color',
            topRatio: 0.6,
          }}
          testID="records-section"
        >
          Body
        </ScreenContentSection>,
      );
    });

    const backdrop = renderer.root.findByProps({ testID: 'records-section-overscroll-backdrop' });
    const topSegment = renderer.root.findByProps({ testID: 'records-section-overscroll-top' });
    const bottomSegment = renderer.root.findByProps({ testID: 'records-section-overscroll-bottom' });

    expect(backdrop.props.pointerEvents).toBe('none');
    expect(flattenStyle(topSegment.props.style)).toEqual(
      expect.objectContaining({
        backgroundColor: 'top-color',
        flex: 0.6,
      }),
    );
    expect(flattenStyle(bottomSegment.props.style)).toEqual(
      expect.objectContaining({
        backgroundColor: 'bottom-color',
        flex: 0.4,
      }),
    );
  });

  it('clamps the overscroll split ratio before applying the segment flex values', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <ScreenContentSection
          overscrollBackgroundSplit={{
            bottomColor: 'bottom-color',
            topColor: 'top-color',
            topRatio: 1.5,
          }}
          testID="records-section"
        >
          Body
        </ScreenContentSection>,
      );
    });

    const topSegment = renderer.root.findByProps({ testID: 'records-section-overscroll-top' });
    const bottomSegment = renderer.root.findByProps({ testID: 'records-section-overscroll-bottom' });

    expect(flattenStyle(topSegment.props.style)).toEqual(
      expect.objectContaining({
        flex: 1,
      }),
    );
    expect(flattenStyle(bottomSegment.props.style)).toEqual(
      expect.objectContaining({
        flex: 0,
      }),
    );
  });
});
