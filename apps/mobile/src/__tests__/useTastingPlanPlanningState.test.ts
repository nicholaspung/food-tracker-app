import {
  buildTastingPlanPlanningFacts,
  type TastingPlanPlanningPhase,
} from '../features/store/useTastingPlanPlanningState';
import type { TastingSessionRecord } from '../features/models';

const planningSession: TastingSessionRecord = {
  id: 'session-1',
  createdAt: '2026-05-16T10:00:00.000Z',
  invites: [],
  joinExpiresAt: '2026-05-16T11:00:00.000Z',
  joinedCount: 1,
  leaderUserId: 'user-1',
  maxApprovedItems: 6,
  maxParticipants: 4,
  maxRestaurants: 3,
  name: 'Test',
  participants: [],
  restaurants: [
    {
      createdAt: '2026-05-16T10:05:00.000Z',
      id: 'suggestion-1',
      items: [
        {
          createdAt: '2026-05-16T10:07:00.000Z',
          id: 'item-1',
          menuItemId: 'menu-item-1',
          name: 'Shoyu Ramen',
          ratings: [],
          restaurantSuggestionId: 'suggestion-1',
          status: 'approved',
          suggestedByParticipantId: 'participant-1',
        },
        {
          createdAt: '2026-05-16T10:08:00.000Z',
          id: 'item-2',
          menuItemId: 'menu-item-2',
          name: 'Rejected Gyoza',
          ratings: [],
          restaurantSuggestionId: 'suggestion-1',
          status: 'rejected',
          suggestedByParticipantId: 'participant-1',
        },
      ],
      restaurantId: 'restaurant-1',
      restaurantName: 'Corner Ramen',
      status: 'approved',
      suggestedByParticipantId: 'participant-1',
    },
    {
      createdAt: '2026-05-16T10:06:00.000Z',
      id: 'suggestion-2',
      items: [],
      restaurantId: 'restaurant-2',
      restaurantName: 'Sushi Stand',
      status: 'approved',
      suggestedByParticipantId: 'participant-1',
    },
    {
      createdAt: '2026-05-16T10:09:00.000Z',
      id: 'suggestion-3',
      items: [],
      restaurantId: 'restaurant-3',
      restaurantName: 'Rejected Cafe',
      status: 'rejected',
      suggestedByParticipantId: 'participant-1',
    },
  ],
  status: 'planning',
  updatedAt: '2026-05-16T10:00:00.000Z',
};

describe('buildTastingPlanPlanningFacts', () => {
  it('normalizes selected restaurants, active restaurant, and selected menu item facts', () => {
    const facts = buildTastingPlanPlanningFacts({
      activeRestaurantSuggestionId: 'suggestion-1',
      isLeader: true,
      isOnline: true,
      session: planningSession,
    });

    expect(facts.selectedRestaurantFacts).toEqual([
      {
        id: 'suggestion-1',
        restaurantId: 'restaurant-1',
        restaurantName: 'Corner Ramen',
        selectedItemCount: 1,
      },
      {
        id: 'suggestion-2',
        restaurantId: 'restaurant-2',
        restaurantName: 'Sushi Stand',
        selectedItemCount: 0,
      },
    ]);
    expect(facts.activeRestaurantFact).toEqual({
      id: 'suggestion-1',
      restaurantId: 'restaurant-1',
      restaurantName: 'Corner Ramen',
      selectedItemCount: 1,
    });
    expect(facts.selectedRestaurantIds.has('restaurant-1')).toBe(true);
    expect(facts.selectedItemIds.has('menu-item-1')).toBe(true);
    expect(facts.selectedItemIds.has('menu-item-2')).toBe(false);
  });

  it('falls back to the first selected restaurant when the active restaurant is missing', () => {
    const facts = buildTastingPlanPlanningFacts({
      activeRestaurantSuggestionId: 'missing-suggestion',
      isLeader: true,
      isOnline: true,
      session: planningSession,
    });

    expect(facts.activeRestaurant?.id).toBe('suggestion-1');
    expect(facts.scanHandoff).toEqual({
      disabled: false,
      restaurantId: 'restaurant-1',
      restaurantName: 'Corner Ramen',
    });
  });

  it('produces start readiness and missing-item confirmation facts', () => {
    const facts = buildTastingPlanPlanningFacts({
      activeRestaurantSuggestionId: 'suggestion-1',
      isLeader: true,
      isOnline: true,
      session: planningSession,
    });

    expect(facts.startReadiness).toEqual({
      canStart: true,
      disabledReason: null,
      hasSelectedItems: true,
      hasSelectedRestaurants: true,
    });
    expect(facts.missingItemConfirmation).toEqual({
      description: 'Are you sure you want to continue? Sushi Stand does not have a menu item to rate.',
      restaurantNames: ['Sushi Stand'],
      required: true,
    });
  });

  it('blocks leader planning actions while offline', () => {
    const facts = buildTastingPlanPlanningFacts({
      activeRestaurantSuggestionId: 'suggestion-1',
      isLeader: true,
      isOnline: false,
      session: planningSession,
    });

    expect(facts.onlineActions).toEqual({
      disabled: true,
      message: 'Planning actions require a connection.',
    });
    expect(facts.startReadiness).toMatchObject({
      canStart: false,
      disabledReason: 'Planning actions require a connection.',
    });
    expect(facts.scanHandoff).toEqual({
      disabled: true,
      restaurantId: 'restaurant-1',
      restaurantName: 'Corner Ramen',
    });
  });

  it('supports explicit phase movement labels for planning state callers', () => {
    const restaurantPhase: TastingPlanPlanningPhase = 'restaurants';
    const itemPhase: TastingPlanPlanningPhase = 'items';

    expect([restaurantPhase, itemPhase]).toEqual(['restaurants', 'items']);
  });
});
