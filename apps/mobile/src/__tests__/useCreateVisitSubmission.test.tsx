import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { createVisitApiMutationInput } from '../features/store/featureOutboxOperations';
import { buildVisitCreatedHomeParams } from '../navigation/homeRouteParams';
import { useCreateVisitSubmission } from '../screens/createVisit/useCreateVisitSubmission';

jest.mock('../features', () => ({
  createVisit: jest.fn(),
  formatLimitExceededMessage: jest.fn(
    (payload: { message?: string }) => payload.message ?? 'Limit exceeded',
  ),
  linkVisitToListBookmark: jest.fn(),
  markNoteUsed: jest.fn(),
  parseLimitExceededError: jest.fn(() => null),
  promoteCachedNoteToUsed: jest.fn(),
  restaurantListQueryKeys: {
    detailRoot: ['feature', 'restaurantLists', 'detail'],
    itemsRoot: ['feature', 'restaurantLists', 'items'],
  },
  syncVisitMutationCaches: jest.fn().mockResolvedValue(undefined),
  updateVisit: jest.fn(),
}));

jest.mock('../features/store/featureOutboxOperations', () => ({
  createVisitApiMutationInput: jest.fn((payload: unknown) => ({
    body: payload,
    headers: {
      'X-Mobile-Write-Operation': 'visit.create',
    },
    method: 'POST',
    url: 'https://example.test/api/visits',
  })),
}));

jest.mock('../features/store/notesQuery', () => ({
  notesQueryKeys: {
    detail: (noteId: string) => ['feature', 'notes', 'detail', noteId],
  },
}));

jest.mock('../features/store/useWriteTelemetry', () => ({
  useWriteTelemetry: jest.fn(() => jest.fn().mockResolvedValue(undefined)),
}));

jest.mock('../lib/dateFormatting', () => ({
  isValidLocalDate: jest.fn(() => true),
  localDateStringToUTC: jest.fn((value: string) => `${value}T00:00:00.000Z`),
}));

jest.mock('../lib/offlineAlerts', () => ({
  showQueuedOfflineAlert: jest.fn(),
}));

jest.mock('../observability', () => ({
  trackObservabilityEvent: jest.fn(),
}));

const mockedCreateVisitApiMutationInput = createVisitApiMutationInput as jest.MockedFunction<
  typeof createVisitApiMutationInput
>;

describe('useCreateVisitSubmission', () => {
  const queryClient = {
    invalidateQueries: jest.fn().mockResolvedValue(undefined),
  };
  const navigation = {
    canGoBack: jest.fn(() => false),
    goBack: jest.fn(),
    navigate: jest.fn(),
  };
  const setErrorMessage = jest.fn();
  const setSourceListItemId = jest.fn();

  beforeEach(() => {
    mockedCreateVisitApiMutationInput.mockClear();
    queryClient.invalidateQueries.mockClear();
    navigation.canGoBack.mockClear();
    navigation.canGoBack.mockReturnValue(false);
    navigation.goBack.mockClear();
    navigation.navigate.mockClear();
    setErrorMessage.mockClear();
    setSourceListItemId.mockClear();
  });

  function renderSubmissionHook(
    overrideParams: Partial<Parameters<typeof useCreateVisitSubmission>[0]> = {},
  ) {
    let hookResult: ReturnType<typeof useCreateVisitSubmission> | null = null;
    let renderer: ReactTestRenderer | null = null;

    const writeFeature = jest.fn().mockResolvedValue({
      result: {
        createdAt: '2026-04-20T18:00:00.000Z',
        id: 'visit-123',
        items: [],
        updatedAt: '2026-04-20T18:00:00.000Z',
      },
      status: 'completed',
    });

    function TestComponent() {
      hookResult = useCreateVisitSubmission({
        draftItems: [
          {
            deletedPhotoIds: [],
            description: 'Crispy wrapper',
            id: 'draft-item-1',
            name: 'Spicy Wontons',
            notes: 'Split with table',
            photos: [],
            rating: 4,
          },
        ],
        isDisplayFreeUser: false,
        isEditMode: false,
        monthlyUsageSnapshot: null,
        navigation: navigation as never,
        queryClient: queryClient as never,
        restaurantId: 'restaurant-1',
        restaurantName: 'Noodle House',
        setErrorMessage,
        setSourceListItemId,
        shouldEnforceUsageLimitsClientSide: false,
        sourceListItemId: null,
        visitDate: '2026-04-20',
        visitVisibility: 'friends',
        writeFeature: writeFeature as never,
        ...overrideParams,
      });

      return null;
    }

    return {
      getResult: () => hookResult,
      mount: async () => {
        await act(async () => {
          renderer = create(React.createElement(TestComponent));
        });
      },
      unmount: async () => {
        await act(async () => {
          renderer?.unmount();
        });
      },
      writeFeature,
    };
  }

  it('includes visitedOn and visitedAt in the manual create api payload', async () => {
    const hook = renderSubmissionHook();

    await hook.mount();

    await act(async () => {
      await hook.getResult()?.submitVisit();
    });

    expect(mockedCreateVisitApiMutationInput).toHaveBeenCalledWith({
      restaurantId: 'restaurant-1',
      restaurantName: 'Noodle House',
      items: [
        {
          description: 'Crispy wrapper',
          name: 'Spicy Wontons',
          notes: 'Split with table',
          photos: [],
          rating: 4,
        },
      ],
      source: 'visit',
      sourceListItemId: undefined,
      sourceNoteId: undefined,
      visibility: 'friends',
      visitedAt: '2026-04-20T00:00:00.000Z',
      visitedOn: '2026-04-20',
    });
    expect(hook.writeFeature).toHaveBeenCalledWith(
      expect.objectContaining({
        operationName: 'visit.create',
        offline: {
          strategy: 'api',
          input: {
            body: expect.objectContaining({
              visitedAt: '2026-04-20T00:00:00.000Z',
              visitedOn: '2026-04-20',
            }),
            headers: {
              'X-Mobile-Write-Operation': 'visit.create',
            },
            method: 'POST',
            url: 'https://example.test/api/visits',
          },
        },
      }),
    );
    expect(navigation.navigate).toHaveBeenCalledWith(
      'Home',
      buildVisitCreatedHomeParams('visit-123'),
    );

    await hook.unmount();
  });

  it('passes source list item context through visit create payloads', async () => {
    const hook = renderSubmissionHook({
      sourceListItemId: 'list-item-1',
    });

    await hook.mount();

    await act(async () => {
      await hook.getResult()?.submitVisit();
    });

    expect(mockedCreateVisitApiMutationInput).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceListItemId: 'list-item-1',
      }),
    );
    expect(hook.writeFeature).toHaveBeenCalledWith(
      expect.objectContaining({
        operationName: 'visit.create',
        offline: {
          strategy: 'api',
          input: expect.objectContaining({
            body: expect.objectContaining({
              sourceListItemId: 'list-item-1',
            }),
          }),
        },
      }),
    );

    await hook.unmount();
  });

  it('keeps queued visit creates on the current home navigation path', async () => {
    const writeFeature = jest.fn().mockResolvedValue({
      status: 'queued',
    });
    const hook = renderSubmissionHook({
      writeFeature: writeFeature as never,
    });

    await hook.mount();

    await act(async () => {
      await hook.getResult()?.submitVisit();
    });

    expect(navigation.navigate).toHaveBeenCalledWith('Home');

    await hook.unmount();
  });

  it('submits only remaining draft items in the edit update payload', async () => {
    const hook = renderSubmissionHook({
      draftItems: [
        {
          deletedPhotoIds: [],
          description: 'Crispy wrapper',
          id: 'visit-item-kept',
          name: 'Spicy Wontons',
          notes: 'Split with table',
          photos: [],
          rating: 4,
        },
      ],
      editVisitId: 'visit-123',
      isEditMode: true,
    });

    await hook.mount();

    await act(async () => {
      await hook.getResult()?.submitVisit();
    });

    expect(hook.writeFeature).toHaveBeenCalledWith(
      expect.objectContaining({
        operationName: 'visit.update',
        offline: {
          strategy: 'outbox',
          payload: {
            visitId: 'visit-123',
            updates: expect.objectContaining({
              items: [
                {
                  deletePhotoIds: [],
                  description: 'Crispy wrapper',
                  id: 'visit-item-kept',
                  name: 'Spicy Wontons',
                  newPhotos: [],
                  notes: 'Split with table',
                  rating: 4,
                },
              ],
            }),
          },
        },
      }),
    );
    expect(navigation.navigate).toHaveBeenCalledWith('Home');

    await hook.unmount();
  });
});
