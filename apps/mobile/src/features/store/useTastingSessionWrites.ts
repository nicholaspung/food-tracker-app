import { useCallback, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import type { TastingSessionRecord } from '../models';
import type {
  CreateTastingSessionInput,
  JoinTastingSessionInput,
  ReopenTastingInviteWindowInput,
} from './featureStore';
import type { OfflineOutboxFeatureWriteOptions } from './useOfflineAwareFeatureWrite';
import type { FeatureOutboxOperationName } from './featureOutboxOperations';
import {
  blockedTastingSessionLifecycleWrite,
  createTastingSessionLifecycleWriteActions,
  TASTING_SESSION_LIFECYCLE_BLOCKED_MESSAGES,
  type TastingSessionLifecycleWriteResult,
} from './useTastingSessionLifecycleWrites';

interface OnlineOnlyTastingWriteInput {
  isOnline: boolean;
}

interface TastingSessionIdInput extends OnlineOnlyTastingWriteInput {
  sessionId: string;
}

interface RemoveTastingParticipantInput extends TastingSessionIdInput {
  participantId: string;
}

interface ResendTastingInviteInput extends TastingSessionIdInput {
  inviteId: string;
}

interface ReopenTastingInviteWindowWriteInput extends TastingSessionIdInput, ReopenTastingInviteWindowInput {}

type TastingSessionWriteResult<T> = Exclude<
  TastingSessionLifecycleWriteResult<T>,
  { status: 'queued' }
>;

async function executeReplaySafeWriteOnline<TName extends FeatureOutboxOperationName, TResult>(
  options: OfflineOutboxFeatureWriteOptions<TName, TResult>,
): Promise<{ result: TResult; status: 'completed' }> {
  return {
    result: await options.execute(),
    status: 'completed',
  };
}

function asCompatibilityResult<T>(
  result: Promise<TastingSessionLifecycleWriteResult<T>>,
): Promise<TastingSessionWriteResult<T>> {
  return result as Promise<TastingSessionWriteResult<T>>;
}

function blockedCompatibilityResult<T>(message: string): TastingSessionWriteResult<T> {
  return blockedTastingSessionLifecycleWrite(message) as TastingSessionWriteResult<T>;
}

export function useTastingSessionWrites() {
  const queryClient = useQueryClient();
  const uploadedPhotoKeysRef = useRef<Set<string>>(new Set());

  const createActions = useCallback(
    (isOnline: boolean) =>
      createTastingSessionLifecycleWriteActions({
        isOnline,
        queryClient,
        uploadedPhotoKeysRef,
        writeReplaySafe: executeReplaySafeWriteOnline,
      }),
    [queryClient],
  );

  const blockIfOffline = useCallback(
    <T>(isOnline: boolean, message: string): TastingSessionWriteResult<T> | null =>
      isOnline ? null : blockedCompatibilityResult(message),
    [],
  );

  return useMemo(
    () => ({
      acceptInvite: ({
        isOnline,
        sessionId,
      }: TastingSessionIdInput): Promise<TastingSessionWriteResult<TastingSessionRecord>> => {
        const blocked = blockIfOffline<TastingSessionRecord>(
          isOnline,
          TASTING_SESSION_LIFECYCLE_BLOCKED_MESSAGES.acceptInvite,
        );
        return blocked
          ? Promise.resolve(blocked)
          : asCompatibilityResult(createActions(isOnline).acceptInvite({ sessionId }));
      },
      createSession: (
        input: CreateTastingSessionInput & OnlineOnlyTastingWriteInput,
      ): Promise<TastingSessionWriteResult<TastingSessionRecord>> => {
        const blocked = blockIfOffline<TastingSessionRecord>(
          input.isOnline,
          TASTING_SESSION_LIFECYCLE_BLOCKED_MESSAGES.createSession,
        );
        return blocked
          ? Promise.resolve(blocked)
          : asCompatibilityResult(createActions(input.isOnline).createSession(input));
      },
      deleteSession: ({
        isOnline,
        sessionId,
      }: TastingSessionIdInput): Promise<TastingSessionWriteResult<{ success: boolean }>> => {
        const blocked = blockIfOffline<{ success: boolean }>(
          isOnline,
          TASTING_SESSION_LIFECYCLE_BLOCKED_MESSAGES.deleteSession,
        );
        return blocked
          ? Promise.resolve(blocked)
          : asCompatibilityResult(createActions(isOnline).deleteSession({ sessionId }));
      },
      dismissInvite: ({
        isOnline,
        sessionId,
      }: TastingSessionIdInput): Promise<TastingSessionWriteResult<{ success: boolean }>> => {
        const blocked = blockIfOffline<{ success: boolean }>(
          isOnline,
          TASTING_SESSION_LIFECYCLE_BLOCKED_MESSAGES.dismissInvite,
        );
        return blocked
          ? Promise.resolve(blocked)
          : asCompatibilityResult(createActions(isOnline).dismissInvite({ sessionId }));
      },
      joinSession: (
        input: JoinTastingSessionInput & OnlineOnlyTastingWriteInput,
      ): Promise<TastingSessionWriteResult<TastingSessionRecord>> => {
        const blocked = blockIfOffline<TastingSessionRecord>(
          input.isOnline,
          TASTING_SESSION_LIFECYCLE_BLOCKED_MESSAGES.joinSession,
        );
        return blocked
          ? Promise.resolve(blocked)
          : asCompatibilityResult(createActions(input.isOnline).joinSession(input));
      },
      leaveSession: ({
        isOnline,
        sessionId,
      }: TastingSessionIdInput): Promise<TastingSessionWriteResult<{ success: boolean }>> => {
        const blocked = blockIfOffline<{ success: boolean }>(
          isOnline,
          TASTING_SESSION_LIFECYCLE_BLOCKED_MESSAGES.leaveSession,
        );
        return blocked
          ? Promise.resolve(blocked)
          : asCompatibilityResult(createActions(isOnline).leaveSession({ sessionId }));
      },
      lockLobby: ({
        isOnline,
        sessionId,
      }: TastingSessionIdInput): Promise<TastingSessionWriteResult<TastingSessionRecord>> => {
        const blocked = blockIfOffline<TastingSessionRecord>(
          isOnline,
          TASTING_SESSION_LIFECYCLE_BLOCKED_MESSAGES.lockLobby,
        );
        return blocked
          ? Promise.resolve(blocked)
          : asCompatibilityResult(createActions(isOnline).lockLobby({ sessionId }));
      },
      removeParticipant: ({
        isOnline,
        participantId,
        sessionId,
      }: RemoveTastingParticipantInput): Promise<TastingSessionWriteResult<TastingSessionRecord>> => {
        const blocked = blockIfOffline<TastingSessionRecord>(
          isOnline,
          TASTING_SESSION_LIFECYCLE_BLOCKED_MESSAGES.removeParticipant,
        );
        return blocked
          ? Promise.resolve(blocked)
          : asCompatibilityResult(createActions(isOnline).removeParticipant({ participantId, sessionId }));
      },
      reopenInviteWindow: ({
        isOnline,
        joinDurationMinutes,
        sessionId,
      }: ReopenTastingInviteWindowWriteInput): Promise<TastingSessionWriteResult<TastingSessionRecord>> => {
        const blocked = blockIfOffline<TastingSessionRecord>(
          isOnline,
          TASTING_SESSION_LIFECYCLE_BLOCKED_MESSAGES.reopenInviteWindow,
        );
        return blocked
          ? Promise.resolve(blocked)
          : asCompatibilityResult(createActions(isOnline).reopenInviteWindow({ joinDurationMinutes, sessionId }));
      },
      resendInvite: ({
        inviteId,
        isOnline,
        sessionId,
      }: ResendTastingInviteInput): Promise<TastingSessionWriteResult<TastingSessionRecord>> => {
        const blocked = blockIfOffline<TastingSessionRecord>(
          isOnline,
          TASTING_SESSION_LIFECYCLE_BLOCKED_MESSAGES.resendInvite,
        );
        return blocked
          ? Promise.resolve(blocked)
          : asCompatibilityResult(createActions(isOnline).resendInvite({ inviteId, sessionId }));
      },
    }),
    [blockIfOffline, createActions],
  );
}

export type TastingSessionWrites = ReturnType<typeof useTastingSessionWrites>;
