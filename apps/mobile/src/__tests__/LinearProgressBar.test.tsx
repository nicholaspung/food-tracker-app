import React from 'react';
import { act, create } from 'react-test-renderer';

import { LinearProgressBar } from '../components/shared/LinearProgressBar';

const mockReact = React;

jest.mock('react-native', () => ({
  View: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('View', props, children),
}));

jest.mock('../theme', () => ({
  createThemedStyles:
    (factory: (theme: Record<string, any>, height: number) => Record<string, unknown>) =>
    (height: number) =>
      factory(
        {
          colors: {
            background: {
              surface: 'surface-background',
            },
            border: {
              default: 'default-border',
            },
            button: {
              primaryBg: 'primary-background',
            },
          },
          radii: {
            pill: 999,
          },
        },
        height,
      ),
}));

describe('LinearProgressBar', () => {
  it.each([
    ['below zero', -0.5, 0],
    ['within range', 0.42, 42],
    ['above one', 1.5, 100],
  ])('clamps %s progress for visual and accessible values', async (_label, progress, expected) => {
    let renderer: any;

    await act(async () => {
      renderer = create(
        <LinearProgressBar accessibilityLabel="Receipt scan progress" progress={progress} />,
      );
    });

    const [track, fill] = renderer.root.findAllByType('View');

    expect(track.props.accessibilityLabel).toBe('Receipt scan progress');
    expect(track.props.accessibilityRole).toBe('progressbar');
    expect(track.props.accessibilityState).toEqual({ busy: true });
    expect(track.props.accessibilityValue).toEqual({
      max: 100,
      min: 0,
      now: expected,
    });
    expect(fill.props.style[1]).toEqual({ width: `${expected}%` });
  });
});
