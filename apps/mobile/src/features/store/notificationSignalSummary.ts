import type { TastingSessionRecord } from '../models';
import type { BillListSummary } from './featureStore';

export type NotificationSignalIndicator =
  | { kind: 'none' }
  | { kind: 'dot' }
  | { kind: 'count'; count: number };

export interface TastingSessionNotificationSignalSummary {
  indicator: NotificationSignalIndicator;
  pendingInviteCount: number;
  hasLeaderInviteAction: boolean;
  hasActiveParticipantSession: boolean;
}

export interface BillOwedNotificationSignalSummary {
  indicator: NotificationSignalIndicator;
  activeOwedBillCount: number;
}

interface TastingSessionNotificationSignalInput {
  sessions: readonly TastingSessionRecord[];
  userId?: string | null;
  nowMs?: number;
}

const NO_TASTING_SIGNAL: TastingSessionNotificationSignalSummary = {
  hasActiveParticipantSession: false,
  hasLeaderInviteAction: false,
  indicator: { kind: 'none' },
  pendingInviteCount: 0,
};

const NO_BILL_OWED_SIGNAL: BillOwedNotificationSignalSummary = {
  activeOwedBillCount: 0,
  indicator: { kind: 'none' },
};

function isActiveTastingSession(session: TastingSessionRecord): boolean {
  return session.status !== 'completed';
}

function isInviteWindowOpen(joinExpiresAt: string, nowMs: number): boolean {
  const expiresTime = new Date(joinExpiresAt).getTime();
  return Number.isFinite(expiresTime) && nowMs < expiresTime;
}

function hasShareableInviteCode(session: TastingSessionRecord): boolean {
  return Boolean(session.inviteCode?.trim());
}

function isCurrentUserParticipant(session: TastingSessionRecord, userId: string): boolean {
  return session.participants.some((participant) => participant.userId === userId);
}

export function summarizeTastingSessionNotificationSignal({
  sessions,
  userId,
  nowMs = Date.now(),
}: TastingSessionNotificationSignalInput): TastingSessionNotificationSignalSummary {
  const normalizedUserId = userId?.trim();
  if (!normalizedUserId) {
    return NO_TASTING_SIGNAL;
  }

  const pendingInviteCount = sessions.reduce(
    (count, session) =>
      count +
      session.invites.filter(
        (invite) => invite.invitedUserId === normalizedUserId && invite.status === 'pending',
      ).length,
    0,
  );
  const hasLeaderInviteAction = sessions.some(
    (session) =>
      isActiveTastingSession(session) &&
      session.leaderUserId === normalizedUserId &&
      (hasShareableInviteCode(session) || isInviteWindowOpen(session.joinExpiresAt, nowMs)),
  );
  const hasActiveParticipantSession = sessions.some(
    (session) =>
      isActiveTastingSession(session) &&
      session.leaderUserId !== normalizedUserId &&
      isCurrentUserParticipant(session, normalizedUserId),
  );

  if (pendingInviteCount > 0) {
    return {
      hasActiveParticipantSession,
      hasLeaderInviteAction,
      indicator: { count: pendingInviteCount, kind: 'count' },
      pendingInviteCount,
    };
  }

  if (hasLeaderInviteAction || hasActiveParticipantSession) {
    return {
      hasActiveParticipantSession,
      hasLeaderInviteAction,
      indicator: { kind: 'dot' },
      pendingInviteCount,
    };
  }

  return NO_TASTING_SIGNAL;
}

export function summarizeBillOwedNotificationSignal(
  bills: readonly BillListSummary[],
): BillOwedNotificationSignalSummary {
  const activeOwedBillCount = bills.filter((bill) => bill.status !== 'settled' && bill.youOwe > 0).length;

  if (activeOwedBillCount === 0) {
    return NO_BILL_OWED_SIGNAL;
  }

  return {
    activeOwedBillCount,
    indicator: { count: activeOwedBillCount, kind: 'count' },
  };
}
