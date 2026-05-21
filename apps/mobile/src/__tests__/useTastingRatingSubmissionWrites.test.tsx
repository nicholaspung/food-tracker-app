import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useQueryClient } from '@tanstack/react-query';

import {
  completeTastingSession,
  submitTastingRatings,
} from '../features/store/tastingSessionsApiStore';
import { tastingSessionsQueryKeys } from '../features/store/tastingSessionsQuery';
import { useTastingRatingSubmissionWrites } from '../features/store/useTastingRatingSubmissionWrites';
import { uploadVisitPhotos } from '../features/store/visitPhotoUploads';
import type { TastingMenuItemRecord, TastingRestaurantRecord, TastingSessionRecord } from '../features/models';

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: jest.fn(),
}));

jest.mock('../features/store/tastingSessionsApiStore', () => ({
  completeTastingSession: jest.fn(),
  submitTastingRatings: jest.fn(),
}));

jest.mock('../features/store/visitPhotoUploads', () => ({
  uploadVisitPhotos: jest.fn(),
}));

const mockedUseQueryClient = useQueryClient as jest.MockedFunction<typeof useQueryClient>;
const mockedCompleteTastingSession = completeTastingSession as jest.MockedFunction<typeof completeTastingSession>;
const mockedSubmitTastingRatings = submitTastingRatings as jest.MockedFunction<typeof submitTastingRatings>;
const mockedUploadVisitPhotos = uploadVisitPhotos as jest.MockedFunction<typeof uploadVisitPhotos>;

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
  updatedAt: '2026-05-20T00:00:00.000Z',
};

describe('useTastingRatingSubmissionWrites', () => {
  const queryClient = {
    invalidateQueries: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.invalidateQueries.mockResolvedValue(undefined);
    mockedUseQueryClient.mockReturnValue(queryClient as never);
    mockedCompleteTastingSession.mockResolvedValue({
      ...submittedSession,
      status: 'completed',
    });
    mockedSubmitTastingRatings.mockResolvedValue(submittedSession);
    mockedUploadVisitPhotos.mockResolvedValue(undefined);
  });

  async function renderHook(): Promise<{
    hook: ReturnType<typeof useTastingRatingSubmissionWrites>;
    renderer: ReactTestRenderer;
  }> {
    let hook: ReturnType<typeof useTastingRatingSubmissionWrites> | null = null;
    let renderer: ReactTestRenderer | null = null;

    function TestComponent() {
      hook = useTastingRatingSubmissionWrites();
      return null;
    }

    await act(async () => {
      renderer = create(React.createElement(TestComponent));
    });

    if (!hook || !renderer) {
      throw new Error('Expected hook to render.');
    }

    return { hook, renderer };
  }

  it('submits included approved items and uploads generated Visit photos', async () => {
    const { hook, renderer } = await renderHook();
    const resolveDraft = jest.fn(() => ({
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
    }));

    await hook.submitRatingDraft({
      approvedRestaurants,
      currentUserId: 'user_1',
      isOnline: true,
      resolveDraft,
      sessionId: 'session_1',
    });

    expect(mockedSubmitTastingRatings).toHaveBeenCalledWith('session_1', {
      restaurants: [
        {
          restaurantSuggestionId: 'restaurant_1',
          items: [
            {
              itemId: 'item_1',
              note: 'Nice',
              rating: 4,
            },
          ],
        },
      ],
    });
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
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: tastingSessionsQueryKeys.detail('session_1'),
    });

    await act(async () => {
      renderer.unmount();
    });
  });

  it('does not upload duplicate generated Visit photos on resubmit', async () => {
    const { hook, renderer } = await renderHook();
    const resolveDraft = jest.fn(() => ({
      included: true,
      note: '',
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
    }));

    await hook.submitRatingDraft({
      approvedRestaurants,
      currentUserId: 'user_1',
      isOnline: true,
      resolveDraft,
      sessionId: 'session_1',
    });
    await hook.submitRatingDraft({
      approvedRestaurants,
      currentUserId: 'user_1',
      isOnline: true,
      resolveDraft,
      sessionId: 'session_1',
    });

    expect(mockedUploadVisitPhotos).toHaveBeenCalledTimes(1);

    await act(async () => {
      renderer.unmount();
    });
  });

  it('filters out excluded items and empty restaurants', async () => {
    const { hook, renderer } = await renderHook();

    await hook.submitRatingDraft({
      approvedRestaurants,
      currentUserId: 'user_1',
      isOnline: true,
      resolveDraft: () => ({
        included: false,
        note: '',
        photos: [],
        rating: 3,
      }),
      sessionId: 'session_1',
    });

    expect(mockedSubmitTastingRatings).toHaveBeenCalledWith('session_1', {
      restaurants: [],
    });

    await act(async () => {
      renderer.unmount();
    });
  });

  it('completes tasting and refreshes tasting session detail', async () => {
    const { hook, renderer } = await renderHook();

    await hook.completeTasting({ isOnline: true, sessionId: 'session_1' });

    expect(mockedCompleteTastingSession).toHaveBeenCalledWith('session_1');
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: tastingSessionsQueryKeys.detail('session_1'),
    });

    await act(async () => {
      renderer.unmount();
    });
  });

  it('blocks offline submit and complete actions', async () => {
    const { hook, renderer } = await renderHook();

    const submitResult = await hook.submitRatingDraft({
      approvedRestaurants,
      currentUserId: 'user_1',
      isOnline: false,
      resolveDraft: () => ({
        included: true,
        note: '',
        photos: [],
        rating: 3,
      }),
      sessionId: 'session_1',
    });
    const completeResult = await hook.completeTasting({ isOnline: false, sessionId: 'session_1' });

    expect(submitResult).toEqual({
      message: 'Connect to the internet to submit ratings.',
      status: 'blocked',
    });
    expect(completeResult).toEqual({
      message: 'Connect to the internet to complete this tasting.',
      status: 'blocked',
    });
    expect(mockedSubmitTastingRatings).not.toHaveBeenCalled();
    expect(mockedCompleteTastingSession).not.toHaveBeenCalled();

    await act(async () => {
      renderer.unmount();
    });
  });
});
