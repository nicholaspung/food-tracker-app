import { useCallback } from 'react';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';

import type { TastingSessionRecord } from '../models';
import type {
  CreateTastingSessionInput,
  JoinTastingSessionInput,
  ReopenTastingInviteWindowInput,
} from './featureStore';
import {
  acceptTastingInvite,
  createTastingSession,
  deleteTastingSession,
  dismissTastingInvite,
  joinTastingSession,
  kickTastingParticipant,
  leaveTastingSession,
  lockTastingSessionMembership,
  reopenTastingInviteWindow,
  resendTastingInvite,
} from './tastingSessionsApiStore';
import { moreFeatureSignalQueryKeys } from './moreFeatureSignalsQuery';
import { tastingSessionsQueryKeys } from './tastingSessionsQuery';

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

type TastingSessionWriteResult<T> =
  | {
      result: T;
      status: 'completed';
    }
  | {
      message: string;
      status: 'blocked';
    };

async function invalidateTastingSessionList(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: tastingSessionsQueryKeys.root }),
    queryClient.invalidateQueries({ queryKey: moreFeatureSignalQueryKeys.summary }),
  ]);
}

async function invalidateTastingSessionDetail(
  queryClient: QueryClient,
  sessionId: string,
): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: tastingSessionsQueryKeys.detail(sessionId) });
}

async function invalidateTastingSessionLifecycleQueries(
  queryClient: QueryClient,
  sessionId: string,
): Promise<void> {
  await Promise.all([
    invalidateTastingSessionList(queryClient),
    invalidateTastingSessionDetail(queryClient, sessionId),
  ]);
}

async function removeDeletedTastingSessionFromCache(
  queryClient: QueryClient,
  sessionId: string,
): Promise<void> {
  await queryClient.cancelQueries({ queryKey: tastingSessionsQueryKeys.detail(sessionId) });
  queryClient.setQueryData<TastingSessionRecord[] | undefined>(
    tastingSessionsQueryKeys.root,
    (cachedSessions) => cachedSessions?.filter((session) => session.id !== sessionId),
  );
  queryClient.setQueryData(tastingSessionsQueryKeys.detail(sessionId), null);
  await invalidateTastingSessionList(queryClient);
}

function blocked(message: string): TastingSessionWriteResult<never> {
  return {
    message,
    status: 'blocked',
  };
}

export function useTastingSessionWrites() {
  const queryClient = useQueryClient();

  const createSession = useCallback(
    async (
      input: CreateTastingSessionInput & OnlineOnlyTastingWriteInput,
    ): Promise<TastingSessionWriteResult<TastingSessionRecord>> => {
      if (!input.isOnline) {
        return blocked('Connect to the internet to create a group tasting.');
      }

      const session = await createTastingSession({
        invitedUserIds: input.invitedUserIds,
        joinDurationMinutes: input.joinDurationMinutes,
        name: input.name,
      });
      await invalidateTastingSessionList(queryClient);
      return {
        result: session,
        status: 'completed',
      };
    },
    [queryClient],
  );

  const joinSession = useCallback(
    async (
      input: JoinTastingSessionInput & OnlineOnlyTastingWriteInput,
    ): Promise<TastingSessionWriteResult<TastingSessionRecord>> => {
      if (!input.isOnline) {
        return blocked('Connect to the internet to join a group tasting.');
      }

      const session = await joinTastingSession({ inviteCode: input.inviteCode });
      await invalidateTastingSessionList(queryClient);
      return {
        result: session,
        status: 'completed',
      };
    },
    [queryClient],
  );

  const acceptInvite = useCallback(
    async ({
      isOnline,
      sessionId,
    }: TastingSessionIdInput): Promise<TastingSessionWriteResult<TastingSessionRecord>> => {
      if (!isOnline) {
        return blocked('Connect to the internet to join a tasting session.');
      }

      const session = await acceptTastingInvite(sessionId);
      await invalidateTastingSessionList(queryClient);
      return {
        result: session,
        status: 'completed',
      };
    },
    [queryClient],
  );

  const dismissInvite = useCallback(
    async ({
      isOnline,
      sessionId,
    }: TastingSessionIdInput): Promise<TastingSessionWriteResult<{ success: boolean }>> => {
      if (!isOnline) {
        return blocked('Connect to the internet to dismiss this invite.');
      }

      const result = await dismissTastingInvite(sessionId);
      await invalidateTastingSessionList(queryClient);
      return {
        result,
        status: 'completed',
      };
    },
    [queryClient],
  );

  const deleteSession = useCallback(
    async ({
      isOnline,
      sessionId,
    }: TastingSessionIdInput): Promise<TastingSessionWriteResult<{ success: boolean }>> => {
      if (!isOnline) {
        return blocked('Connect to the internet to delete this tasting session.');
      }

      const result = await deleteTastingSession(sessionId);
      await removeDeletedTastingSessionFromCache(queryClient, sessionId);
      return {
        result,
        status: 'completed',
      };
    },
    [queryClient],
  );

  const leaveSession = useCallback(
    async ({
      isOnline,
      sessionId,
    }: TastingSessionIdInput): Promise<TastingSessionWriteResult<{ success: boolean }>> => {
      if (!isOnline) {
        return blocked('Connect to the internet to leave this tasting session.');
      }

      const result = await leaveTastingSession(sessionId);
      await removeDeletedTastingSessionFromCache(queryClient, sessionId);
      return {
        result,
        status: 'completed',
      };
    },
    [queryClient],
  );

  const resendInvite = useCallback(
    async ({
      inviteId,
      isOnline,
      sessionId,
    }: ResendTastingInviteInput): Promise<TastingSessionWriteResult<TastingSessionRecord>> => {
      if (!isOnline) {
        return blocked('Connect to the internet to resend this invite.');
      }

      const session = await resendTastingInvite(sessionId, inviteId);
      await invalidateTastingSessionLifecycleQueries(queryClient, sessionId);
      return {
        result: session,
        status: 'completed',
      };
    },
    [queryClient],
  );

  const reopenInviteWindow = useCallback(
    async ({
      isOnline,
      joinDurationMinutes,
      sessionId,
    }: ReopenTastingInviteWindowWriteInput): Promise<TastingSessionWriteResult<TastingSessionRecord>> => {
      if (!isOnline) {
        return blocked('Connect to the internet to reopen the invite window.');
      }

      const session = await reopenTastingInviteWindow(sessionId, { joinDurationMinutes });
      await invalidateTastingSessionLifecycleQueries(queryClient, sessionId);
      return {
        result: session,
        status: 'completed',
      };
    },
    [queryClient],
  );

  const lockLobby = useCallback(
    async ({
      isOnline,
      sessionId,
    }: TastingSessionIdInput): Promise<TastingSessionWriteResult<TastingSessionRecord>> => {
      if (!isOnline) {
        return blocked('Connect to the internet to lock the group.');
      }

      const session = await lockTastingSessionMembership(sessionId);
      await invalidateTastingSessionLifecycleQueries(queryClient, sessionId);
      return {
        result: session,
        status: 'completed',
      };
    },
    [queryClient],
  );

  const removeParticipant = useCallback(
    async ({
      isOnline,
      participantId,
      sessionId,
    }: RemoveTastingParticipantInput): Promise<TastingSessionWriteResult<TastingSessionRecord>> => {
      if (!isOnline) {
        return blocked('Connect to the internet to remove a participant.');
      }

      const session = await kickTastingParticipant(sessionId, participantId);
      await invalidateTastingSessionLifecycleQueries(queryClient, sessionId);
      return {
        result: session,
        status: 'completed',
      };
    },
    [queryClient],
  );

  return {
    acceptInvite,
    createSession,
    deleteSession,
    dismissInvite,
    joinSession,
    leaveSession,
    lockLobby,
    reopenInviteWindow,
    removeParticipant,
    resendInvite,
  };
}

export type TastingSessionWrites = ReturnType<typeof useTastingSessionWrites>;
