import type { TastingInviteRecord, TastingSessionRecord } from '../features';
import {
  formatCompletedTastingSessionSubtitle,
  formatCompletedTastingSessionSummary,
  formatTastingSessionCount,
  getApprovedTastingItemCount,
  getApprovedTastingRestaurantCount,
  getTastingInviteDisplayStatus,
  isTastingInviteWindowExpired,
  isTastingInviteWindowOpen,
} from '../screens/tastingSessions/shared';

const nowMs = new Date('2026-05-20T12:00:00.000Z').getTime();

function buildInvite(status: TastingInviteRecord['status']): TastingInviteRecord {
  return {
    createdAt: '2026-05-20T11:00:00.000Z',
    id: 'invite_1',
    invitedUserId: 'user_2',
    invitedUserName: 'Madi',
    status,
  };
}

function buildSession(joinExpiresAt: string): Pick<TastingSessionRecord, 'joinExpiresAt'> {
  return { joinExpiresAt };
}

function buildCompletedSession(): TastingSessionRecord {
  return {
    createdAt: '2026-05-20T12:00:00.000Z',
    id: 'session_completed',
    invites: [],
    joinExpiresAt: '2026-05-20T12:30:00.000Z',
    joinedCount: 2,
    leaderUserId: 'user_1',
    maxApprovedItems: 6,
    maxParticipants: 4,
    maxRestaurants: 3,
    name: 'Completed tasting',
    participants: [
      {
        id: 'participant_1',
        joinedAt: '2026-05-20T11:00:00.000Z',
        name: 'Pat',
        role: 'leader',
        userId: 'user_1',
      },
      {
        id: 'participant_2',
        joinedAt: '2026-05-20T11:05:00.000Z',
        name: 'Sam',
        role: 'participant',
        userId: 'user_2',
      },
    ],
    restaurants: [
      {
        createdAt: '2026-05-20T11:10:00.000Z',
        id: 'restaurant_approved',
        items: [
          {
            createdAt: '2026-05-20T11:15:00.000Z',
            id: 'item_approved',
            menuItemId: 'menu_item_1',
            name: 'Tonkotsu',
            ratings: [],
            restaurantSuggestionId: 'restaurant_approved',
            status: 'approved',
            suggestedByParticipantId: 'participant_1',
          },
          {
            createdAt: '2026-05-20T11:16:00.000Z',
            id: 'item_rejected',
            menuItemId: 'menu_item_2',
            name: 'Gyoza',
            ratings: [],
            restaurantSuggestionId: 'restaurant_approved',
            status: 'rejected',
            suggestedByParticipantId: 'participant_2',
          },
        ],
        restaurantId: 'restaurant_record_1',
        restaurantName: 'Ramen Place',
        status: 'approved',
        suggestedByParticipantId: 'participant_1',
      },
      {
        createdAt: '2026-05-20T11:20:00.000Z',
        id: 'restaurant_rejected',
        items: [
          {
            createdAt: '2026-05-20T11:25:00.000Z',
            id: 'item_nested_approved',
            menuItemId: 'menu_item_3',
            name: 'Burger',
            ratings: [],
            restaurantSuggestionId: 'restaurant_rejected',
            status: 'approved',
            suggestedByParticipantId: 'participant_2',
          },
        ],
        restaurantId: 'restaurant_record_2',
        restaurantName: 'Burger Place',
        status: 'rejected',
        suggestedByParticipantId: 'participant_2',
      },
    ],
    status: 'completed',
    updatedAt: '2026-05-22T16:30:00.000Z',
  };
}

describe('tasting session invite window helpers', () => {
  it('treats pending invites with a future expiry as open and pending', () => {
    const session = buildSession('2026-05-20T12:30:00.000Z');

    expect(isTastingInviteWindowOpen(session.joinExpiresAt, nowMs)).toBe(true);
    expect(isTastingInviteWindowExpired(session.joinExpiresAt, nowMs)).toBe(false);
    expect(getTastingInviteDisplayStatus(buildInvite('pending'), session, nowMs)).toBe('pending');
  });

  it('treats pending invites with a past expiry as expired', () => {
    const session = buildSession('2026-05-20T11:59:00.000Z');

    expect(isTastingInviteWindowOpen(session.joinExpiresAt, nowMs)).toBe(false);
    expect(isTastingInviteWindowExpired(session.joinExpiresAt, nowMs)).toBe(true);
    expect(getTastingInviteDisplayStatus(buildInvite('pending'), session, nowMs)).toBe('expired');
  });

  it('treats invalid expiry timestamps as closed without changing final invite statuses', () => {
    const session = buildSession('not-a-date');

    expect(isTastingInviteWindowOpen(session.joinExpiresAt, nowMs)).toBe(false);
    expect(isTastingInviteWindowExpired(session.joinExpiresAt, nowMs)).toBe(true);
    expect(getTastingInviteDisplayStatus(buildInvite('accepted'), session, nowMs)).toBe('accepted');
  });
});

describe('tasting session completed summary helpers', () => {
  it('counts only approved restaurants and approved items inside approved restaurants', () => {
    const session = buildCompletedSession();

    expect(getApprovedTastingRestaurantCount(session)).toBe(1);
    expect(getApprovedTastingItemCount(session)).toBe(1);
  });

  it('formats pluralized count labels', () => {
    expect(formatTastingSessionCount(1, 'item', 'items')).toBe('1 item');
    expect(formatTastingSessionCount(2, 'item', 'items')).toBe('2 items');
  });

  it('formats completed session summary and subtitle copy', () => {
    const session = buildCompletedSession();

    expect(formatCompletedTastingSessionSummary(session)).toBe('1 restaurant, 1 item, 2 tasters');
    expect(formatCompletedTastingSessionSubtitle(session)).toBe(
      'May 22, 2026 - 1 restaurant, 1 item, 2 tasters',
    );
  });
});
