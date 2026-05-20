import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import {
  buildAddOnboardingCardDismissedState,
  buildMainOnboardingCompletedState,
  buildMoreOnboardingCardDismissedState,
  completeMainOnboarding,
  dismissAddOnboardingCard,
  dismissMoreOnboardingCard,
  saveOptimisticMobileOnboardingState,
} from '../features/store/onboardingStore';
import { useOfflineAwareFeatureWrite } from '../features/store/useOfflineAwareFeatureWrite';
import { useOnboardingProgressWrites } from '../features/store/useOnboardingProgressWrites';

jest.mock('../features/store/onboardingStore', () => ({
  MAIN_ONBOARDING_VERSION: 1,
  buildAddOnboardingCardDismissedState: jest.fn((state, input) => ({
    ...(state ?? {}),
    addCards: {
      ...(state?.addCards ?? {}),
      [input.cardId]: {
        dismissedAt: input.dismissedAt,
      },
    },
  })),
  buildMainOnboardingCompletedState: jest.fn((state, input) => ({
    ...(state ?? {}),
    main: {
      completedAt: input.completedAt,
      completedVersion: input.version,
    },
  })),
  buildMoreOnboardingCardDismissedState: jest.fn((state, input) => ({
    ...(state ?? {}),
    moreCards: {
      ...(state?.moreCards ?? {}),
      [input.cardId]: {
        dismissedAt: input.dismissedAt,
      },
    },
  })),
  completeMainOnboarding: jest.fn(),
  dismissAddOnboardingCard: jest.fn(),
  dismissMoreOnboardingCard: jest.fn(),
  saveOptimisticMobileOnboardingState: jest.fn(),
}));

jest.mock('../features/store/useOfflineAwareFeatureWrite', () => ({
  useOfflineAwareFeatureWrite: jest.fn(),
}));

const mockedBuildAddOnboardingCardDismissedState =
  buildAddOnboardingCardDismissedState as jest.MockedFunction<typeof buildAddOnboardingCardDismissedState>;
const mockedBuildMainOnboardingCompletedState =
  buildMainOnboardingCompletedState as jest.MockedFunction<typeof buildMainOnboardingCompletedState>;
const mockedBuildMoreOnboardingCardDismissedState =
  buildMoreOnboardingCardDismissedState as jest.MockedFunction<typeof buildMoreOnboardingCardDismissedState>;
const mockedCompleteMainOnboarding =
  completeMainOnboarding as jest.MockedFunction<typeof completeMainOnboarding>;
const mockedDismissAddOnboardingCard =
  dismissAddOnboardingCard as jest.MockedFunction<typeof dismissAddOnboardingCard>;
const mockedDismissMoreOnboardingCard =
  dismissMoreOnboardingCard as jest.MockedFunction<typeof dismissMoreOnboardingCard>;
const mockedSaveOptimisticMobileOnboardingState =
  saveOptimisticMobileOnboardingState as jest.MockedFunction<typeof saveOptimisticMobileOnboardingState>;
const mockedUseOfflineAwareFeatureWrite =
  useOfflineAwareFeatureWrite as jest.MockedFunction<typeof useOfflineAwareFeatureWrite>;

describe('useOnboardingProgressWrites', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedCompleteMainOnboarding.mockResolvedValue({ id: 'user_1' } as never);
    mockedDismissAddOnboardingCard.mockResolvedValue({ id: 'user_1' } as never);
    mockedDismissMoreOnboardingCard.mockResolvedValue({ id: 'user_1' } as never);
  });

  async function renderHook(): Promise<{
    hook: ReturnType<typeof useOnboardingProgressWrites>;
    renderer: ReactTestRenderer;
  }> {
    let hook: ReturnType<typeof useOnboardingProgressWrites> | null = null;
    let renderer: ReactTestRenderer | null = null;

    function TestComponent() {
      hook = useOnboardingProgressWrites();
      return null;
    }

    await act(async () => {
      renderer = create(React.createElement(TestComponent));
    });

    if (!hook || !renderer) {
      throw new Error('Expected hook to render.');
    }

    return { hook, renderer };
  }

  it('completes main onboarding through the outbox payload', async () => {
    const writeFeature = jest.fn(async ({ execute }) => ({
      result: await execute(),
      status: 'completed' as const,
    }));
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(
      writeFeature as ReturnType<typeof useOfflineAwareFeatureWrite>,
    );
    const { hook, renderer } = await renderHook();

    await hook.completeMainOnboarding({
      currentOnboardingState: {},
      userId: 'user_1',
      version: 1,
      completedAt: '2026-05-20T12:00:00.000Z',
    });

    expect(writeFeature).toHaveBeenCalledWith(
      expect.objectContaining({
        operationName: 'onboarding.main.complete',
        trackOnlineWrite: false,
        offline: {
          strategy: 'outbox',
          payload: {
            userId: 'user_1',
            version: 1,
            completedAt: '2026-05-20T12:00:00.000Z',
          },
        },
      }),
    );
    expect(mockedCompleteMainOnboarding).toHaveBeenCalledWith('user_1', {
      version: 1,
      completedAt: '2026-05-20T12:00:00.000Z',
    });
    expect(mockedSaveOptimisticMobileOnboardingState).not.toHaveBeenCalled();

    await act(async () => {
      renderer.unmount();
    });
  });

  it('optimistically saves queued main onboarding completion', async () => {
    const writeFeature = jest.fn().mockResolvedValue({ status: 'queued' });
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(
      writeFeature as ReturnType<typeof useOfflineAwareFeatureWrite>,
    );
    const { hook, renderer } = await renderHook();

    await hook.completeMainOnboarding({
      currentOnboardingState: {},
      userId: 'user_1',
      version: 1,
      completedAt: '2026-05-20T12:00:00.000Z',
    });

    expect(mockedBuildMainOnboardingCompletedState).toHaveBeenCalledWith({}, {
      version: 1,
      completedAt: '2026-05-20T12:00:00.000Z',
    });
    expect(mockedSaveOptimisticMobileOnboardingState).toHaveBeenCalledWith(
      expect.objectContaining({
        main: expect.objectContaining({
          completedVersion: 1,
        }),
      }),
    );

    await act(async () => {
      renderer.unmount();
    });
  });

  it('dismisses Add and More onboarding cards through focused replay payloads', async () => {
    const writeFeature = jest.fn(async ({ execute }) => ({
      result: await execute(),
      status: 'completed' as const,
    }));
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(
      writeFeature as ReturnType<typeof useOfflineAwareFeatureWrite>,
    );
    const { hook, renderer } = await renderHook();

    await hook.dismissAddOnboardingCard({
      cardId: 'trackRestaurantVisit',
      currentOnboardingState: {},
      dismissedAt: '2026-05-20T12:00:00.000Z',
      userId: 'user_1',
    });
    await hook.dismissMoreOnboardingCard({
      cardId: 'tipCalculator',
      currentOnboardingState: {},
      dismissedAt: '2026-05-20T12:01:00.000Z',
      userId: 'user_1',
    });

    expect(writeFeature).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        operationName: 'onboarding.add-card.dismiss',
        offline: {
          strategy: 'outbox',
          payload: {
            userId: 'user_1',
            cardId: 'trackRestaurantVisit',
            dismissedAt: '2026-05-20T12:00:00.000Z',
          },
        },
      }),
    );
    expect(writeFeature).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        operationName: 'onboarding.more-card.dismiss',
        offline: {
          strategy: 'outbox',
          payload: {
            userId: 'user_1',
            cardId: 'tipCalculator',
            dismissedAt: '2026-05-20T12:01:00.000Z',
          },
        },
      }),
    );
    expect(mockedDismissAddOnboardingCard).toHaveBeenCalledWith('user_1', {
      cardId: 'trackRestaurantVisit',
      dismissedAt: '2026-05-20T12:00:00.000Z',
    });
    expect(mockedDismissMoreOnboardingCard).toHaveBeenCalledWith('user_1', {
      cardId: 'tipCalculator',
      dismissedAt: '2026-05-20T12:01:00.000Z',
    });

    await act(async () => {
      renderer.unmount();
    });
  });

  it('optimistically saves queued Add and More onboarding dismissals', async () => {
    const writeFeature = jest.fn().mockResolvedValue({ status: 'queued' });
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(
      writeFeature as ReturnType<typeof useOfflineAwareFeatureWrite>,
    );
    const { hook, renderer } = await renderHook();

    await hook.dismissAddOnboardingCard({
      cardId: 'logNote',
      currentOnboardingState: {},
      dismissedAt: '2026-05-20T12:00:00.000Z',
      userId: 'user_1',
    });
    await hook.dismissMoreOnboardingCard({
      cardId: 'lists',
      currentOnboardingState: {},
      dismissedAt: '2026-05-20T12:01:00.000Z',
      userId: 'user_1',
    });

    expect(mockedBuildAddOnboardingCardDismissedState).toHaveBeenCalledWith({}, {
      cardId: 'logNote',
      dismissedAt: '2026-05-20T12:00:00.000Z',
    });
    expect(mockedBuildMoreOnboardingCardDismissedState).toHaveBeenCalledWith({}, {
      cardId: 'lists',
      dismissedAt: '2026-05-20T12:01:00.000Z',
    });
    expect(mockedSaveOptimisticMobileOnboardingState).toHaveBeenCalledTimes(2);

    await act(async () => {
      renderer.unmount();
    });
  });
});
