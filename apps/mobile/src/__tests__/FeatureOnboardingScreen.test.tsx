import React from 'react';
import { act, create } from 'react-test-renderer';

import { FeatureOnboardingScreen } from '../screens/FeatureOnboardingScreen';
import { useAuth } from '../providers/AuthProvider';
import { useOfflineAwareFeatureWrite } from '../features/store/useOfflineAwareFeatureWrite';

const mockReact = React;
const mockReset = jest.fn();
const mockGoBack = jest.fn();
const mockNavigate = jest.fn();
const mockWriteFeature = jest.fn();
const mockSaveOptimisticMobileOnboardingState = jest.fn();

jest.mock('@expo/vector-icons', () => ({
  Ionicons: (props: Record<string, unknown>) => mockReact.createElement('Ionicons', props),
}));

jest.mock('react-native', () => {
  return {
    Image: (props: Record<string, unknown>) => mockReact.createElement('Image', props),
    Pressable: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
      mockReact.createElement('Pressable', props, children),
    ScrollView: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
      mockReact.createElement('ScrollView', props, children),
    StyleSheet: {
      create: (styles: Record<string, unknown>) => styles,
    },
    useWindowDimensions: () => ({ width: 390, height: 844 }),
    View: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
      mockReact.createElement('View', props, children),
  };
});

jest.mock('../components/shared', () => ({
  BackHeaderScreenScaffold: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('BackHeaderScreenScaffold', props, children),
  Skeleton: (props: Record<string, unknown>) => mockReact.createElement('Skeleton', props),
}));

jest.mock('../components/shared/PageErrorToast', () => ({
  PageErrorToast: (props: Record<string, unknown>) => mockReact.createElement('PageErrorToast', props),
}));

jest.mock('../features', () => ({
  MAIN_ONBOARDING_VERSION: 1,
  buildMainOnboardingCompletedState: jest.fn((state, input) => ({
    ...(state ?? {}),
    main: {
      completedAt: input.completedAt,
      completedVersion: input.version,
    },
  })),
  completeMainOnboarding: jest.fn(),
  saveOptimisticMobileOnboardingState: (...args: unknown[]) => mockSaveOptimisticMobileOnboardingState(...args),
}));

jest.mock('../features/store/useOfflineAwareFeatureWrite', () => ({
  useOfflineAwareFeatureWrite: jest.fn(),
}));

jest.mock('../lib/onboardingAssets', () => ({
  FEATURE_ONBOARDING_ASSETS: {
    lists: { uri: 'asset://lists' },
    splitBill: { uri: 'asset://split-bill' },
  },
}));

jest.mock('../lib/branding', () => ({
  BRAND_LOGO: { uri: 'asset://brand-logo' },
}));

jest.mock('../observability', () => ({
  trackObservabilityEvent: jest.fn(),
}));

jest.mock('../providers/AuthProvider', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../providers/ConnectivityProvider', () => ({
  useConnectivity: () => ({ isOnline: true }),
}));

jest.mock('../theme', () => ({
  createThemedStyles: (factory: (...args: any[]) => Record<string, unknown>) =>
    (...args: any[]) =>
      factory(
        {
          colors: {
            background: {
              app: 'app',
              muted: 'muted',
              surface: 'surface',
            },
            border: {
              subtle: 'subtle',
            },
            fill: {
              brand: 'brandFill',
            },
            status: {
              infoBg: 'infoBg',
              infoBorder: 'infoBorder',
            },
            text: {
              brand: 'brand',
              info: 'info',
              primary: 'primary',
              secondary: 'secondary',
            },
          },
          radii: {
            md: 8,
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
          },
        },
        ...args,
      ),
  useTheme: () => ({
    colors: {
      text: {
        brand: 'brand',
        info: 'info',
        primary: 'primary',
      },
    },
    sizes: {
      modalMaxWidth: 420,
    },
    spacing: {
      md: 12,
      lg: 16,
      sm: 8,
    },
  }),
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

const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockedUseOfflineAwareFeatureWrite = useOfflineAwareFeatureWrite as jest.MockedFunction<
  typeof useOfflineAwareFeatureWrite
>;

async function renderFeatureOnboardingScreen(params: Record<string, unknown> = { mode: 'required' }): Promise<any> {
  let renderer: any;

  await act(async () => {
    renderer = create(
      <FeatureOnboardingScreen
        navigation={
          {
            goBack: mockGoBack,
            navigate: mockNavigate,
            reset: mockReset,
          } as never
        }
        route={
            {
              key: 'FeatureOnboarding-route',
              name: 'FeatureOnboarding',
              params,
            } as never
          }
        />,
    );
  });

  return renderer;
}

function findFinishButtons(renderer: any): any[] {
  return renderer.root.findAll(
    (node: any) => node.type === 'Button' && node.props.testID === 'feature-onboarding-finish-button',
  );
}

function findActionsSlots(renderer: any): any[] {
  return renderer.root.findAll(
    (node: any) => node.type === 'View' && node.props.testID === 'feature-onboarding-actions-slot',
  );
}

describe('FeatureOnboardingScreen', () => {
  beforeEach(() => {
    mockReset.mockReset();
    mockGoBack.mockReset();
    mockNavigate.mockReset();
    mockWriteFeature.mockReset();
    mockSaveOptimisticMobileOnboardingState.mockReset();
    mockedUseAuth.mockReturnValue({
      user: {
        id: 'user_1',
      },
    } as ReturnType<typeof useAuth>);
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(mockWriteFeature);
    mockWriteFeature.mockResolvedValue({ status: 'completed', result: {} });
  });

  it('renders the welcome onboarding cards', async () => {
    const renderer = await renderFeatureOnboardingScreen();
    const text = renderer.root.findAllByType('Text').map((node: any) => node.props.children);

    expect(text).toContain('Welcome to Yummy Recs');
    expect(text).toContain('Shared by month');
    expect(text).toContain('Watch feature tutorials');
    expect(text).toContain('Add friends intentionally');
    expect(text).toContain('More than tracking');
    expect(text).toContain('Use lists for ideas');
    expect(text).toContain('Split bills and calculate tips');
    expect(text).toContain('Personalize your experience');
    expect(text).toContain(
      'Settings let you choose appearance, default visibility, and Home feed preferences so Yummy Recs fits how you track and share food.',
    );
    expect(text).toContain('Invite friends and get help');
    expect(text).not.toContain('Track a restaurant visit');
    expect(
      renderer.root.findAll((node: any) =>
        node.type === 'Pressable' &&
        typeof node.props.testID === 'string' &&
        node.props.testID.startsWith('feature-onboarding-indicator-'),
      ),
    ).toHaveLength(9);
  });

  it('keeps onboarding card dimensions and copy constraints stable', async () => {
    const renderer = await renderFeatureOnboardingScreen();
    const cards = renderer.root.findAllByType('Card');

    expect(cards).toHaveLength(9);
    cards.forEach((card: any) => {
      expect(card.props.style).toEqual(expect.objectContaining({ height: expect.any(Number) }));
    });
    expect(new Set(cards.map((card: any) => card.props.style.height)).size).toBe(1);

    const titleText = renderer.root.findAllByType('Text').find((node: any) => node.props.children === 'Shared by month');
    expect(titleText?.props.numberOfLines).toBe(2);

    const descriptionText = renderer.root
      .findAllByType('Text')
      .find((node: any) =>
        node.props.children ===
        'Tracked items show the month they were added, so recommendations stay useful without making every meal feel watched in real time.',
      );
    expect(descriptionText?.props.numberOfLines).toBe(3);
    expect(descriptionText?.props.ellipsizeMode).toBe('tail');
  });

  it('starts on the requested main onboarding card', async () => {
    const renderer = await renderFeatureOnboardingScreen({
      initialCardId: 'support_invites',
      mode: 'required',
    });

    expect(renderer.root.findByProps({ testID: 'feature-onboarding-previous-button' }).props.disabled).toBe(false);
    expect(renderer.root.findByProps({ testID: 'feature-onboarding-next-button' }).props.disabled).toBe(true);
    expect(findFinishButtons(renderer)).toHaveLength(1);
  });

  it('falls back to the first card when the requested main card is invalid', async () => {
    const renderer = await renderFeatureOnboardingScreen({
      initialCardId: 'unknown-card',
      mode: 'required',
    });

    expect(renderer.root.findByProps({ testID: 'feature-onboarding-previous-button' }).props.disabled).toBe(true);
    expect(renderer.root.findByProps({ testID: 'feature-onboarding-next-button' }).props.disabled).toBe(false);
    expect(findFinishButtons(renderer)).toHaveLength(0);
  });

  it('hides finish until the final card is selected', async () => {
    const renderer = await renderFeatureOnboardingScreen();

    expect(findActionsSlots(renderer)).toHaveLength(1);
    expect(findFinishButtons(renderer)).toHaveLength(0);

    await act(async () => {
      renderer.root.findByProps({ testID: 'feature-onboarding-indicator-support_invites' }).props.onPress();
    });

    expect(findActionsSlots(renderer)).toHaveLength(1);
    expect(findFinishButtons(renderer)).toHaveLength(1);
  });

  it('moves between cards with previous and next arrow controls', async () => {
    const renderer = await renderFeatureOnboardingScreen();

    expect(renderer.root.findByProps({ testID: 'feature-onboarding-previous-button' }).props.disabled).toBe(true);
    expect(renderer.root.findByProps({ testID: 'feature-onboarding-next-button' }).props.disabled).toBe(false);
    expect(findFinishButtons(renderer)).toHaveLength(0);

    await act(async () => {
      renderer.root.findByProps({ testID: 'feature-onboarding-next-button' }).props.onPress();
    });

    expect(renderer.root.findByProps({ testID: 'feature-onboarding-previous-button' }).props.disabled).toBe(false);
    expect(findFinishButtons(renderer)).toHaveLength(0);

    await act(async () => {
      renderer.root.findByProps({ testID: 'feature-onboarding-indicator-support_invites' }).props.onPress();
    });

    expect(findFinishButtons(renderer)).toHaveLength(1);
    expect(renderer.root.findByProps({ testID: 'feature-onboarding-next-button' }).props.disabled).toBe(true);
  });

  it('finishes onboarding and resets to Home', async () => {
    const renderer = await renderFeatureOnboardingScreen();

    await act(async () => {
      renderer.root.findByProps({ testID: 'feature-onboarding-indicator-support_invites' }).props.onPress();
    });
    await act(async () => {
      await renderer.root.findByProps({ testID: 'feature-onboarding-finish-button' }).props.onPress();
    });

    expect(mockWriteFeature).toHaveBeenCalledWith(
      expect.objectContaining({
        operationName: 'onboarding.main.complete',
      }),
    );
    expect(mockReset).toHaveBeenCalledWith({
      index: 0,
      routes: [{ name: 'Home' }],
    });
  });

  it('optimistically saves queued completion before resetting to Home', async () => {
    mockWriteFeature.mockResolvedValue({ status: 'queued' });
    const renderer = await renderFeatureOnboardingScreen();

    await act(async () => {
      renderer.root.findByProps({ testID: 'feature-onboarding-indicator-support_invites' }).props.onPress();
    });
    await act(async () => {
      await renderer.root.findByProps({ testID: 'feature-onboarding-finish-button' }).props.onPress();
    });

    expect(mockSaveOptimisticMobileOnboardingState).toHaveBeenCalledWith(
      expect.objectContaining({
        main: expect.objectContaining({
          completedVersion: 1,
        }),
      }),
    );
    expect(mockReset).toHaveBeenCalledWith({
      index: 0,
      routes: [{ name: 'Home' }],
    });
  });

  it('renders replay mode as the welcome tutorial without destination CTAs', async () => {
    let renderer: any;

    await act(async () => {
      renderer = create(
        <FeatureOnboardingScreen
          navigation={
            {
              goBack: mockGoBack,
              navigate: mockNavigate,
              reset: mockReset,
            } as never
          }
          route={
            {
              key: 'FeatureOnboarding-route',
              name: 'FeatureOnboarding',
              params: { mode: 'replay' },
            } as never
          }
        />,
      );
    });

    expect(renderer.root.findByType('BackHeaderScreenScaffold').props.title).toBe('Welcome tutorial');
    expect(renderer.root.findAllByType('Button')).toHaveLength(0);
  });

  it('uses the selected card title in replay mode', async () => {
    let renderer: any;

    await act(async () => {
      renderer = create(
        <FeatureOnboardingScreen
          navigation={
            {
              goBack: mockGoBack,
              navigate: mockNavigate,
              reset: mockReset,
            } as never
          }
          route={
            {
              key: 'FeatureOnboarding-route',
              name: 'FeatureOnboarding',
              params: { initialCardId: 'settings', mode: 'replay' },
            } as never
          }
        />,
      );
    });

    expect(renderer.root.findByType('BackHeaderScreenScaffold').props.title).toBe('Personalize your experience');
    expect(renderer.root.findByProps({ testID: 'feature-onboarding-previous-button' }).props.disabled).toBe(false);
  });
});
