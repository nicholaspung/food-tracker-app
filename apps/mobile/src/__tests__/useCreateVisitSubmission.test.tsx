import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { buildVisitCreatedHomeParams } from '../navigation/homeRouteParams';
import { useCreateVisitSubmission } from '../screens/createVisit/useCreateVisitSubmission';

jest.mock('../features', () => ({
  createVisit: jest.fn(),
  formatLimitExceededMessage: jest.fn(
    (payload: { message?: string }) => payload.message ?? 'Limit exceeded',
  ),
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

const mockVisitWrites = {
  createVisit: jest.fn(),
  deleteVisitItem: jest.fn(),
  updateVisit: jest.fn(),
};

jest.mock('../features/store/useVisitWrites', () => ({
  useVisitWrites: jest.fn(() => mockVisitWrites),
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

describe('useCreateVisitSubmission', () => {
  const navigation = {
    canGoBack: jest.fn(() => false),
    goBack: jest.fn(),
    navigate: jest.fn(),
  };
  const setErrorMessage = jest.fn();
  const setSourceListItemId = jest.fn();

  beforeEach(() => {
    mockVisitWrites.createVisit.mockReset();
    mockVisitWrites.createVisit.mockResolvedValue({
      result: {
        createdAt: '2026-04-20T18:00:00.000Z',
        id: 'visit-123',
        items: [],
        updatedAt: '2026-04-20T18:00:00.000Z',
      },
      status: 'completed',
    });
    mockVisitWrites.deleteVisitItem.mockReset();
    mockVisitWrites.deleteVisitItem.mockResolvedValue({
      result: {
        createdAt: '2026-04-20T18:00:00.000Z',
        id: 'visit-123',
        items: [],
        updatedAt: '2026-04-20T18:00:00.000Z',
      },
      status: 'completed',
    });
    mockVisitWrites.updateVisit.mockReset();
    mockVisitWrites.updateVisit.mockResolvedValue({
      result: {
        createdAt: '2026-04-20T18:00:00.000Z',
        id: 'visit-123',
        items: [],
        updatedAt: '2026-04-20T18:00:00.000Z',
      },
      status: 'completed',
    });
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
        hasDeletedPersistedVisitItem: false,
        isDisplayFreeUser: false,
        isEditMode: false,
        monthlyUsageSnapshot: null,
        navigation: navigation as never,
        restaurantId: 'restaurant-1',
        restaurantName: 'Noodle House',
        setErrorMessage,
        setSourceListItemId,
        shouldEnforceUsageLimitsClientSide: false,
        sourceListItemId: null,
        visitDate: '2026-04-20',
        visitVisibility: 'friends',
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
    };
  }

  it('includes visitedOn and visitedAt in the manual create api payload', async () => {
    const hook = renderSubmissionHook();

    await hook.mount();

    await act(async () => {
      await hook.getResult()?.submitVisit();
    });

    expect(mockVisitWrites.createVisit).toHaveBeenCalledWith(
      expect.objectContaining({
        input: {
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
        },
        useApiReplay: true,
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

    expect(mockVisitWrites.createVisit).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          sourceListItemId: 'list-item-1',
        }),
        useApiReplay: true,
      }),
    );

    await hook.unmount();
  });

  it('keeps queued visit creates on the current home navigation path', async () => {
    mockVisitWrites.createVisit.mockResolvedValue({ status: 'queued' });
    const hook = renderSubmissionHook();

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

    expect(mockVisitWrites.updateVisit).toHaveBeenCalledWith(
      expect.objectContaining({
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
      }),
    );
    expect(navigation.navigate).toHaveBeenCalledWith('Home');

    await hook.unmount();
  });
});
