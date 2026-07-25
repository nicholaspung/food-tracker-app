import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { act, create } from 'react-test-renderer';

import { LoadingOverlay } from '../components/shared/LoadingOverlay';

const mockReact = React;
jest.mock('../theme', () => ({
  createThemedStyles:
    (factory: (theme: Record<string, any>) => Record<string, unknown>) =>
    () =>
      factory({
        colors: {
          background: {
            overlay: 'overlay-color',
            surface: 'surface-color',
          },
          border: {
            default: 'border-color',
          },
          button: {
            primaryBg: 'button-color',
          },
        },
        radii: {
          lg: 16,
        },
        spacing: {
          xs: 8,
          sm: 12,
          md: 16,
          lg: 24,
        },
      }),
  useTheme: () => ({
    colors: {
      button: {
        primaryBg: 'button-color',
      },
    },
  }),
}));

jest.mock('../ui', () => ({
  Text: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Text', props, children),
}));

describe('LoadingOverlay', () => {
  beforeEach(() => {
    (AccessibilityInfo.announceForAccessibility as jest.Mock).mockClear();
  });

  it('renders nothing when hidden', async () => {
    let renderer: any;
    await act(async () => {
      renderer = create(<LoadingOverlay visible={false} />);
    });

    expect(renderer.toJSON()).toBeNull();
  });

  it('renders a full-window transparent modal when visible', async () => {
    let renderer: any;
    await act(async () => {
      renderer = create(<LoadingOverlay label="Signing in..." visible />);
    });

    const modal = renderer.root.findByType('Modal');
    const overlay = renderer.root.findByProps({ pointerEvents: 'auto' });
    const progress = renderer.root.findByProps({
      accessibilityLabel: 'Signing in...',
      accessibilityRole: 'progressbar',
    });

    expect(modal.props).toEqual(
      expect.objectContaining({
        accessibilityLabel: 'Signing in...',
        accessibilityViewIsModal: true,
        transparent: true,
        visible: true,
        statusBarTranslucent: true,
      }),
    );
    expect(overlay.props.style).toEqual(
      expect.objectContaining({
        backgroundColor: 'overlay-color',
        flex: 1,
      }),
    );
    expect(progress.props.accessibilityLiveRegion).toBe('polite');
    expect(progress.props.accessibilityState).toEqual({ busy: true });

    modal.props.onShow();
    modal.props.onShow();

    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledTimes(1);
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(
      'Signing in...',
    );
  });

  it('does not announce a stale onShow event after the overlay closes', async () => {
    let renderer: any;
    await act(async () => {
      renderer = create(<LoadingOverlay label="Signing in..." visible />);
    });

    const delayedOnShow = renderer.root.findByType('Modal').props.onShow;

    await act(async () => {
      renderer.update(<LoadingOverlay label="Signing in..." visible={false} />);
    });
    delayedOnShow();

    expect(AccessibilityInfo.announceForAccessibility).not.toHaveBeenCalled();
  });

  it('announces a changed label while the visible overlay remains open', async () => {
    let renderer: any;
    await act(async () => {
      renderer = create(<LoadingOverlay label="Verifying your email..." visible />);
    });

    renderer.root.findByType('Modal').props.onShow();

    await act(async () => {
      renderer.update(
        <LoadingOverlay label="Sending verification email..." visible />,
      );
    });

    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledTimes(2);
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenLastCalledWith(
      'Sending verification email...',
    );
  });
});
