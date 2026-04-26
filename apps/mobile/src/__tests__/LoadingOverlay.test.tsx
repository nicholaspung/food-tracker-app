import React from 'react';
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

    expect(modal.props).toEqual(
      expect.objectContaining({
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
  });
});
