import { pb } from '../../lib/pocketbase';
import type { TastingSessionRecord } from '../models';
import type { BillListSummary } from './featureStore';
import { sendApiRequest } from './pocketbaseGateway';

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

export interface MoreFeatureSignalSummary {
  bills: BillOwedNotificationSignalSummary;
  tastingSessions: TastingSessionNotificationSignalSummary;
}

interface ReadRequestOptions {
  signal?: AbortSignal;
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

function normalizeCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.floor(value));
}

function normalizeIndicator(indicator: unknown): NotificationSignalIndicator {
  if (!indicator || typeof indicator !== 'object') {
    return { kind: 'none' };
  }

  const candidate = indicator as Partial<NotificationSignalIndicator>;
  if (candidate.kind === 'dot') {
    return { kind: 'dot' };
  }

  if (candidate.kind === 'count') {
    const count = normalizeCount((candidate as { count?: unknown }).count);
    return count > 0 ? { count, kind: 'count' } : { kind: 'none' };
  }

  return { kind: 'none' };
}

function normalizeMoreFeatureSignalSummary(value: Partial<MoreFeatureSignalSummary>): MoreFeatureSignalSummary {
  const bills = value.bills ?? NO_BILL_OWED_SIGNAL;
  const tastingSessions = value.tastingSessions ?? NO_TASTING_SIGNAL;

  return {
    bills: {
      activeOwedBillCount: normalizeCount(bills.activeOwedBillCount),
      indicator: normalizeIndicator(bills.indicator),
    },
    tastingSessions: {
      hasActiveParticipantSession: tastingSessions.hasActiveParticipantSession === true,
      hasLeaderInviteAction: tastingSessions.hasLeaderInviteAction === true,
      indicator: normalizeIndicator(tastingSessions.indicator),
      pendingInviteCount: normalizeCount(tastingSessions.pendingInviteCount),
    },
  };
}

export async function getMoreFeatureSignalSummary(
  options?: ReadRequestOptions,
): Promise<MoreFeatureSignalSummary> {
  if (!pb.authStore.record?.id) {
    return {
      bills: NO_BILL_OWED_SIGNAL,
      tastingSessions: NO_TASTING_SIGNAL,
    };
  }

  const response = await sendApiRequest<Partial<MoreFeatureSignalSummary>>('/api/more/feature-signals', {
    method: 'GET',
    signal: options?.signal,
  });

  return normalizeMoreFeatureSignalSummary(response);
}
