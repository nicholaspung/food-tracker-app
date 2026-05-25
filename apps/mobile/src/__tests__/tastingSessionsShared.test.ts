import type { TastingInviteRecord, TastingSessionRecord } from '../features';
import {
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
