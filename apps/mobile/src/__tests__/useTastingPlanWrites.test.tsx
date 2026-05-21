import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useQueryClient } from '@tanstack/react-query';

import {
  setTastingMenuItemSuggestionStatus,
  setTastingRestaurantSuggestionStatus,
  startTastingSession,
  suggestTastingMenuItem,
  suggestTastingRestaurant,
} from '../features/store/tastingSessionsApiStore';
import { tastingSessionsQueryKeys } from '../features/store/tastingSessionsQuery';
import { useTastingPlanWrites } from '../features/store/useTastingPlanWrites';

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: jest.fn(),
}));

jest.mock('../features/store/tastingSessionsApiStore', () => ({
  setTastingMenuItemSuggestionStatus: jest.fn(),
  setTastingRestaurantSuggestionStatus: jest.fn(),
  startTastingSession: jest.fn(),
  suggestTastingMenuItem: jest.fn(),
  suggestTastingRestaurant: jest.fn(),
}));

const mockedUseQueryClient = useQueryClient as jest.MockedFunction<typeof useQueryClient>;
const mockedSetTastingMenuItemSuggestionStatus =
  setTastingMenuItemSuggestionStatus as jest.MockedFunction<typeof setTastingMenuItemSuggestionStatus>;
const mockedSetTastingRestaurantSuggestionStatus =
  setTastingRestaurantSuggestionStatus as jest.MockedFunction<typeof setTastingRestaurantSuggestionStatus>;
const mockedStartTastingSession = startTastingSession as jest.MockedFunction<typeof startTastingSession>;
const mockedSuggestTastingMenuItem = suggestTastingMenuItem as jest.MockedFunction<typeof suggestTastingMenuItem>;
const mockedSuggestTastingRestaurant =
  suggestTastingRestaurant as jest.MockedFunction<typeof suggestTastingRestaurant>;

const tastingSession = {
  createdAt: '2026-05-20T00:00:00.000Z',
  createdByUserId: 'user_1',
  id: 'session_1',
  inviteCode: 'ABC123',
  invites: [],
  joinExpiresAt: '2026-05-20T01:00:00.000Z',
  joinedCount: 1,
  leaderUserId: 'user_1',
  maxApprovedItems: 8,
  maxParticipants: 8,
  maxRestaurants: 3,
  name: 'Ramen night',
  participants: [],
  restaurants: [],
  status: 'planning',
  updatedAt: '2026-05-20T00:00:00.000Z',
} as const;

describe('useTastingPlanWrites', () => {
  const queryClient = {
    invalidateQueries: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.invalidateQueries.mockResolvedValue(undefined);
    mockedUseQueryClient.mockReturnValue(queryClient as never);
    mockedSetTastingMenuItemSuggestionStatus.mockResolvedValue(tastingSession as never);
    mockedSetTastingRestaurantSuggestionStatus.mockResolvedValue(tastingSession as never);
    mockedStartTastingSession.mockResolvedValue({ ...tastingSession, status: 'tasting' } as never);
    mockedSuggestTastingMenuItem.mockResolvedValue(tastingSession as never);
    mockedSuggestTastingRestaurant.mockResolvedValue(tastingSession as never);
  });

  async function renderHook(): Promise<{
    hook: ReturnType<typeof useTastingPlanWrites>;
    renderer: ReactTestRenderer;
  }> {
    let hook: ReturnType<typeof useTastingPlanWrites> | null = null;
    let renderer: ReactTestRenderer | null = null;

    function TestComponent() {
      hook = useTastingPlanWrites();
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

  it('adds and removes restaurants through Tasting Plan verbs', async () => {
    const { hook, renderer } = await renderHook();

    await hook.addRestaurant({
      isOnline: true,
      restaurant: {
        id: 'restaurant_1',
        name: 'Corner Ramen',
      },
      sessionId: 'session_1',
    });
    await hook.removeRestaurant({
      isOnline: true,
      restaurantSuggestionId: 'suggestion_1',
      sessionId: 'session_1',
    });

    expect(mockedSuggestTastingRestaurant).toHaveBeenCalledWith('session_1', {
      restaurantId: 'restaurant_1',
      restaurantName: 'Corner Ramen',
    });
    expect(mockedSetTastingRestaurantSuggestionStatus).toHaveBeenCalledWith(
      'session_1',
      'suggestion_1',
      'rejected',
    );
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: tastingSessionsQueryKeys.detail('session_1'),
    });

    await act(async () => {
      renderer.unmount();
    });
  });

  it('adds, re-approves, and removes menu items through Tasting Plan verbs', async () => {
    const { hook, renderer } = await renderHook();

    await hook.addMenuItem({
      isOnline: true,
      menuItem: {
        id: 'menu_item_1',
        name: 'Shoyu Ramen',
      },
      restaurantSuggestionId: 'suggestion_1',
      sessionId: 'session_1',
    });
    await hook.addMenuItem({
      existingSuggestionId: 'item_suggestion_1',
      isOnline: true,
      menuItem: {
        id: 'menu_item_1',
        name: 'Shoyu Ramen',
      },
      restaurantSuggestionId: 'suggestion_1',
      sessionId: 'session_1',
    });
    await hook.removeMenuItem({
      isOnline: true,
      itemSuggestionId: 'item_suggestion_1',
      sessionId: 'session_1',
    });

    expect(mockedSuggestTastingMenuItem).toHaveBeenCalledWith('session_1', 'suggestion_1', {
      menuItemId: 'menu_item_1',
      name: 'Shoyu Ramen',
    });
    expect(mockedSetTastingMenuItemSuggestionStatus).toHaveBeenCalledWith(
      'session_1',
      'item_suggestion_1',
      'approved',
    );
    expect(mockedSetTastingMenuItemSuggestionStatus).toHaveBeenCalledWith(
      'session_1',
      'item_suggestion_1',
      'rejected',
    );

    await act(async () => {
      renderer.unmount();
    });
  });

  it('starts tasting and refreshes Tasting Plan state', async () => {
    const { hook, renderer } = await renderHook();

    await hook.startTasting({ isOnline: true, sessionId: 'session_1' });

    expect(mockedStartTastingSession).toHaveBeenCalledWith('session_1');
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: tastingSessionsQueryKeys.detail('session_1'),
    });

    await act(async () => {
      renderer.unmount();
    });
  });

  it('blocks offline Tasting Plan actions without calling write functions', async () => {
    const { hook, renderer } = await renderHook();

    const result = await hook.addRestaurant({
      isOnline: false,
      restaurant: {
        id: 'restaurant_1',
        name: 'Corner Ramen',
      },
      sessionId: 'session_1',
    });

    expect(result).toEqual({
      message: 'Planning actions require a connection.',
      status: 'blocked',
    });
    expect(mockedSuggestTastingRestaurant).not.toHaveBeenCalled();
    expect(queryClient.invalidateQueries).not.toHaveBeenCalled();

    await act(async () => {
      renderer.unmount();
    });
  });
});
