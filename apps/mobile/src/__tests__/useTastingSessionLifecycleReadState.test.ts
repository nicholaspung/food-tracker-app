import { QueryClient } from '@tanstack/react-query';

import type { TastingSessionRecord } from '../features';
import {
  applyTastingSessionMissingAccessCachePolicy,
  getTastingSessionLifecycleMissingAccessFacts,
  getTastingSessionLifecycleOnlineOnlyFacts,
  getTastingSessionLifecycleRedirectDestination,
  getTastingSessionLifecycleRoleFacts,
  getTastingSessionLifecycleStepState,
  shouldPollTastingSessionLifecycleScreen,
} from '../screens/tastingSessions/useTastingSessionLifecycleReadState';

const baseSession: TastingSessionRecord = {
  createdAt: '2026-05-20T11:00:00.000Z',
  createdByUserId: 'leader_1',
  id: 'session_1',
  inviteCode: 'ABC123',
  invites: [
    {
      createdAt: '2026-05-20T11:00:00.000Z',
      id: 'invite_1',
      invitedUserId: 'user_2',
      invitedUserName: 'Madi',
      status: 'accepted',
    },
  ],
  joinExpiresAt: '2026-05-20T12:00:00.000Z',
  joinedCount: 2,
  leaderUserId: 'leader_1',
  maxApprovedItems: 8,
  maxParticipants: 8,
  maxRestaurants: 3,
  name: 'Ramen night',
  participants: [
    {
      id: 'participant_1',
      joinedAt: '2026-05-20T11:00:00.000Z',
      name: 'Pat',
      role: 'leader',
      userId: 'leader_1',
    },
    {
      id: 'participant_2',
      joinedAt: '2026-05-20T11:05:00.000Z',
      name: 'Madi',
      role: 'participant',
      userId: 'user_2',
    },
  ],
  restaurants: [],
  status: 'lobby',
  updatedAt: '2026-05-20T11:00:00.000Z',
};

describe('tasting session lifecycle read state', () => {
  it('maps session status to lifecycle progress steps', () => {
    expect(getTastingSessionLifecycleStepState('lobby')).toMatchObject({
      currentStep: 0,
      label: 'Lobby',
      stage: 'lobby',
    });
    expect(getTastingSessionLifecycleStepState('adding_items')).toMatchObject({
      currentStep: 0,
      label: 'Lobby',
      stage: 'lobby',
    });
    expect(getTastingSessionLifecycleStepState('planning')).toMatchObject({
      currentStep: 1,
      label: 'Plan',
      stage: 'plan',
    });
    expect(getTastingSessionLifecycleStepState('tasting')).toMatchObject({
      currentStep: 2,
      label: 'Rate',
      stage: 'rate',
    });
    expect(getTastingSessionLifecycleStepState('rating')).toMatchObject({
      currentStep: 2,
      label: 'Rate',
      stage: 'rate',
    });
    expect(getTastingSessionLifecycleStepState('completed')).toMatchObject({
      currentStep: 3,
      label: 'Review',
      stage: 'review',
    });
  });

  it('keeps polling enabled for active lifecycle screens only while online', () => {
    expect(shouldPollTastingSessionLifecycleScreen('lobby', true)).toBe(true);
    expect(shouldPollTastingSessionLifecycleScreen('planning', true)).toBe(true);
    expect(shouldPollTastingSessionLifecycleScreen('tasting', true)).toBe(true);
    expect(shouldPollTastingSessionLifecycleScreen('results', true)).toBe(false);
    expect(shouldPollTastingSessionLifecycleScreen('lobby', false)).toBe(false);
    expect(shouldPollTastingSessionLifecycleScreen('lobby', true, false)).toBe(false);
  });

  it('returns redirect destinations without executing navigation', () => {
    expect(
      getTastingSessionLifecycleRedirectDestination({
        currentScreen: 'lobby',
        session: { id: 'session_1', status: 'rating' },
      }),
    ).toEqual({ name: 'TastingSessionTasting', params: { sessionId: 'session_1' } });

    expect(
      getTastingSessionLifecycleRedirectDestination({
        currentScreen: 'planning',
        session: { id: 'session_1', status: 'completed' },
      }),
    ).toEqual({ name: 'TastingSessionResults', params: { sessionId: 'session_1' } });

    expect(
      getTastingSessionLifecycleRedirectDestination({
        currentScreen: 'planning',
        session: { id: 'session_1', status: 'planning' },
      }),
    ).toBeNull();
  });

  it('derives leader and invitee facts for the current user', () => {
    expect(
      getTastingSessionLifecycleRoleFacts({
        currentUserId: 'leader_1',
        session: baseSession,
      }),
    ).toMatchObject({
      currentParticipant: baseSession.participants[0],
      isInvitee: false,
      isLeader: true,
      isParticipant: true,
    });

    expect(
      getTastingSessionLifecycleRoleFacts({
        currentUserId: 'user_2',
        session: baseSession,
      }),
    ).toMatchObject({
      currentParticipant: baseSession.participants[1],
      isInvitee: true,
      isLeader: false,
      isParticipant: true,
    });
  });

  it('represents missing access and centralizes cache removal policy', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['feature', 'tasting-sessions'], [
      baseSession,
      { ...baseSession, id: 'session_2', name: 'Pho night' },
    ]);
    queryClient.setQueryData(['feature', 'tasting-sessions', 'session_1'], baseSession);

    expect(
      getTastingSessionLifecycleMissingAccessFacts({
        isError: false,
        isLoading: false,
        session: null,
      }),
    ).toEqual({
      message: 'Your invite was revoked.',
      redirectDestination: {
        name: 'TastingSessions',
        params: {
          errorMessage: 'Your invite was revoked.',
        },
      },
      shouldHandle: true,
    });

    applyTastingSessionMissingAccessCachePolicy(queryClient, 'session_1');

    expect(queryClient.getQueryData(['feature', 'tasting-sessions'])).toEqual([
      { ...baseSession, id: 'session_2', name: 'Pho night' },
    ]);
    expect(queryClient.getQueryData(['feature', 'tasting-sessions', 'session_1'])).toBeNull();
  });

  it('returns online-only warning and disabled action facts by screen', () => {
    expect(getTastingSessionLifecycleOnlineOnlyFacts({ isOnline: true, screen: 'lobby' })).toEqual({
      actionsDisabled: false,
      isOnline: true,
      warningMessage: null,
    });
    expect(getTastingSessionLifecycleOnlineOnlyFacts({ isOnline: false, screen: 'lobby' })).toEqual({
      actionsDisabled: true,
      isOnline: false,
      warningMessage: 'Lobby actions require a connection.',
    });
    expect(getTastingSessionLifecycleOnlineOnlyFacts({ isOnline: false, screen: 'tasting' })).toEqual({
      actionsDisabled: true,
      isOnline: false,
      warningMessage: 'Rating actions require a connection.',
    });
  });
});
