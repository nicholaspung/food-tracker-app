import React from 'react';
import { act, create } from 'react-test-renderer';

import { MiscScreen } from '../screens/MiscScreen';
import { useAuth } from '../providers/AuthProvider';
import { useOfflineAwareFeatureWrite } from '../features/store/useOfflineAwareFeatureWrite';

const mockReact = React;
const mockNavigate = jest.fn();
const mockWriteFeature = jest.fn();
const mockSaveOptimisticMobileOnboardingState = jest.fn();

jest.mock('@expo/vector-icons', () => ({
  Ionicons: (props: Record<string, unknown>) => mockReact.createElement('Ionicons', props),
}));

jest.mock('react-native', () => ({
  Image: (props: Record<string, unknown>) => mockReact.createElement('Image', props),
  Pressable: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Pressable', props, children),
  ScrollView: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('ScrollView', props, children),
  View: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('View', props, children),
}));

jest.mock('../components/shared', () => ({
  OptionList: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('OptionList', props, children),
  OptionListRow: (props: Record<string, unknown>) => mockReact.createElement('OptionListRow', props),
  ScreenContentSection: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('ScreenContentSection', props, children),
  StatusPill: (props: Record<string, unknown>) => mockReact.createElement('StatusPill', props),
  TabBrandHeader: (props: Record<string, unknown>) => mockReact.createElement('TabBrandHeader', props),
  TabRootScreenScaffold: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('TabRootScreenScaffold', props, children),
  TabSectionCard: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('TabSectionCard', props, children),
}));

jest.mock('../components/shared/PageErrorToast', () => ({
  PageErrorToast: (props: Record<string, unknown>) => mockReact.createElement('PageErrorToast', props),
}));

jest.mock('../features', () => ({
  buildMoreOnboardingCardDismissedState: jest.fn((state, input) => ({
    ...(state ?? {}),
    moreCards: {
      ...(state?.moreCards ?? {}),
      [input.cardId]: {
        dismissedAt: input.dismissedAt,
      },
    },
  })),
  dismissMoreOnboardingCard: jest.fn(),
  isMoreOnboardingCardDismissed: jest.fn((state, cardId) => Boolean(state?.moreCards?.[cardId]?.dismissedAt)),
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

jest.mock('../observability', () => ({
  trackObservabilityEvent: jest.fn(),
}));

jest.mock('../providers/AuthProvider', () => ({
  useAuth: jest.fn(),
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
              warning: 'warningBorder',
            },
            status: {
              infoBg: 'infoBg',
              warningBg: 'warningBg',
              successBg: 'successBg',
            },
            text: {
              brand: 'brand',
              info: 'info',
              muted: 'muted',
              primary: 'primary',
              secondary: 'secondary',
              success: 'success',
              warning: 'warning',
            },
          },
          radii: {
            md: 8,
          },
          spacing: {
            xxs: 2,
            xs: 4,
            sm: 8,
            md: 12,
            xl: 24,
          },
        },
        ...args,
      ),
  useTheme: () => ({
    colors: {
      background: {
        app: 'app',
        muted: 'muted',
      },
      border: {
        subtle: 'subtle',
        warning: 'warningBorder',
      },
      status: {
        infoBg: 'infoBg',
        successBg: 'successBg',
        warningBg: 'warningBg',
      },
      text: {
        brand: 'brand',
        info: 'info',
        muted: 'muted',
        primary: 'primary',
        secondary: 'secondary',
        success: 'success',
        warning: 'warning',
      },
    },
  }),
}));

jest.mock('../ui', () => ({
  Button: (props: Record<string, unknown>) => mockReact.createElement('Button', props),
  Text: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Text', props, children),
}));

const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockedUseOfflineAwareFeatureWrite = useOfflineAwareFeatureWrite as jest.MockedFunction<
  typeof useOfflineAwareFeatureWrite
>;

async function renderMiscScreen(): Promise<any> {
  let renderer: any;
  await act(async () => {
    renderer = create(
      <MiscScreen
        navigation={
          {
            navigate: mockNavigate,
          } as never
        }
        route={{ key: 'Misc-route', name: 'Misc' } as never}
      />,
    );
  });
  return renderer;
}

function findRenderedOnboardingCards(renderer: any, testID: string): any[] {
  return renderer.root.findAll((node: any) => node.type === 'View' && node.props.testID === testID);
}

describe('MiscScreen onboarding cards', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockWriteFeature.mockReset();
    mockSaveOptimisticMobileOnboardingState.mockReset();
    mockedUseAuth.mockReturnValue({
      user: {
        id: 'user_1',
        mobileOnboardingState: {},
      },
    } as ReturnType<typeof useAuth>);
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(mockWriteFeature);
    mockWriteFeature.mockResolvedValue({ status: 'completed', result: {} });
  });

  it('shows More onboarding cards until each card is dismissed', async () => {
    const renderer = await renderMiscScreen();

    expect(findRenderedOnboardingCards(renderer, 'more-onboarding-lists-card')).toHaveLength(1);
    expect(findRenderedOnboardingCards(renderer, 'more-onboarding-split-bill-card')).toHaveLength(1);

    const listsCard = findRenderedOnboardingCards(renderer, 'more-onboarding-lists-card')[0];
    const dismissButton = listsCard.findAllByType('Button').find((node: any) => node.props.label === 'Got It');

    await act(async () => {
      await dismissButton.props.onPress();
    });

    expect(findRenderedOnboardingCards(renderer, 'more-onboarding-lists-card')).toHaveLength(0);
    expect(findRenderedOnboardingCards(renderer, 'more-onboarding-split-bill-card')).toHaveLength(1);
  });

  it('dismisses the split bill card before navigating from its CTA', async () => {
    const renderer = await renderMiscScreen();
    const splitBillCard = findRenderedOnboardingCards(renderer, 'more-onboarding-split-bill-card')[0];
    const primaryButton = splitBillCard.findAllByType('Button').find((node: any) => node.props.label === 'Open Bills');

    await act(async () => {
      await primaryButton.props.onPress();
    });

    expect(mockWriteFeature).toHaveBeenCalledWith(
      expect.objectContaining({
        operationName: 'onboarding.more-card.dismiss',
        offline: expect.objectContaining({
          payload: expect.objectContaining({
            cardId: 'splitBill',
          }),
        }),
      }),
    );
    expect(mockNavigate).toHaveBeenCalledWith('Bills');
  });
});
