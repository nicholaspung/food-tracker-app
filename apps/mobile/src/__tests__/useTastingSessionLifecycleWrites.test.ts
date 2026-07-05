import {
  completeTastingSession,
  lockTastingSessionMembership,
  startTastingSession,
  submitTastingRatings,
  suggestTastingRestaurant,
} from '../features/store/tastingSessionsApiStore';
import {
  createTastingSessionLifecycleWriteActions,
  TASTING_SESSION_LIFECYCLE_BLOCKED_MESSAGES,
} from '../features/store/useTastingSessionLifecycleWrites';
import { tastingSessionsQueryKeys } from '../features/store/tastingSessionsQuery';

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
const mockedLockTastingSessionMembership =
  lockTastingSessionMembership as jest.MockedFunction<typeof lockTastingSessionMembership>;
const mockedStartTastingSession = startTastingSession as jest.MockedFunction<typeof startTastingSession>;
const mockedSubmitTastingRatings = submitTastingRatings as jest.MockedFunction<typeof submitTastingRatings>;
const mockedSuggestTastingRestaurant =
  suggestTastingRestaurant as jest.MockedFunction<typeof suggestTastingRestaurant>;

const tastingSession = {
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
} as const;

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
    queryClient.cancelQueries.mockResolvedValue(undefined);
    queryClient.invalidateQueries.mockResolvedValue(undefined);
    mockedCompleteTastingSession.mockResolvedValue({ ...tastingSession, status: 'completed' } as never);
    mockedLockTastingSessionMembership.mockResolvedValue({ ...tastingSession, status: 'planning' } as never);
    mockedStartTastingSession.mockResolvedValue({ ...tastingSession, status: 'tasting' } as never);
    mockedSuggestTastingRestaurant.mockResolvedValue(tastingSession as never);
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

    await actions.lockLobby({ sessionId: 'session_1' });
    await actions.startTasting({ sessionId: 'session_1' });
    await actions.completeTasting({ sessionId: 'session_1' });

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
    expect(mockedLockTastingSessionMembership).toHaveBeenCalledWith('session_1');
    expect(mockedStartTastingSession).toHaveBeenCalledWith('session_1');
    expect(mockedCompleteTastingSession).toHaveBeenCalledWith('session_1');
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: tastingSessionsQueryKeys.detail('session_1'),
    });
  });

  it('returns queued without running API or cache effects when the outbox owns replay', async () => {
    writeReplaySafe.mockResolvedValue({ status: 'queued' });
    const actions = createActions(false);

    const result = await actions.startTasting({ sessionId: 'session_1' });

    expect(result).toEqual({ status: 'queued' });
    expect(mockedStartTastingSession).not.toHaveBeenCalled();
    expect(queryClient.invalidateQueries).not.toHaveBeenCalled();
  });

  it('keeps Tasting Plan and Tasting Rating Submission actions online-only inside the module', async () => {
    const actions = createActions(false);

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
