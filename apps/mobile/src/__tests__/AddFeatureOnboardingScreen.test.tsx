import React from 'react';
import { act, create } from 'react-test-renderer';

import { AddFeatureOnboardingScreen } from '../screens/AddFeatureOnboardingScreen';
import { useOfflineAwareFeatureWrite } from '../features/store/useOfflineAwareFeatureWrite';
import { useAuth } from '../providers/AuthProvider';
import type { AddOnboardingCardId } from '../types/auth';

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
    backLabel,
    backTestID,
    config,
    errorMessage,
    isSubmitting,
    layout,
    onBackPress,
    onPrimaryPress,
    primaryTestID,
    showSecondaryAction = true,
  }: Record<string, any>) =>
    mockReact.createElement(
      'FeatureIntroScreenContent',
      {
        layout,
        showSecondaryAction,
      },
      mockReact.createElement('Image', { resizeMode: layout === 'profileReplay' ? 'contain' : 'cover', source: config.imageSource }),
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
      showSecondaryAction
        ? mockReact.createElement('Button', {
            disabled: isSubmitting,
            label: backLabel,
            onPress: onBackPress,
            testID: backTestID,
            variant: 'secondary',
          })
        : null,
    ),
}));

jest.mock('../components/shared/PageErrorToast', () => ({
  PageErrorToast: (props: Record<string, unknown>) => mockReact.createElement('PageErrorToast', props),
}));

jest.mock('../features', () => ({
  buildAddOnboardingCardDismissedState: jest.fn((state, input) => ({
    ...(state ?? {}),
    addCards: {
      ...(state?.addCards ?? {}),
      [input.cardId]: {
        dismissedAt: input.dismissedAt,
      },
    },
  })),
  dismissAddOnboardingCard: jest.fn(),
  isAddOnboardingCardDismissed: jest.fn((state, cardId) => Boolean(state?.addCards?.[cardId]?.dismissedAt)),
  saveOptimisticMobileOnboardingState: (...args: unknown[]) => mockSaveOptimisticMobileOnboardingState(...args),
}));

jest.mock('../features/store/useOfflineAwareFeatureWrite', () => ({
  useOfflineAwareFeatureWrite: jest.fn(),
}));

jest.mock('../lib/onboardingAssets', () => ({
  FEATURE_ONBOARDING_ASSETS: {
    trackRestaurantVisit: { uri: 'asset://track-restaurant-visit' },
    trackFoodProduct: { uri: 'asset://track-food-product' },
    logNote: { uri: 'asset://log-note' },
    processSavedPhotos: { uri: 'asset://process-saved-photos' },
    manageNotes: { uri: 'asset://manage-notes' },
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
              brand: 'brand',
              info: 'info',
              secondary: 'secondary',
              success: 'success',
              warning: 'warning',
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
        brand: 'brand',
        info: 'info',
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

const expectedConfig: Record<
  AddOnboardingCardId,
  {
    title: string;
    description: string;
    imageSource: { uri: string };
    primaryLabel: string;
    destination: 'CreateVisit' | 'FoodProduct' | 'NoteEditor' | 'ProcessPhotos' | 'Notes';
  }
> = {
  trackRestaurantVisit: {
    title: 'Track a restaurant visit',
    description: 'Add the restaurant, rate what you ordered, attach photos, and keep the visit ready for your feed.',
    imageSource: { uri: 'asset://track-restaurant-visit' },
    primaryLabel: 'Start Visit',
    destination: 'CreateVisit',
  },
  trackFoodProduct: {
    title: 'Track a food product',
    description: 'Save groceries, market finds, snacks, and drinks without creating a full restaurant visit.',
    imageSource: { uri: 'asset://track-food-product' },
    primaryLabel: 'Track Product',
    destination: 'FoodProduct',
  },
  logNote: {
    title: 'Log a note',
    description: 'Capture food ideas, places, recipes, and reminders before turning them into entries later.',
    imageSource: { uri: 'asset://log-note' },
    primaryLabel: 'Write Note',
    destination: 'NoteEditor',
  },
  processSavedPhotos: {
    title: 'Process saved photos',
    description: 'Review saved food photos and decide whether each one should become a visit or food product.',
    imageSource: { uri: 'asset://process-saved-photos' },
    primaryLabel: 'Process Photos',
    destination: 'ProcessPhotos',
  },
  manageNotes: {
    title: 'Manage notes',
    description: 'Search, edit, delete, and convert your notes when you are ready to track what they describe.',
    imageSource: { uri: 'asset://manage-notes' },
    primaryLabel: 'View Notes',
    destination: 'Notes',
  },
};

async function renderAddFeatureOnboardingScreen(
  cardId: AddOnboardingCardId,
  params: Partial<{
    mode: 'firstRun' | 'replay';
    source: 'add' | 'profile';
  }> = {},
): Promise<any> {
  let renderer: any;
  await act(async () => {
    renderer = create(
      <AddFeatureOnboardingScreen
        navigation={
          {
            canGoBack: mockCanGoBack,
            goBack: mockGoBack,
            navigate: mockNavigate,
            replace: mockReplace,
          } as never
        }
        route={{
          key: `AddFeatureOnboarding-${cardId}`,
          name: 'AddFeatureOnboarding',
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
  return renderer.root.findByProps({ testID: 'add-feature-onboarding-primary-button' });
}

function findTextNodes(renderer: any, children: string): any[] {
  return renderer.root.findAll((node: any) => node.type === 'Text' && node.props.children === children);
}

describe('AddFeatureOnboardingScreen', () => {
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

  it.each(['trackRestaurantVisit', 'trackFoodProduct', 'logNote', 'processSavedPhotos', 'manageNotes'] as const)(
    'renders the configured intro for %s',
    async (cardId) => {
      const renderer = await renderAddFeatureOnboardingScreen(cardId);
      const config = expectedConfig[cardId];

      expect(findTextNodes(renderer, config.title)).toHaveLength(1);
      expect(findTextNodes(renderer, config.description)).toHaveLength(1);
      expect(renderer.root.findByType('Image').props.source).toEqual(config.imageSource);
      expect(findPrimaryButton(renderer).props.label).toBe(config.primaryLabel);
    },
  );

  it.each(['trackRestaurantVisit', 'trackFoodProduct', 'logNote', 'processSavedPhotos', 'manageNotes'] as const)(
    'dismisses %s onboarding and opens the destination',
    async (cardId) => {
      const renderer = await renderAddFeatureOnboardingScreen(cardId);

      await act(async () => {
        findPrimaryButton(renderer).props.onPress();
        await Promise.resolve();
      });

      expect(mockWriteFeature).toHaveBeenCalledWith(
        expect.objectContaining({
          operationName: 'onboarding.add-card.dismiss',
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
    const renderer = await renderAddFeatureOnboardingScreen('trackRestaurantVisit');

    await act(async () => {
      findPrimaryButton(renderer).props.onPress();
      await Promise.resolve();
    });

    expect(mockSaveOptimisticMobileOnboardingState).toHaveBeenCalledWith(
      expect.objectContaining({
        addCards: expect.objectContaining({
          trackRestaurantVisit: expect.objectContaining({
            dismissedAt: expect.any(String),
          }),
        }),
      }),
    );
    expect(mockReplace).toHaveBeenCalledWith('CreateVisit');
  });

  it('shows an error and does not navigate when dismissal fails', async () => {
    mockWriteFeature.mockRejectedValue(new Error('Network failed'));
    const renderer = await renderAddFeatureOnboardingScreen('logNote');

    await act(async () => {
      findPrimaryButton(renderer).props.onPress();
      await Promise.resolve();
    });

    expect(renderer.root.findByType('PageErrorToast').props.errorMessage).toBe('Network failed');
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('returns to Add without dismissing onboarding', async () => {
    const renderer = await renderAddFeatureOnboardingScreen('processSavedPhotos');

    await act(async () => {
      renderer.root.findByProps({ testID: 'add-feature-onboarding-back-button' }).props.onPress();
    });

    expect(mockWriteFeature).not.toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('AddVisit');
  });

  it('replaces to the destination when the card is already dismissed', async () => {
    mockedUseAuth.mockReturnValue({
      user: {
        id: 'user_1',
        mobileOnboardingState: {
          addCards: {
            manageNotes: {
              dismissedAt: '2026-04-28T12:00:00.000Z',
            },
          },
        },
      },
    } as ReturnType<typeof useAuth>);

    await renderAddFeatureOnboardingScreen('manageNotes');

    expect(mockReplace).toHaveBeenCalledWith('Notes');
  });

  it('opens the destination without writing dismissal state in replay mode', async () => {
    const renderer = await renderAddFeatureOnboardingScreen('trackFoodProduct', {
      mode: 'replay',
      source: 'profile',
    });

    await act(async () => {
      findPrimaryButton(renderer).props.onPress();
    });

    expect(mockWriteFeature).not.toHaveBeenCalled();
    expect(mockSaveOptimisticMobileOnboardingState).not.toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('FoodProduct');
    expect(mockTrackObservabilityEvent).toHaveBeenCalledWith(
      'ADD_ONBOARDING_CARD_CTA_TAPPED',
      expect.objectContaining({
        cardId: 'trackFoodProduct',
        entrySource: 'profile',
        mode: 'replay',
      }),
    );
  });

  it('uses the Profile replay layout without a secondary action for Profile tutorials', async () => {
    const renderer = await renderAddFeatureOnboardingScreen('trackRestaurantVisit', {
      mode: 'replay',
      source: 'profile',
    });

    expect(renderer.root.findByType('FeatureIntroScreenContent').props.layout).toBe('profileReplay');
    expect(renderer.root.findByType('FeatureIntroScreenContent').props.showSecondaryAction).toBe(false);
    expect(renderer.root.findAllByProps({ testID: 'add-feature-onboarding-back-button' })).toHaveLength(0);
    expect(findPrimaryButton(renderer).props.label).toBe('Start Visit');
    expect(renderer.root.findByType('Image').props.resizeMode).toBe('contain');
    expect(renderer.root.findByType('BackHeaderScreenScaffold').props.title).toBe('Tutorial');
  });

  it('falls back to Profile from replay back actions when there is no stack history', async () => {
    const renderer = await renderAddFeatureOnboardingScreen('logNote', {
      mode: 'replay',
      source: 'profile',
    });

    await act(async () => {
      renderer.root.findByType('BackHeaderScreenScaffold').props.onBackPress();
    });

    expect(mockGoBack).not.toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('Profile');
  });
});
