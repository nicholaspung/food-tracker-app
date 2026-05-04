import React from 'react';
import { act, create } from 'react-test-renderer';

import { MoreFeatureOnboardingScreen } from '../screens/MoreFeatureOnboardingScreen';
import { useOfflineAwareFeatureWrite } from '../features/store/useOfflineAwareFeatureWrite';
import { useAuth } from '../providers/AuthProvider';
import type { MoreOnboardingCardId } from '../types/auth';

const mockReact = React;
const mockNavigate = jest.fn();
const mockReplace = jest.fn();
const mockGoBack = jest.fn();
const mockCanGoBack = jest.fn();
const mockWriteFeature = jest.fn();
const mockSaveOptimisticMobileOnboardingState = jest.fn();
const mockTrackObservabilityEvent = jest.fn();

jest.mock('@expo/vector-icons', () => ({
  Ionicons: (props: Record<string, unknown>) => mockReact.createElement('Ionicons', props),
}));

jest.mock('react-native', () => ({
  Image: (props: Record<string, unknown>) => mockReact.createElement('Image', props),
  View: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('View', props, children),
}));

jest.mock('../components/shared', () => ({
  BackHeaderScreenScaffold: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('BackHeaderScreenScaffold', props, children),
  FeatureIntroScreenContent: ({
    config,
    errorMessage,
    isSubmitting,
    layout,
    onPrimaryPress,
    primaryTestID,
  }: Record<string, any>) =>
    mockReact.createElement(
      'FeatureIntroScreenContent',
      {
        layout,
      },
      mockReact.createElement('Image', { resizeMode: layout === 'immersive' ? 'contain' : 'cover', source: config.imageSource }),
      mockReact.createElement('Text', null, config.title),
      mockReact.createElement('Text', null, config.description),
      mockReact.createElement('PageErrorToast', {
        errorMessage: errorMessage,
        title: 'Onboarding update failed',
      }),
      mockReact.createElement('Button', {
        disabled: isSubmitting,
        label: config.primaryLabel,
        loading: isSubmitting,
        onPress: onPrimaryPress,
        testID: primaryTestID,
      }),
    ),
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
    tipCalculator: { uri: 'asset://tip-calculator' },
  },
}));

jest.mock('../observability', () => ({
  trackObservabilityEvent: (...args: unknown[]) => mockTrackObservabilityEvent(...args),
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
              muted: 'muted',
            },
            border: {
              subtle: 'subtle',
            },
            text: {
              info: 'info',
              secondary: 'secondary',
              success: 'success',
            },
          },
          radii: {
            md: 8,
          },
          spacing: {
            xs: 4,
            md: 12,
          },
        },
        ...args,
      ),
  useTheme: () => ({
    colors: {
      text: {
        info: 'info',
        success: 'success',
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

const expectedConfig: Record<MoreOnboardingCardId, {
  title: string;
  description: string;
  imageSource: { uri: string };
  primaryLabel: string;
  destination: 'Lists' | 'Bills' | 'TipCalculator';
}> = {
  lists: {
    title: 'Organize restaurants with lists',
    description: 'See how lists help you save restaurants, organize favorites, and keep ideas ready for later.',
    imageSource: { uri: 'asset://lists' },
    primaryLabel: 'View My Lists',
    destination: 'Lists',
  },
  splitBill: {
    title: 'Split a bill',
    description: 'See how to create a bill, assign items to friends, and track who has paid.',
    imageSource: { uri: 'asset://split-bill' },
    primaryLabel: 'Open Bills',
    destination: 'Bills',
  },
  tipCalculator: {
    title: 'Calculate tips quickly',
    description: 'Enter the bill details, choose a tip style, and see the total before you split or pay.',
    imageSource: { uri: 'asset://tip-calculator' },
    primaryLabel: 'Open Tip Calculator',
    destination: 'TipCalculator',
  },
};

async function renderMoreFeatureOnboardingScreen(
  cardId: MoreOnboardingCardId,
  params: Partial<{
    mode: 'firstRun' | 'replay';
    source: 'more' | 'profile';
  }> = {},
): Promise<any> {
  let renderer: any;
  await act(async () => {
    renderer = create(
      <MoreFeatureOnboardingScreen
        navigation={
          {
            canGoBack: mockCanGoBack,
            goBack: mockGoBack,
            navigate: mockNavigate,
            replace: mockReplace,
          } as never
        }
        route={{
          key: `MoreFeatureOnboarding-${cardId}`,
          name: 'MoreFeatureOnboarding',
          params: {
            cardId,
            ...params,
          },
        } as never}
      />,
    );
  });
  return renderer;
}

function findPrimaryButton(renderer: any): any {
  return renderer.root.findByProps({ testID: 'more-feature-onboarding-primary-button' });
}

function findTextNodes(renderer: any, children: string): any[] {
  return renderer.root.findAll((node: any) => node.type === 'Text' && node.props.children === children);
}

describe('MoreFeatureOnboardingScreen', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockReplace.mockReset();
    mockGoBack.mockReset();
    mockCanGoBack.mockReset();
    mockWriteFeature.mockReset();
    mockSaveOptimisticMobileOnboardingState.mockReset();
    mockTrackObservabilityEvent.mockReset();
    mockCanGoBack.mockReturnValue(false);
    mockedUseAuth.mockReturnValue({
      user: {
        id: 'user_1',
        mobileOnboardingState: {},
      },
    } as ReturnType<typeof useAuth>);
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(mockWriteFeature);
    mockWriteFeature.mockResolvedValue({ status: 'completed', result: {} });
  });

  it.each(['lists', 'splitBill', 'tipCalculator'] as const)(
    'renders the configured intro for %s',
    async (cardId) => {
      const renderer = await renderMoreFeatureOnboardingScreen(cardId);
      const config = expectedConfig[cardId];

      expect(findTextNodes(renderer, config.title)).toHaveLength(1);
      expect(findTextNodes(renderer, config.description)).toHaveLength(1);
      expect(renderer.root.findByType('Image').props.source).toEqual(config.imageSource);
      expect(renderer.root.findByType('FeatureIntroScreenContent').props.layout).toBe('immersive');
      expect(renderer.root.findAllByProps({ testID: 'more-feature-onboarding-back-button' })).toHaveLength(0);
      expect(findPrimaryButton(renderer).props.label).toBe(config.primaryLabel);
    },
  );

  it.each(['lists', 'splitBill', 'tipCalculator'] as const)(
    'dismisses %s onboarding and opens the destination',
    async (cardId) => {
      const renderer = await renderMoreFeatureOnboardingScreen(cardId);

      await act(async () => {
        findPrimaryButton(renderer).props.onPress();
        await Promise.resolve();
      });

      expect(mockWriteFeature).toHaveBeenCalledWith(
        expect.objectContaining({
          operationName: 'onboarding.more-card.dismiss',
          offline: expect.objectContaining({
            payload: expect.objectContaining({
              cardId,
              userId: 'user_1',
            }),
          }),
        }),
      );
      expect(mockReplace).toHaveBeenCalledWith(expectedConfig[cardId].destination);
    },
  );

  it('saves optimistic onboarding state when the dismissal is queued', async () => {
    mockWriteFeature.mockResolvedValue({ status: 'queued' });
    const renderer = await renderMoreFeatureOnboardingScreen('tipCalculator');

    await act(async () => {
      findPrimaryButton(renderer).props.onPress();
      await Promise.resolve();
    });

    expect(mockSaveOptimisticMobileOnboardingState).toHaveBeenCalledWith(
      expect.objectContaining({
        moreCards: expect.objectContaining({
          tipCalculator: expect.objectContaining({
            dismissedAt: expect.any(String),
          }),
        }),
      }),
    );
    expect(mockReplace).toHaveBeenCalledWith('TipCalculator');
  });

  it('shows an error and does not navigate when dismissal fails', async () => {
    mockWriteFeature.mockRejectedValue(new Error('Network failed'));
    const renderer = await renderMoreFeatureOnboardingScreen('lists');

    await act(async () => {
      findPrimaryButton(renderer).props.onPress();
      await Promise.resolve();
    });

    expect(renderer.root.findByType('PageErrorToast').props.errorMessage).toBe('Network failed');
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('returns to More from the header without dismissing onboarding', async () => {
    const renderer = await renderMoreFeatureOnboardingScreen('splitBill');

    await act(async () => {
      renderer.root.findByType('BackHeaderScreenScaffold').props.onBackPress();
    });

    expect(mockWriteFeature).not.toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('Misc');
  });

  it('replaces to the destination when the card is already dismissed', async () => {
    mockedUseAuth.mockReturnValue({
      user: {
        id: 'user_1',
        mobileOnboardingState: {
          moreCards: {
            tipCalculator: {
              dismissedAt: '2026-04-28T12:00:00.000Z',
            },
          },
        },
      },
    } as ReturnType<typeof useAuth>);

    await renderMoreFeatureOnboardingScreen('tipCalculator');

    expect(mockReplace).toHaveBeenCalledWith('TipCalculator');
  });

  it('does not auto-skip dismissed onboarding in replay mode', async () => {
    mockedUseAuth.mockReturnValue({
      user: {
        id: 'user_1',
        mobileOnboardingState: {
          moreCards: {
            tipCalculator: {
              dismissedAt: '2026-04-28T12:00:00.000Z',
            },
          },
        },
      },
    } as ReturnType<typeof useAuth>);

    await renderMoreFeatureOnboardingScreen('tipCalculator', {
      mode: 'replay',
      source: 'profile',
    });

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('opens the destination without writing dismissal state in replay mode', async () => {
    const renderer = await renderMoreFeatureOnboardingScreen('tipCalculator', {
      mode: 'replay',
      source: 'profile',
    });

    await act(async () => {
      findPrimaryButton(renderer).props.onPress();
    });

    expect(mockWriteFeature).not.toHaveBeenCalled();
    expect(mockSaveOptimisticMobileOnboardingState).not.toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('TipCalculator');
    expect(mockTrackObservabilityEvent).toHaveBeenCalledWith(
      'MORE_ONBOARDING_CARD_CTA_TAPPED',
      expect.objectContaining({
        cardId: 'tipCalculator',
        entrySource: 'profile',
        mode: 'replay',
      }),
    );
  });

  it('uses the Profile replay layout without a secondary action for Profile tutorials', async () => {
    const renderer = await renderMoreFeatureOnboardingScreen('lists', {
      mode: 'replay',
      source: 'profile',
    });

    expect(renderer.root.findByType('FeatureIntroScreenContent').props.layout).toBe('immersive');
    expect(renderer.root.findAllByProps({ testID: 'more-feature-onboarding-back-button' })).toHaveLength(0);
    expect(findPrimaryButton(renderer).props.label).toBe('View My Lists');
    expect(renderer.root.findByType('Image').props.resizeMode).toBe('contain');
    expect(renderer.root.findByType('BackHeaderScreenScaffold').props.title).toBe('Tutorial');
  });

  it('falls back to Profile from replay back actions when there is no stack history', async () => {
    const renderer = await renderMoreFeatureOnboardingScreen('splitBill', {
      mode: 'replay',
      source: 'profile',
    });

    await act(async () => {
      renderer.root.findByType('BackHeaderScreenScaffold').props.onBackPress();
    });

    expect(mockGoBack).not.toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('Profile');
  });

  it('uses stack back from replay back actions when possible', async () => {
    mockCanGoBack.mockReturnValue(true);
    const renderer = await renderMoreFeatureOnboardingScreen('lists', {
      mode: 'replay',
      source: 'profile',
    });

    await act(async () => {
      renderer.root.findByType('BackHeaderScreenScaffold').props.onBackPress();
    });

    expect(mockGoBack).toHaveBeenCalledTimes(1);
    expect(mockNavigate).not.toHaveBeenCalledWith('Profile');
  });
});
