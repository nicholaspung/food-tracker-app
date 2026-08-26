import {
  completeTastingSession,
  createTastingSession,
  deleteTastingSession,
  joinTastingSession,
  leaveTastingSession,
  lockTastingSessionMembership,
  setTastingMenuItemSuggestionStatus,
  setTastingRestaurantSuggestionStatus,
  startTastingSession,
  submitTastingRatings,
  suggestTastingMenuItem,
  suggestTastingRestaurant,
} from '../features/store/tastingSessionsApiStore';
import type {
  TastingMenuItemRecord,
  TastingRestaurantRecord,
  TastingSessionRecord,
} from '../features/models';
import {
  createTastingSessionLifecycleWriteActions,
  resolvePendingTastingSessionCreateState,
  resolvePendingTastingSessionJoinState,
  resolvePendingTastingSessionStatusState,
  TASTING_SESSION_LIFECYCLE_BLOCKED_MESSAGES,
} from '../features/store/useTastingSessionLifecycleWrites';
import type { QueuedFeatureWrite } from '../features/store/queuedFeatureWrites';
import { tastingSessionsQueryKeys } from '../features/store/tastingSessionsQuery';
import { uploadVisitPhotos } from '../features/store/visitPhotoUploads';

jest.mock('../features/store/tastingSessionsApiStore', () => ({
  acceptTastingInvite: jest.fn(),
  completeTastingSession: jest.fn(),
  createTastingSession: jest.fn(),
  deleteTastingSession: jest.fn(),
  dismissTastingInvite: jest.fn(),
  joinTastingSession: jest.fn(),
  kickTastingParticipant: jest.fn(),
  leaveTastingSession: jest.fn(),
  lockTastingSessionMembership: jest.fn(),
  reopenTastingInviteWindow: jest.fn(),
  resendTastingInvite: jest.fn(),
  setTastingMenuItemSuggestionStatus: jest.fn(),
  setTastingRestaurantSuggestionStatus: jest.fn(),
  startTastingSession: jest.fn(),
  submitTastingRatings: jest.fn(),
  suggestTastingMenuItem: jest.fn(),
  suggestTastingRestaurant: jest.fn(),
}));

jest.mock('../features/store/visitPhotoUploads', () => ({
  uploadVisitPhotos: jest.fn(),
}));

const mockedCompleteTastingSession = completeTastingSession as jest.MockedFunction<typeof completeTastingSession>;
const mockedCreateTastingSession = createTastingSession as jest.MockedFunction<typeof createTastingSession>;
const mockedDeleteTastingSession = deleteTastingSession as jest.MockedFunction<typeof deleteTastingSession>;
const mockedJoinTastingSession = joinTastingSession as jest.MockedFunction<typeof joinTastingSession>;
const mockedLeaveTastingSession = leaveTastingSession as jest.MockedFunction<typeof leaveTastingSession>;
const mockedLockTastingSessionMembership =
  lockTastingSessionMembership as jest.MockedFunction<typeof lockTastingSessionMembership>;
const mockedSetTastingMenuItemSuggestionStatus =
  setTastingMenuItemSuggestionStatus as jest.MockedFunction<typeof setTastingMenuItemSuggestionStatus>;
const mockedSetTastingRestaurantSuggestionStatus =
  setTastingRestaurantSuggestionStatus as jest.MockedFunction<
    typeof setTastingRestaurantSuggestionStatus
  >;
const mockedStartTastingSession = startTastingSession as jest.MockedFunction<typeof startTastingSession>;
const mockedSubmitTastingRatings = submitTastingRatings as jest.MockedFunction<typeof submitTastingRatings>;
const mockedSuggestTastingMenuItem =
  suggestTastingMenuItem as jest.MockedFunction<typeof suggestTastingMenuItem>;
const mockedSuggestTastingRestaurant =
  suggestTastingRestaurant as jest.MockedFunction<typeof suggestTastingRestaurant>;
const mockedUploadVisitPhotos = uploadVisitPhotos as jest.MockedFunction<typeof uploadVisitPhotos>;

const tastingSession: TastingSessionRecord = {
  createdAt: '2026-05-20T00:00:00.000Z',
  id: 'session_1',
  invites: [],
  joinExpiresAt: '2026-05-20T01:00:00.000Z',
  joinedCount: 1,
  leaderUserId: 'user_1',
  maxApprovedItems: 8,
  maxParticipants: 8,
  maxRestaurants: 3,
  name: 'Ramen night',
  participants: [],
  restaurants: [],
  status: 'planning',
  updatedAt: '2026-05-20T00:00:00.000Z',
};

const baseItem: TastingMenuItemRecord = {
  createdAt: '2026-05-20T00:00:00.000Z',
  id: 'item_1',
  menuItemId: 'menu_item_1',
  name: 'Shoyu Ramen',
  ratings: [],
  restaurantSuggestionId: 'restaurant_1',
  status: 'approved',
  suggestedByParticipantId: 'participant_1',
};

const approvedRestaurants: TastingRestaurantRecord[] = [
  {
    createdAt: '2026-05-20T00:00:00.000Z',
    id: 'restaurant_1',
    items: [baseItem],
    restaurantId: 'restaurant_record_1',
    restaurantName: 'Corner Ramen',
    status: 'approved',
    suggestedByParticipantId: 'participant_1',
  },
];

const submittedSession: TastingSessionRecord = {
  ...tastingSession,
  restaurants: [
    {
      ...approvedRestaurants[0],
      items: [
        {
          ...baseItem,
          ratings: [
            {
              createdAt: '2026-05-20T00:10:00.000Z',
              generatedFoodItemId: 'food_item_1',
              generatedVisitId: 'visit_1',
              id: 'rating_1',
              note: 'Nice',
              participantId: 'participant_1',
              rating: 4,
              updatedAt: '2026-05-20T00:10:00.000Z',
              userId: 'user_1',
            },
          ],
        },
      ],
    },
  ],
  status: 'tasting',
};

describe('createTastingSessionLifecycleWriteActions', () => {
  const queryClient = {
    cancelQueries: jest.fn(),
    invalidateQueries: jest.fn(),
    setQueryData: jest.fn(),
  };
  const uploadedPhotoKeysRef = { current: new Set<string>() };
  const writeReplaySafe = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    uploadedPhotoKeysRef.current = new Set();
    queryClient.cancelQueries.mockResolvedValue(undefined);
    queryClient.invalidateQueries.mockResolvedValue(undefined);
    mockedCompleteTastingSession.mockResolvedValue({ ...tastingSession, status: 'completed' } as never);
    mockedCreateTastingSession.mockResolvedValue(tastingSession as never);
    mockedDeleteTastingSession.mockResolvedValue({ success: true });
    mockedJoinTastingSession.mockResolvedValue(tastingSession as never);
    mockedLeaveTastingSession.mockResolvedValue({ success: true });
    mockedLockTastingSessionMembership.mockResolvedValue({ ...tastingSession, status: 'planning' } as never);
    mockedSetTastingMenuItemSuggestionStatus.mockResolvedValue(tastingSession as never);
    mockedSetTastingRestaurantSuggestionStatus.mockResolvedValue(tastingSession as never);
    mockedStartTastingSession.mockResolvedValue({ ...tastingSession, status: 'tasting' } as never);
    mockedSubmitTastingRatings.mockResolvedValue(submittedSession);
    mockedSuggestTastingMenuItem.mockResolvedValue(tastingSession as never);
    mockedSuggestTastingRestaurant.mockResolvedValue(tastingSession as never);
    mockedUploadVisitPhotos.mockResolvedValue(undefined);
    writeReplaySafe.mockImplementation(async (options) => ({
      result: await options.execute(),
      status: 'completed',
    }));
  });

  function createActions(isOnline = true) {
    return createTastingSessionLifecycleWriteActions({
      isOnline,
      queryClient: queryClient as never,
      uploadedPhotoKeysRef,
      writeReplaySafe,
    });
  }

  it('routes replay-safe lifecycle transitions through one outbox seam', async () => {
    const actions = createActions();

    await actions.createSession({
      invitedUserIds: ['friend_1'],
      joinDurationMinutes: 60,
      name: 'Ramen night',
    });
    await actions.joinSession({ inviteCode: 'ABC123' });
    await actions.lockLobby({ sessionId: 'session_1' });
    await actions.startTasting({ sessionId: 'session_1' });
    await actions.completeTasting({ sessionId: 'session_1' });

    expect(writeReplaySafe).toHaveBeenCalledWith(expect.objectContaining({
      offline: {
        payload: {
          invitedUserIds: ['friend_1'],
          joinDurationMinutes: 60,
          name: 'Ramen night',
        },
        strategy: 'outbox',
      },
      operationName: 'tasting-session.create',
    }));
    expect(writeReplaySafe).toHaveBeenCalledWith(expect.objectContaining({
      offline: {
        payload: { inviteCode: 'ABC123' },
        strategy: 'outbox',
      },
      operationName: 'tasting-session.join',
    }));
    expect(writeReplaySafe).toHaveBeenCalledWith(expect.objectContaining({
      offline: {
        payload: {
          sessionId: 'session_1',
          status: 'planning',
        },
        strategy: 'outbox',
      },
      operationName: 'tasting-session.status.update',
    }));
    expect(writeReplaySafe).toHaveBeenCalledWith(expect.objectContaining({
      offline: {
        payload: {
          sessionId: 'session_1',
          status: 'tasting',
        },
        strategy: 'outbox',
      },
      operationName: 'tasting-session.status.update',
    }));
    expect(writeReplaySafe).toHaveBeenCalledWith(expect.objectContaining({
      offline: {
        payload: {
          sessionId: 'session_1',
          status: 'completed',
        },
        strategy: 'outbox',
      },
      operationName: 'tasting-session.status.update',
    }));
    expect(mockedCreateTastingSession).toHaveBeenCalledWith({
      invitedUserIds: ['friend_1'],
      joinDurationMinutes: 60,
      name: 'Ramen night',
    });
    expect(mockedJoinTastingSession).toHaveBeenCalledWith({ inviteCode: 'ABC123' });
    expect(mockedLockTastingSessionMembership).toHaveBeenCalledWith('session_1');
    expect(mockedStartTastingSession).toHaveBeenCalledWith('session_1');
    expect(mockedCompleteTastingSession).toHaveBeenCalledWith('session_1');
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: tastingSessionsQueryKeys.detail('session_1'),
    });
  });

  it('routes Tasting Plan verbs through the lifecycle interface', async () => {
    const actions = createActions();

    await actions.addRestaurant({
      restaurant: { id: 'restaurant_record_1', name: 'Corner Ramen' },
      sessionId: 'session_1',
    });
    await actions.removeRestaurant({
      restaurantSuggestionId: 'restaurant_1',
      sessionId: 'session_1',
    });
    await actions.addMenuItem({
      menuItem: { id: 'menu_item_1', name: 'Shoyu Ramen' },
      restaurantSuggestionId: 'restaurant_1',
      sessionId: 'session_1',
    });
    await actions.addMenuItem({
      existingSuggestionId: 'item_1',
      menuItem: { id: 'menu_item_1', name: 'Shoyu Ramen' },
      restaurantSuggestionId: 'restaurant_1',
      sessionId: 'session_1',
    });
    await actions.removeMenuItem({
      itemSuggestionId: 'item_1',
      sessionId: 'session_1',
    });

    expect(mockedSuggestTastingRestaurant).toHaveBeenCalledWith('session_1', {
      restaurantId: 'restaurant_record_1',
      restaurantName: 'Corner Ramen',
    });
    expect(mockedSetTastingRestaurantSuggestionStatus).toHaveBeenCalledWith(
      'session_1',
      'restaurant_1',
      'rejected',
    );
    expect(mockedSuggestTastingMenuItem).toHaveBeenCalledWith(
      'session_1',
      'restaurant_1',
      {
        menuItemId: 'menu_item_1',
        name: 'Shoyu Ramen',
      },
    );
    expect(mockedSetTastingMenuItemSuggestionStatus).toHaveBeenCalledWith(
      'session_1',
      'item_1',
      'approved',
    );
    expect(mockedSetTastingMenuItemSuggestionStatus).toHaveBeenCalledWith(
      'session_1',
      'item_1',
      'rejected',
    );
  });

  it('submits rating drafts and avoids duplicate generated Visit photo uploads', async () => {
    const actions = createActions();
    const draftByItemId = {
      item_1: {
        included: true,
        note: ' Nice ',
        photos: [
          {
            id: 'photo_1',
            labelDate: 'Today',
            thumbnailUri: 'file://photo.jpg',
            upload: {
              mimeType: 'image/jpeg',
              name: 'photo.jpg',
              uri: 'file://photo.jpg',
            },
            viewerUri: 'file://photo.jpg',
          },
        ],
        rating: 4,
      },
    };

    await actions.submitRatingDraft({
      approvedRestaurants,
      currentUserId: 'user_1',
      draftByItemId,
      sessionId: 'session_1',
    });
    await actions.submitRatingDraft({
      approvedRestaurants,
      currentUserId: 'user_1',
      draftByItemId,
      sessionId: 'session_1',
    });

    expect(mockedSubmitTastingRatings).toHaveBeenCalledWith('session_1', {
      restaurants: [
        {
          items: [{ itemId: 'item_1', note: 'Nice', rating: 4 }],
          restaurantSuggestionId: 'restaurant_1',
        },
      ],
    });
    expect(mockedUploadVisitPhotos).toHaveBeenCalledTimes(1);
    expect(mockedUploadVisitPhotos).toHaveBeenCalledWith(
      'visit_1',
      'food_item_1',
      'user_1',
      [
        {
          mimeType: 'image/jpeg',
          name: 'photo.jpg',
          uri: 'file://photo.jpg',
        },
      ],
    );
  });

  it('returns queued for every replay-safe lifecycle write without running API or cache effects', async () => {
    writeReplaySafe.mockResolvedValue({ status: 'queued' });
    const actions = createActions(false);

    const results = await Promise.all([
      actions.createSession({
        invitedUserIds: [],
        joinDurationMinutes: 60,
        name: 'Offline tasting',
      }),
      actions.joinSession({ inviteCode: 'ABC123' }),
      actions.lockLobby({ sessionId: 'session_1' }),
      actions.startTasting({ sessionId: 'session_1' }),
      actions.completeTasting({ sessionId: 'session_1' }),
    ]);

    expect(results).toEqual(Array.from({ length: 5 }, () => ({ status: 'queued' })));
    expect(mockedCreateTastingSession).not.toHaveBeenCalled();
    expect(mockedJoinTastingSession).not.toHaveBeenCalled();
    expect(mockedLockTastingSessionMembership).not.toHaveBeenCalled();
    expect(mockedStartTastingSession).not.toHaveBeenCalled();
    expect(mockedCompleteTastingSession).not.toHaveBeenCalled();
    expect(queryClient.invalidateQueries).not.toHaveBeenCalled();
  });

  it('removes deleted or left sessions from both paginated summary caches', async () => {
    const actions = createActions();

    await actions.deleteSession({ sessionId: 'session_1' });
    await actions.leaveSession({ sessionId: 'session_1' });

    expect(mockedDeleteTastingSession).toHaveBeenCalledWith('session_1');
    expect(mockedLeaveTastingSession).toHaveBeenCalledWith('session_1');
    expect(queryClient.setQueryData).toHaveBeenCalledWith(
      tastingSessionsQueryKeys.summaries('active'),
      expect.any(Function),
    );
    expect(queryClient.setQueryData).toHaveBeenCalledWith(
      tastingSessionsQueryKeys.summaries('completed'),
      expect.any(Function),
    );
    expect(queryClient.setQueryData).not.toHaveBeenCalledWith(
      tastingSessionsQueryKeys.root,
      expect.any(Function),
    );
    expect(queryClient.setQueryData).toHaveBeenCalledWith(
      tastingSessionsQueryKeys.detail('session_1'),
      null,
    );
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: tastingSessionsQueryKeys.summariesRoot,
    });
  });

  it('keeps online-only lifecycle actions blocked with their canonical messages', async () => {
    const actions = createActions(false);

    const acceptResult = await actions.acceptInvite({ sessionId: 'session_1' });
    const dismissResult = await actions.dismissInvite({ sessionId: 'session_1' });
    const deleteResult = await actions.deleteSession({ sessionId: 'session_1' });
    const leaveResult = await actions.leaveSession({ sessionId: 'session_1' });
    const reopenResult = await actions.reopenInviteWindow({
      joinDurationMinutes: 60,
      sessionId: 'session_1',
    });
    const resendResult = await actions.resendInvite({
      inviteId: 'invite_1',
      sessionId: 'session_1',
    });
    const removeParticipantResult = await actions.removeParticipant({
      participantId: 'participant_1',
      sessionId: 'session_1',
    });
    const planResult = await actions.addRestaurant({
      restaurant: {
        id: 'restaurant_1',
        name: 'Corner Ramen',
      },
      sessionId: 'session_1',
    });
    const ratingResult = await actions.submitRatingDraft({
      approvedRestaurants: [],
      currentUserId: 'user_1',
      draftByItemId: {},
      sessionId: 'session_1',
    });

    expect(acceptResult).toEqual({
      message: TASTING_SESSION_LIFECYCLE_BLOCKED_MESSAGES.acceptInvite,
      status: 'blocked',
    });
    expect(dismissResult).toEqual({
      message: TASTING_SESSION_LIFECYCLE_BLOCKED_MESSAGES.dismissInvite,
      status: 'blocked',
    });
    expect(deleteResult).toEqual({
      message: TASTING_SESSION_LIFECYCLE_BLOCKED_MESSAGES.deleteSession,
      status: 'blocked',
    });
    expect(leaveResult).toEqual({
      message: TASTING_SESSION_LIFECYCLE_BLOCKED_MESSAGES.leaveSession,
      status: 'blocked',
    });
    expect(reopenResult).toEqual({
      message: TASTING_SESSION_LIFECYCLE_BLOCKED_MESSAGES.reopenInviteWindow,
      status: 'blocked',
    });
    expect(resendResult).toEqual({
      message: TASTING_SESSION_LIFECYCLE_BLOCKED_MESSAGES.resendInvite,
      status: 'blocked',
    });
    expect(removeParticipantResult).toEqual({
      message: TASTING_SESSION_LIFECYCLE_BLOCKED_MESSAGES.removeParticipant,
      status: 'blocked',
    });
    expect(planResult).toEqual({
      message: TASTING_SESSION_LIFECYCLE_BLOCKED_MESSAGES.planning,
      status: 'blocked',
    });
    expect(ratingResult).toEqual({
      message: TASTING_SESSION_LIFECYCLE_BLOCKED_MESSAGES.submitRatings,
      status: 'blocked',
    });
    expect(mockedSuggestTastingRestaurant).not.toHaveBeenCalled();
    expect(mockedSubmitTastingRatings).not.toHaveBeenCalled();
    expect(writeReplaySafe).not.toHaveBeenCalled();
  });
});

describe('pending Tasting Session lifecycle write state', () => {
  const baseWrite = {
    createdAt: 1,
    id: 'queued-1',
    idempotencyKey: 'idem-1',
    lastError: null,
    originAccountId: 'user_1',
    status: 'pending',
  } as const;

  it('matches create and join writes by equivalent payload without blocking distinct submissions', () => {
    const writes = [
      {
        ...baseWrite,
        operationName: 'tasting-session.create',
        payload: {
          invitedUserIds: ['friend_2', 'friend_1'],
          joinDurationMinutes: 60,
          name: 'Ramen night',
        },
      },
      {
        ...baseWrite,
        id: 'queued-2',
        operationName: 'tasting-session.join',
        payload: { inviteCode: 'ABC123' },
      },
    ] as QueuedFeatureWrite[];

    expect(resolvePendingTastingSessionCreateState(writes, {
      invitedUserIds: ['friend_1', 'friend_2'],
      joinDurationMinutes: 60,
      name: 'Ramen night',
    })).toEqual({ status: 'pending' });
    expect(resolvePendingTastingSessionCreateState(writes, {
      invitedUserIds: [],
      joinDurationMinutes: 60,
      name: 'Different tasting',
    })).toEqual({ status: 'idle' });
    expect(resolvePendingTastingSessionJoinState(writes, { inviteCode: 'abc123' })).toEqual({
      status: 'pending',
    });
    expect(resolvePendingTastingSessionJoinState(writes, { inviteCode: 'XYZ789' })).toEqual({
      status: 'idle',
    });
  });

  it('clears pending state after replay and reports terminal failures separately', () => {
    const statusWrite = {
      ...baseWrite,
      operationName: 'tasting-session.status.update',
      payload: { sessionId: 'session_1', status: 'completed' },
    } as QueuedFeatureWrite;

    expect(resolvePendingTastingSessionStatusState([statusWrite], {
      sessionId: 'session_1',
      status: 'completed',
    })).toEqual({ status: 'pending' });
    expect(resolvePendingTastingSessionStatusState([], {
      sessionId: 'session_1',
      status: 'completed',
    })).toEqual({ status: 'idle' });
    expect(resolvePendingTastingSessionStatusState([
      {
        ...statusWrite,
        lastError: 'Replay rejected',
        status: 'failed',
      },
    ], {
      sessionId: 'session_1',
      status: 'completed',
    })).toEqual({
      message: 'Replay rejected',
      status: 'failed',
    });
  });
});
