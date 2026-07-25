import React from 'react';
import { act, create } from 'react-test-renderer';

import { OnboardingScreen } from '../screens/OnboardingScreen';

const mockReact = React;

jest.mock('react-native', () => ({
  Image: (props: Record<string, unknown>) => mockReact.createElement('Image', props),
  Pressable: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Pressable', props, children),
  ScrollView: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('ScrollView', props, children),
  useWindowDimensions: () => ({ height: 844, width: 390 }),
  View: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('View', props, children),
}));

jest.mock('../components/shared', () => ({
  AuthTopBar: (props: Record<string, unknown>) => mockReact.createElement('AuthTopBar', props),
  FormScaffold: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('FormScaffold', props, children),
}));

jest.mock('../lib/branding', () => ({
  BRAND_LOGO: { uri: 'asset://brand-logo' },
}));

jest.mock('../observability', () => ({
  trackObservabilityEvent: jest.fn(),
}));

const theme = {
  colors: {
    background: {
      muted: 'muted',
      surface: 'surface',
    },
    border: {
      default: 'default',
      subtle: 'subtle',
    },
    fill: {
      brand: 'brand-fill',
    },
    status: {
      infoBg: 'info-bg',
      infoBorder: 'info-border',
      successBg: 'success-bg',
      successBorder: 'success-border',
      warningBg: 'warning-bg',
      warningBorder: 'warning-border',
    },
    text: {
      brand: 'brand',
      info: 'info',
      success: 'success',
      warning: 'warning',
    },
  },
  radii: {
    lg: 16,
    pill: 999,
  },
  sizes: {
    modalMaxWidth: 420,
  },
  spacing: {
    xxs: 2,
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
  },
} as const;

jest.mock('../theme', () => ({
  createThemedStyles:
    (factory: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) =>
      factory(theme, ...args),
  useTheme: () => theme,
}));

jest.mock('../ui', () => ({
  Button: (props: Record<string, unknown>) => mockReact.createElement('Button', props),
  Card: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Card', props, children),
  Screen: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Screen', props, children),
  Text: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Text', props, children),
}));

describe('OnboardingScreen', () => {
  it('exposes reachable indicators whose selected state follows direct and swipe navigation', async () => {
    let renderer: any;

    await act(async () => {
      renderer = create(
        <OnboardingScreen
          navigation={{ navigate: jest.fn() } as never}
          route={{ key: 'Onboarding-route', name: 'Onboarding' } as never}
        />,
      );
    });

    const track = renderer.root.findByProps({ testID: 'onboarding-indicator-track' });
    const offline = renderer.root.findByProps({ testID: 'onboarding-indicator-offline' });

    expect(track.props.accessibilityLabel).toBe('Show onboarding card 1: Track Meals. Rate Smarter.');
    expect(track.props.accessibilityState).toEqual({ selected: true });
    expect(offline.props.accessibilityState).toEqual({ selected: false });
    expect(track.props.style).toEqual(expect.objectContaining({ minHeight: 44, minWidth: 44 }));

    await act(async () => {
      offline.props.onPress();
    });

    expect(
      renderer.root.findByProps({ testID: 'onboarding-indicator-track' }).props.accessibilityState,
    ).toEqual({ selected: false });
    expect(
      renderer.root.findByProps({ testID: 'onboarding-indicator-offline' }).props.accessibilityState,
    ).toEqual({ selected: true });

    const carousel = renderer.root.findAllByType('ScrollView').find((node: any) => node.props.pagingEnabled);
    await act(async () => {
      carousel.props.onMomentumScrollEnd({
        nativeEvent: {
          contentOffset: {
            x: 716,
          },
        },
      });
    });

    expect(
      renderer.root.findByProps({ testID: 'onboarding-indicator-friends' }).props.accessibilityState,
    ).toEqual({ selected: true });
  });
});
