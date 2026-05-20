import React from 'react';
import { useIsFocused } from '@react-navigation/native';
import { act, create } from 'react-test-renderer';

import { AddFeatureOnboardingScreen } from '../screens/AddFeatureOnboardingScreen';
import { useAuth } from '../providers/AuthProvider';
import type { AddOnboardingCardId } from '../types/auth';

const mockReact = React;
const mockNavigate = jest.fn();
const mockReplace = jest.fn();
const mockGoBack = jest.fn();
const mockCanGoBack = jest.fn();
const mockDismissAddOnboardingCard = jest.fn();
const mockSaveOptimisticMobileOnboardingState = jest.fn();
const mockTrackObservabilityEvent = jest.fn();

jest.mock('@expo/vector-icons', () => ({
  Ionicons: (props: Record<string, unknown>) => mockReact.createElement('Ionicons', props),
}));

jest.mock('@react-navigation/native', () => ({
  useIsFocused: jest.fn(),
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
    isMediaActive,
    isSubmitting,
    layout,
    mediaPlaybackKey,
    onPrimaryPress,
    primaryTestID,
  }: Record<string, any>) =>
    mockReact.createElement(
      'FeatureIntroScreenContent',
      {
        isMediaActive,
        layout,
        mediaPlaybackKey,
      },
      mockReact.createElement('Image', {
        resizeMode: layout === 'immersive' ? 'contain' : 'cover',
        source: config.media.posterSource,
      }),
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
  useOnboardingProgressWrites: () => ({
    dismissAddOnboardingCard: mockDismissAddOnboardingCard,
  }),
}));

jest.mock('../lib/onboardingAssets', () => ({
  FEATURE_ONBOARDING_ASSETS: {
    trackRestaurantVisit: {
      posterSource: { uri: 'asset://track-restaurant-visit' },
      videoUri: 'https://yummyrecs.com/tutorials/track-restaurant-visit.mp4',
    },
    trackFoodProduct: {
      posterSource: { uri: 'asset://track-food-product' },
      videoUri: 'https://yummyrecs.com/tutorials/track-food-product.mp4',
    },
    logNote: {
      posterSource: { uri: 'asset://log-note' },
      videoUri: 'https://yummyrecs.com/tutorials/log-note.mp4',
    },
    processSavedPhotos: {
      posterSource: { uri: 'asset://process-saved-photos' },
      videoUri: 'https://yummyrecs.com/tutorials/process-saved-photos.mp4',
    },
    manageNotes: {
      posterSource: { uri: 'asset://manage-notes' },
      videoUri: 'https://yummyrecs.com/tutorials/manage-notes.mp4',
    },
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
const mockedUseIsFocused = useIsFocused as jest.MockedFunction<typeof useIsFocused>;

const expectedConfig: Record<
  AddOnboardingCardId,
  {
    title: string;
    description: string;
    media: { posterSource: { uri: string }; videoUri: string };
    primaryLabel: string;
    destination: 'CreateVisit' | 'FoodProduct' | 'NoteEditor' | 'ProcessPhotos' | 'Notes';
  }
> = {
  trackRestaurantVisit: {
    title: 'Track a restaurant visit',
    description: 'Add the restaurant, rate what you ordered, attach photos, and keep the visit ready for your feed.',
    media: {
      posterSource: { uri: 'asset://track-restaurant-visit' },
      videoUri: 'https://yummyrecs.com/tutorials/track-restaurant-visit.mp4',
    },
    primaryLabel: 'Start Visit',
    destination: 'CreateVisit',
  },
  trackFoodProduct: {
    title: 'Track a food product',
    description: 'Save groceries, market finds, snacks, and drinks without creating a full restaurant visit.',
    media: {
      posterSource: { uri: 'asset://track-food-product' },
      videoUri: 'https://yummyrecs.com/tutorials/track-food-product.mp4',
    },
    primaryLabel: 'Track Product',
    destination: 'FoodProduct',
  },
  logNote: {
    title: 'Log a note',
    description: 'Capture food ideas, places, recipes, and reminders before turning them into entries later.',
    media: {
      posterSource: { uri: 'asset://log-note' },
      videoUri: 'https://yummyrecs.com/tutorials/log-note.mp4',
    },
    primaryLabel: 'Write Note',
    destination: 'NoteEditor',
  },
  processSavedPhotos: {
    title: 'Process saved photos',
    description: 'Review saved food photos and decide whether each one should become a visit or food product.',
    media: {
      posterSource: { uri: 'asset://process-saved-photos' },
      videoUri: 'https://yummyrecs.com/tutorials/process-saved-photos.mp4',
    },
    primaryLabel: 'Process Photos',
    destination: 'ProcessPhotos',
  },
  manageNotes: {
    title: 'Manage notes',
    description: 'Search, edit, delete, and convert your notes when you are ready to track what they describe.',
    media: {
      posterSource: { uri: 'asset://manage-notes' },
      videoUri: 'https://yummyrecs.com/tutorials/manage-notes.mp4',
    },
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
    mockDismissAddOnboardingCard.mockReset();
    mockSaveOptimisticMobileOnboardingState.mockReset();
    mockTrackObservabilityEvent.mockReset();
    mockCanGoBack.mockReturnValue(false);
    mockedUseIsFocused.mockReturnValue(true);
    mockedUseAuth.mockReturnValue({
      user: {
        id: 'user_1',
        mobileOnboardingState: {},
      },
    } as ReturnType<typeof useAuth>);
    mockDismissAddOnboardingCard.mockResolvedValue({ status: 'completed', result: {} });
  });

  it.each(['trackRestaurantVisit', 'trackFoodProduct', 'logNote', 'processSavedPhotos', 'manageNotes'] as const)(
    'renders the configured intro for %s',
    async (cardId) => {
      const renderer = await renderAddFeatureOnboardingScreen(cardId);
      const config = expectedConfig[cardId];

      expect(findTextNodes(renderer, config.title)).toHaveLength(1);
      expect(findTextNodes(renderer, config.description)).toHaveLength(1);
      expect(renderer.root.findByType('Image').props.source).toEqual(config.media.posterSource);
      expect(renderer.root.findByType('FeatureIntroScreenContent').props.layout).toBe('immersive');
      expect(renderer.root.findByType('FeatureIntroScreenContent').props.isMediaActive).toBe(true);
      expect(renderer.root.findByType('FeatureIntroScreenContent').props.mediaPlaybackKey).toBe(`${cardId}:firstRun:add`);
      expect(renderer.root.findAllByProps({ testID: 'add-feature-onboarding-back-button' })).toHaveLength(0);
      expect(findPrimaryButton(renderer).props.label).toBe(config.primaryLabel);
    },
  );

  it('passes inactive media state when the tutorial screen is not focused', async () => {
    mockedUseIsFocused.mockReturnValue(false);
    const renderer = await renderAddFeatureOnboardingScreen('logNote', {
      mode: 'replay',
      source: 'profile',
    });

    const content = renderer.root.findByType('FeatureIntroScreenContent');
    expect(content.props.isMediaActive).toBe(false);
    expect(content.props.mediaPlaybackKey).toBe('logNote:replay:profile');
  });

  it.each(['trackRestaurantVisit', 'trackFoodProduct', 'logNote', 'processSavedPhotos', 'manageNotes'] as const)(
    'dismisses %s onboarding and opens the destination',
    async (cardId) => {
      const renderer = await renderAddFeatureOnboardingScreen(cardId);

      await act(async () => {
        findPrimaryButton(renderer).props.onPress();
        await Promise.resolve();
      });

      expect(mockDismissAddOnboardingCard).toHaveBeenCalledWith(
        expect.objectContaining({
          cardId,
          userId: 'user_1',
        }),
      );
      expect(mockReplace).toHaveBeenCalledWith(expectedConfig[cardId].destination);
    },
  );

  it('saves optimistic onboarding state when the dismissal is queued', async () => {
    mockDismissAddOnboardingCard.mockImplementation(async (input) => {
      mockSaveOptimisticMobileOnboardingState({
        addCards: {
          [input.cardId]: {
            dismissedAt: input.dismissedAt,
          },
        },
      });
      return { status: 'queued' };
    });
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
    mockDismissAddOnboardingCard.mockRejectedValue(new Error('Network failed'));
    const renderer = await renderAddFeatureOnboardingScreen('logNote');

    await act(async () => {
      findPrimaryButton(renderer).props.onPress();
      await Promise.resolve();
    });

    expect(renderer.root.findByType('PageErrorToast').props.errorMessage).toBe('Network failed');
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('returns to Add from the header without dismissing onboarding', async () => {
    const renderer = await renderAddFeatureOnboardingScreen('processSavedPhotos');

    await act(async () => {
      renderer.root.findByType('BackHeaderScreenScaffold').props.onBackPress();
    });

    expect(mockDismissAddOnboardingCard).not.toHaveBeenCalled();
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

    expect(mockDismissAddOnboardingCard).not.toHaveBeenCalled();
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

    expect(renderer.root.findByType('FeatureIntroScreenContent').props.layout).toBe('immersive');
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
