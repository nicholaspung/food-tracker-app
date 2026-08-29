import { useCallback } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import {
  getTastingSessionById,
  getTastingSessionLifecycleById,
  removeTastingSessionFromSummariesCache,
  tastingSessionsQueryKeys,
  type TastingParticipantRecord,
  type TastingSessionRecord,
  type TastingSessionStatus,
} from '../../features';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { useConnectivity } from '../../providers/ConnectivityProvider';
import {
  TASTING_SESSION_LIFECYCLE_STEP_INDEX,
  TASTING_SESSION_LIFECYCLE_STEPS,
} from './shared';

export type TastingSessionLifecycleScreen = 'lobby' | 'planning' | 'tasting' | 'results';

export type TastingSessionLifecycleStage = 'lobby' | 'plan' | 'rate' | 'review';

export type TastingSessionLifecycleRedirectDestination =
  | { name: 'TastingSessionLobby'; params: RootStackParamList['TastingSessionLobby'] }
  | { name: 'TastingSessionPlanning'; params: RootStackParamList['TastingSessionPlanning'] }
  | { name: 'TastingSessionTasting'; params: RootStackParamList['TastingSessionTasting'] }
  | { name: 'TastingSessionResults'; params: RootStackParamList['TastingSessionResults'] }
  | { name: 'TastingSessions'; params?: RootStackParamList['TastingSessions'] };

export interface TastingSessionLifecycleStepState {
  currentStep: number;
  label: (typeof TASTING_SESSION_LIFECYCLE_STEPS)[number]['label'];
  stage: TastingSessionLifecycleStage;
}

export interface TastingSessionLifecycleRoleFacts {
  currentParticipant: TastingParticipantRecord | null;
  isInvitee: boolean;
  isLeader: boolean;
  isParticipant: boolean;
}

export interface TastingSessionLifecycleMissingAccessFacts {
  message: string;
  redirectDestination: TastingSessionLifecycleRedirectDestination;
  shouldHandle: boolean;
}

export interface TastingSessionLifecycleOnlineOnlyFacts {
  actionsDisabled: boolean;
  isOnline: boolean;
  warningMessage: string | null;
}

const ACTIVE_LIFECYCLE_SCREENS = new Set<TastingSessionLifecycleScreen>([
  'lobby',
  'planning',
  'tasting',
]);

const TASTING_SESSION_LIFECYCLE_REFETCH_INTERVAL_MS = 3000;

export function shouldPollTastingSessionLifecycleScreen(
  screen: TastingSessionLifecycleScreen,
  isOnline: boolean,
  isFocused = true,
): boolean {
  return isOnline && isFocused && ACTIVE_LIFECYCLE_SCREENS.has(screen);
}

export function getTastingSessionLifecycleStepState(
  status: TastingSessionStatus | undefined,
): TastingSessionLifecycleStepState {
  switch (status) {
    case 'planning':
      return {
        currentStep: TASTING_SESSION_LIFECYCLE_STEP_INDEX.plan,
        label: TASTING_SESSION_LIFECYCLE_STEPS[TASTING_SESSION_LIFECYCLE_STEP_INDEX.plan].label,
        stage: 'plan',
      };
    case 'tasting':
    case 'rating':
      return {
        currentStep: TASTING_SESSION_LIFECYCLE_STEP_INDEX.rate,
        label: TASTING_SESSION_LIFECYCLE_STEPS[TASTING_SESSION_LIFECYCLE_STEP_INDEX.rate].label,
        stage: 'rate',
      };
    case 'completed':
      return {
        currentStep: TASTING_SESSION_LIFECYCLE_STEP_INDEX.review,
        label: TASTING_SESSION_LIFECYCLE_STEPS[TASTING_SESSION_LIFECYCLE_STEP_INDEX.review].label,
        stage: 'review',
      };
    case 'lobby':
    case 'adding_items':
    default:
      return {
        currentStep: TASTING_SESSION_LIFECYCLE_STEP_INDEX.lobby,
        label: TASTING_SESSION_LIFECYCLE_STEPS[TASTING_SESSION_LIFECYCLE_STEP_INDEX.lobby].label,
        stage: 'lobby',
      };
  }
}

function destinationForStatus(
  sessionId: string,
  status: TastingSessionStatus,
): TastingSessionLifecycleRedirectDestination {
  if (status === 'lobby' || status === 'adding_items') {
    return { name: 'TastingSessionLobby', params: { sessionId } };
  }
  if (status === 'planning') {
    return { name: 'TastingSessionPlanning', params: { sessionId } };
  }
  if (status === 'tasting' || status === 'rating') {
    return { name: 'TastingSessionTasting', params: { sessionId } };
  }
  return { name: 'TastingSessionResults', params: { sessionId } };
}

export function getTastingSessionLifecycleRedirectDestination(input: {
  currentScreen: TastingSessionLifecycleScreen;
  session: Pick<TastingSessionRecord, 'id' | 'status'> | null | undefined;
}): TastingSessionLifecycleRedirectDestination | null {
  const { currentScreen, session } = input;
  if (!session) {
    return null;
  }

  const destination = destinationForStatus(session.id, session.status);
  if (currentScreen === 'lobby' && destination.name !== 'TastingSessionLobby') {
    return destination;
  }
  if (
    currentScreen === 'planning' &&
    (destination.name === 'TastingSessionTasting' || destination.name === 'TastingSessionResults')
  ) {
    return destination;
  }
  if (currentScreen === 'tasting' && destination.name === 'TastingSessionResults') {
    return destination;
  }
  return null;
}

export function getTastingSessionLifecycleRoleFacts(input: {
  currentUserId: string | undefined;
  session: Pick<TastingSessionRecord, 'leaderUserId' | 'participants' | 'invites'> | null | undefined;
}): TastingSessionLifecycleRoleFacts {
  const { currentUserId, session } = input;
  const currentParticipant =
    session?.participants.find((participant) => participant.userId === currentUserId) ?? null;

  return {
    currentParticipant,
    isInvitee: Boolean(
      session?.invites.some((invite) => invite.invitedUserId === currentUserId && invite.status === 'accepted'),
    ),
    isLeader: Boolean(session && currentUserId === session.leaderUserId),
    isParticipant: Boolean(currentParticipant),
  };
}

export function getTastingSessionLifecycleMissingAccessFacts(input: {
  isError: boolean;
  isLoading: boolean;
  session: TastingSessionRecord | null | undefined;
}): TastingSessionLifecycleMissingAccessFacts {
  const shouldHandle = !input.session && !input.isLoading && !input.isError;

  return {
    message: 'Your invite was revoked.',
    redirectDestination: {
      name: 'TastingSessions',
      params: {
        errorMessage: 'Your invite was revoked.',
      },
    },
    shouldHandle,
  };
}

export function applyTastingSessionMissingAccessCachePolicy(
  queryClient: QueryClient,
  sessionId: string,
): void {
  removeTastingSessionFromSummariesCache(queryClient, sessionId);
  queryClient.setQueryData(tastingSessionsQueryKeys.detail(sessionId), null);
  void queryClient.invalidateQueries({ queryKey: tastingSessionsQueryKeys.summariesRoot });
}

export function getTastingSessionLifecycleOnlineOnlyFacts(input: {
  isOnline: boolean;
  screen: TastingSessionLifecycleScreen;
}): TastingSessionLifecycleOnlineOnlyFacts {
  if (input.isOnline) {
    return {
      actionsDisabled: false,
      isOnline: true,
      warningMessage: null,
    };
  }

  const warningMessageByScreen: Record<TastingSessionLifecycleScreen, string | null> = {
    lobby: 'Lobby actions require a connection.',
    planning: 'Planning actions require a connection.',
    results: null,
    tasting: 'Rating actions require a connection.',
  };

  return {
    actionsDisabled: true,
    isOnline: false,
    warningMessage: warningMessageByScreen[input.screen],
  };
}

export function useTastingSessionLifecycleReadState(input: {
  currentUserId: string | undefined;
  screen: TastingSessionLifecycleScreen;
  sessionId: string;
}) {
  const { isOnline } = useConnectivity();
  const isFocused = useIsFocused();
  const queryClient = useQueryClient();
  const shouldPoll = shouldPollTastingSessionLifecycleScreen(input.screen, isOnline, isFocused);
  const detailQueryKey = tastingSessionsQueryKeys.detail(input.sessionId);
  const sessionQuery = useQuery({
    queryKey: detailQueryKey,
    queryFn: ({ signal }) => {
      if (input.screen === 'results') {
        return getTastingSessionById(input.sessionId, { signal });
      }
      return getTastingSessionLifecycleById(
        input.sessionId,
        input.screen,
        queryClient.getQueryData<TastingSessionRecord | null>(detailQueryKey),
        { signal },
      );
    },
    refetchInterval: (query) =>
      shouldPoll && query.state.data ? TASTING_SESSION_LIFECYCLE_REFETCH_INTERVAL_MS : false,
    refetchOnMount: 'always',
    refetchOnReconnect: 'always',
    staleTime: 0,
  });
  const session = sessionQuery.data;
  const missingAccess = getTastingSessionLifecycleMissingAccessFacts({
    isError: sessionQuery.isError,
    isLoading: sessionQuery.isLoading,
    session,
  });
  const applyMissingAccessPolicy = useCallback(() => {
    applyTastingSessionMissingAccessCachePolicy(queryClient, input.sessionId);
  }, [input.sessionId, queryClient]);

  return {
    applyMissingAccessPolicy,
    missingAccess,
    onlineOnly: getTastingSessionLifecycleOnlineOnlyFacts({
      isOnline,
      screen: input.screen,
    }),
    query: sessionQuery,
    redirectDestination: getTastingSessionLifecycleRedirectDestination({
      currentScreen: input.screen,
      session,
    }),
    roles: getTastingSessionLifecycleRoleFacts({
      currentUserId: input.currentUserId,
      session,
    }),
    shouldPoll,
    step: getTastingSessionLifecycleStepState(session?.status),
  };
}
