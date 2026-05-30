import {
  summarizeBillOwedNotificationSignal,
  summarizeTastingSessionNotificationSignal,
  type TastingSessionRecord,
} from '../features';

const NOW_MS = new Date('2026-05-29T12:00:00.000Z').getTime();

function buildSession(overrides: Partial<TastingSessionRecord> = {}): TastingSessionRecord {
  return {
    createdAt: '2026-05-20T11:00:00.000Z',
    id: 'session_1',
    inviteCode: '',
    invites: [],
    joinedCount: 1,
    joinExpiresAt: '2026-05-30T12:00:00.000Z',
    leaderUserId: 'leader_1',
    maxApprovedItems: 8,
    maxParticipants: 8,
    maxRestaurants: 3,
    name: 'Ramen night',
    participants: [],
    restaurants: [],
    status: 'lobby',
    updatedAt: '2026-05-20T11:00:00.000Z',
    ...overrides,
  };
}

describe('summarizeTastingSessionNotificationSignal', () => {
  it('returns a count indicator for pending tasting invites', () => {
    const summary = summarizeTastingSessionNotificationSignal({
      nowMs: NOW_MS,
      sessions: [
        buildSession({
          id: 'session_1',
          invites: [
            {
              createdAt: '2026-05-20T11:00:00.000Z',
              id: 'invite_1',
              invitedUserId: 'user_1',
              invitedUserName: 'Pat',
              status: 'pending',
            },
          ],
        }),
        buildSession({
          id: 'session_2',
          invites: [
            {
              createdAt: '2026-05-20T11:00:00.000Z',
              id: 'invite_2',
              invitedUserId: 'user_1',
              invitedUserName: 'Pat',
              status: 'pending',
            },
          ],
        }),
      ],
      userId: 'user_1',
    });

    expect(summary.pendingInviteCount).toBe(2);
    expect(summary.indicator).toEqual({ count: 2, kind: 'count' });
  });

  it('returns a plain dot for leader-owned active sessions with an invite code or open invite window', () => {
    expect(
      summarizeTastingSessionNotificationSignal({
        nowMs: NOW_MS,
        sessions: [
          buildSession({
            inviteCode: 'ABC123',
            joinExpiresAt: '2026-05-20T12:00:00.000Z',
            leaderUserId: 'user_1',
          }),
        ],
        userId: 'user_1',
      }).indicator,
    ).toEqual({ kind: 'dot' });

    expect(
      summarizeTastingSessionNotificationSignal({
        nowMs: NOW_MS,
        sessions: [
          buildSession({
            joinExpiresAt: '2026-05-30T12:00:00.000Z',
            leaderUserId: 'user_1',
          }),
        ],
        userId: 'user_1',
      }).indicator,
    ).toEqual({ kind: 'dot' });
  });

  it('returns a plain dot for accepted participants in active tasting sessions', () => {
    const summary = summarizeTastingSessionNotificationSignal({
      nowMs: NOW_MS,
      sessions: [
        buildSession({
          inviteCode: '',
          joinExpiresAt: '2000-01-01T00:00:00.000Z',
          leaderUserId: 'leader_1',
          participants: [
            {
              id: 'participant_1',
              joinedAt: '2026-05-20T11:00:00.000Z',
              name: 'Pat',
              role: 'participant',
              userId: 'user_1',
            },
          ],
          status: 'planning',
        }),
      ],
      userId: 'user_1',
    });

    expect(summary.hasActiveParticipantSession).toBe(true);
    expect(summary.indicator).toEqual({ kind: 'dot' });
  });

  it('prefers pending invite counts over leader invite dots', () => {
    const summary = summarizeTastingSessionNotificationSignal({
      nowMs: NOW_MS,
      sessions: [
        buildSession({
          id: 'leader_session',
          inviteCode: 'ABC123',
          leaderUserId: 'user_1',
        }),
        buildSession({
          id: 'invite_session',
          invites: [
            {
              createdAt: '2026-05-20T11:00:00.000Z',
              id: 'invite_1',
              invitedUserId: 'user_1',
              invitedUserName: 'Pat',
              status: 'pending',
            },
          ],
        }),
      ],
      userId: 'user_1',
    });

    expect(summary.hasLeaderInviteAction).toBe(true);
    expect(summary.hasActiveParticipantSession).toBe(false);
    expect(summary.indicator).toEqual({ count: 1, kind: 'count' });
  });

  it('returns no indicator when there are no unresolved tasting signals', () => {
    const summary = summarizeTastingSessionNotificationSignal({
      nowMs: NOW_MS,
      sessions: [
        buildSession({
          inviteCode: 'ABC123',
          invites: [
            {
              createdAt: '2026-05-20T11:00:00.000Z',
              id: 'invite_1',
              invitedUserId: 'user_1',
              invitedUserName: 'Pat',
              status: 'accepted',
            },
          ],
          leaderUserId: 'user_2',
          status: 'completed',
        }),
      ],
      userId: 'user_1',
    });

    expect(summary).toEqual({
      hasActiveParticipantSession: false,
      hasLeaderInviteAction: false,
      indicator: { kind: 'none' },
      pendingInviteCount: 0,
    });
  });

  it('does not show participant dots for completed sessions', () => {
    const summary = summarizeTastingSessionNotificationSignal({
      nowMs: NOW_MS,
      sessions: [
        buildSession({
          leaderUserId: 'leader_1',
          participants: [
            {
              id: 'participant_1',
              joinedAt: '2026-05-20T11:00:00.000Z',
              name: 'Pat',
              role: 'participant',
              userId: 'user_1',
            },
          ],
          status: 'completed',
        }),
      ],
      userId: 'user_1',
    });

    expect(summary.indicator).toEqual({ kind: 'none' });
  });
});

describe('summarizeBillOwedNotificationSignal', () => {
  it('returns a count indicator for active bills where the user owes money', () => {
    const summary = summarizeBillOwedNotificationSignal([
      {
        createdAt: '2026-05-20T11:00:00.000Z',
        id: 'bill_1',
        isCreator: false,
        participantCount: 2,
        pendingOtherParticipantCount: 0,
        status: 'open',
        title: 'Dinner',
        updatedAt: '2026-05-20T11:00:00.000Z',
        youAreOwed: 0,
        youOwe: 12.5,
      },
      {
        createdAt: '2026-05-20T11:00:00.000Z',
        id: 'bill_2',
        isCreator: false,
        participantCount: 2,
        pendingOtherParticipantCount: 0,
        status: 'settled',
        title: 'Settled',
        updatedAt: '2026-05-20T11:00:00.000Z',
        youAreOwed: 0,
        youOwe: 9,
      },
    ]);

    expect(summary).toEqual({
      activeOwedBillCount: 1,
      indicator: { count: 1, kind: 'count' },
    });
  });

  it('returns no indicator when the user does not owe on active bills', () => {
    expect(
      summarizeBillOwedNotificationSignal([
        {
          createdAt: '2026-05-20T11:00:00.000Z',
          id: 'bill_1',
          isCreator: true,
          participantCount: 2,
          pendingOtherParticipantCount: 1,
          status: 'open',
          title: 'Dinner',
          updatedAt: '2026-05-20T11:00:00.000Z',
          youAreOwed: 12.5,
          youOwe: 0,
        },
      ]),
    ).toEqual({
      activeOwedBillCount: 0,
      indicator: { kind: 'none' },
    });
  });
});
