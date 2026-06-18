import {
  submitCreateVisit,
  submitEditVisit,
  type SubmitCreateVisitInput,
  type SubmitEditVisitInput,
} from '../features/visitSubmission/createVisitSubmissionLifecycle';
import { parseLimitExceededError } from '../features/store';
import { cleanupStagedPhotoFiles } from '../lib/photoStaging';
import { buildVisitCreatedHomeParams } from '../navigation/homeRouteParams';

jest.mock('../features/store', () => ({
  formatLimitExceededMessage: jest.fn(
    (payload: { message?: string }) => payload.message ?? 'Limit exceeded',
  ),
  parseLimitExceededError: jest.fn(() => null),
}));

jest.mock('../lib/photoStaging', () => ({
  cleanupStagedPhotoFiles: jest.fn(),
}));

jest.mock('../lib/dateFormatting', () => ({
  isValidLocalDate: jest.fn(() => true),
  localDateStringToUTC: jest.fn((value: string) => `${value}T00:00:00.000Z`),
}));

jest.mock('../navigation/homeRouteParams', () => ({
  buildVisitCreatedHomeParams: jest.fn((visitId: string) => ({
    createdVisitId: visitId,
  })),
}));

jest.mock('../observability', () => ({
  trackObservabilityEvent: jest.fn(),
}));

jest.mock('../observability/productAnalytics', () => ({
  trackFirstFoodLogged: jest.fn(),
  trackProductEvent: jest.fn(),
}));

const mockedCleanupStagedPhotoFiles = cleanupStagedPhotoFiles as jest.MockedFunction<
  typeof cleanupStagedPhotoFiles
>;
const mockedBuildVisitCreatedHomeParams = buildVisitCreatedHomeParams as jest.MockedFunction<
  typeof buildVisitCreatedHomeParams
>;
const mockedParseLimitExceededError = parseLimitExceededError as jest.MockedFunction<
  typeof parseLimitExceededError
>;

describe('submitCreateVisit', () => {
  const createVisit = jest.fn();

  function buildInput(
    overrides: Partial<SubmitCreateVisitInput> = {},
  ): SubmitCreateVisitInput {
    return {
      draftItems: [
        {
          description: 'Crispy wrapper',
          id: 'draft-item-1',
          name: 'Spicy Wontons',
          notes: 'Split with table',
          photos: [],
          rating: 4,
        },
      ],
      isDisplayFreeUser: false,
      isOnline: true,
      monthlyUsageSnapshot: null,
      restaurantId: 'restaurant-1',
      restaurantName: 'Noodle House',
      shouldEnforceUsageLimitsClientSide: false,
      sourceListItemId: null,
      visitDate: '2026-04-20',
      visitVisibility: 'friends',
      visitWrites: {
        createVisit,
      },
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    createVisit.mockResolvedValue({
      result: {
        createdAt: '2026-04-20T18:00:00.000Z',
        id: 'visit-123',
        items: [
          {
            id: 'visit-item-1',
          },
        ],
        updatedAt: '2026-04-20T18:00:00.000Z',
      },
      status: 'completed',
    });
  });

  it('blocks validation failures before creating a visit', async () => {
    const result = await submitCreateVisit(
      buildInput({
        restaurantName: '   ',
      }),
    );

    expect(result).toEqual({
      errorMessage: 'Select a restaurant before continuing.',
      status: 'blocked',
    });
    expect(createVisit).not.toHaveBeenCalled();
  });

  it('blocks client-side photo quota failures before creating a visit', async () => {
    const photoUpload = {
      mimeType: 'image/jpeg',
      name: 'wontons.jpg',
      uri: 'file:///wontons.jpg',
    };

    const result = await submitCreateVisit(
      buildInput({
        draftItems: [
          {
            description: '',
            id: 'draft-item-1',
            name: 'Spicy Wontons',
            notes: '',
            photos: [
              {
                kind: 'new',
                upload: photoUpload as never,
              },
            ],
            rating: 4,
          },
        ],
        isDisplayFreeUser: true,
        monthlyUsageSnapshot: {
          limits: {
            menuScansMonthly: null,
            photoUploadsMonthly: 100,
            photoUploadsPerRecord: null,
            placesQueriesMonthly: null,
            receiptScansMonthly: null,
            storefrontReadsMonthly: null,
          },
          monthKey: '2026-04',
          remaining: {
            menuScansMonthly: null,
            photoUploadsMonthly: 0,
            placesQueriesMonthly: null,
            receiptScansMonthly: null,
            storefrontReadsMonthly: null,
          },
          usage: {
            menuScans: 0,
            photoUploads: 100,
            placesQueries: 0,
            receiptScans: 0,
            storefrontReads: 0,
          },
          userTier: 'free',
        },
        shouldEnforceUsageLimitsClientSide: true,
      }),
    );

    expect(result).toMatchObject({
      errorMessage: expect.stringContaining('Free users can upload up to 100 photos per month.'),
      status: 'blocked',
    });
    expect(createVisit).not.toHaveBeenCalled();
  });

  it('returns queued Home navigation and keeps staged photos for queued creates', async () => {
    createVisit.mockResolvedValue({
      status: 'queued',
    });

    const result = await submitCreateVisit(buildInput());

    expect(createVisit).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          restaurantName: 'Noodle House',
          sourceListItemId: undefined,
          visitedAt: '2026-04-20T00:00:00.000Z',
          visitedOn: '2026-04-20',
        }),
        useApiReplay: true,
      }),
    );
    expect(mockedCleanupStagedPhotoFiles).not.toHaveBeenCalled();
    expect(result).toEqual({
      clearSourceListItemId: true,
      destination: {
        name: 'Home',
      },
      status: 'queued',
    });
  });

  it('submits completed creates with photos and cleans staged files', async () => {
    const photoUpload = {
      mimeType: 'image/jpeg',
      name: 'wontons.jpg',
      uri: 'file:///wontons.jpg',
    };

    const result = await submitCreateVisit(
      buildInput({
        draftItems: [
          {
            description: '',
            id: 'draft-item-1',
            name: 'Spicy Wontons',
            notes: '',
            photos: [
              {
                kind: 'new',
                upload: photoUpload as never,
              },
            ],
            rating: 4,
          },
        ],
      }),
    );

    expect(createVisit).toHaveBeenCalledWith(
      expect.objectContaining({
        hasPhotoUploads: true,
        useApiReplay: false,
      }),
    );
    expect(mockedCleanupStagedPhotoFiles).toHaveBeenCalledWith([photoUpload]);
    expect(mockedBuildVisitCreatedHomeParams).toHaveBeenCalledWith('visit-123');
    expect(result).toEqual({
      clearSourceListItemId: true,
      destination: {
        name: 'Home',
        params: {
          createdVisitId: 'visit-123',
        },
      },
      status: 'completed',
    });
  });

  it('passes source note completion input through the visit write', async () => {
    await submitCreateVisit(
      buildInput({
        sourceNoteId: 'note-1',
      }),
    );

    expect(createVisit).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          sourceNoteId: 'note-1',
        }),
        sourceNote: {
          noteId: 'note-1',
          usedAt: expect.any(String),
        },
        useApiReplay: false,
      }),
    );
  });

  it('passes selected menu item ids through the visit write', async () => {
    await submitCreateVisit(
      buildInput({
        draftItems: [
          {
            description: '',
            id: 'draft-item-1',
            name: 'Spicy Wontons',
            notes: '',
            photos: [],
            rating: 4,
            sourceMenuItemId: 'menu-item-1',
          },
        ],
      }),
    );

    expect(createVisit).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          items: [
            expect.objectContaining({
              menuItemId: 'menu-item-1',
              name: 'Spicy Wontons',
            }),
          ],
        }),
      }),
    );
  });

  it('passes related-location suggestion provenance through the visit write', async () => {
    await submitCreateVisit(
      buildInput({
        draftItems: [
          {
            description: '',
            id: 'related-location:coconut yogurt',
            name: 'Coconut Yogurt',
            notes: '',
            photos: [],
            rating: 4,
            suggestionSource: {
              normalizedItemName: ' coconut yogurt ',
              restaurantGroupId: ' group-1 ',
              sourceMenuItemId: ' menu-item-2 ',
              sourceRestaurantId: ' restaurant-2 ',
              type: 'groupMenuSuggestion',
            },
          },
        ],
      }),
    );

    expect(createVisit).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          items: [
            expect.objectContaining({
              name: 'Coconut Yogurt',
              suggestionSource: {
                normalizedItemName: 'coconut yogurt',
                restaurantGroupId: 'group-1',
                sourceMenuItemId: 'menu-item-2',
                sourceRestaurantId: 'restaurant-2',
                type: 'groupMenuSuggestion',
              },
            }),
          ],
        }),
      }),
    );
  });

  it('passes source restaurant list item context to backend visit writes', async () => {
    await submitCreateVisit(
      buildInput({
        sourceListItemId: 'list-item-1',
      }),
    );

    expect(createVisit).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          sourceListItemId: 'list-item-1',
        }),
        useApiReplay: true,
      }),
    );
  });
});

describe('submitEditVisit', () => {
  const deleteVisitItem = jest.fn();
  const updateVisit = jest.fn();
  const photoUpload = {
    mimeType: 'image/jpeg',
    name: 'wontons.jpg',
    uri: 'file:///wontons.jpg',
  };

  function buildInput(
    overrides: Partial<SubmitEditVisitInput> = {},
  ): SubmitEditVisitInput {
    return {
      draftItems: [
        {
          deletedPhotoIds: [],
          description: 'Crispy wrapper',
          id: 'visit-item-1',
          name: 'Spicy Wontons',
          notes: 'Split with table',
          photos: [],
          rating: 4,
        },
      ],
      hasDeletedPersistedVisitItem: false,
      isOnline: true,
      restaurantId: 'restaurant-1',
      restaurantName: 'Noodle House',
      sourceListItemId: null,
      visitDate: '2026-04-20',
      visitId: 'visit-123',
      visitVisibility: 'friends',
      visitWrites: {
        deleteVisitItem,
        updateVisit,
      },
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockedParseLimitExceededError.mockReturnValue(null);
    deleteVisitItem.mockResolvedValue({
      result: {
        createdAt: '2026-04-20T18:00:00.000Z',
        id: 'visit-123',
        items: [],
        updatedAt: '2026-04-20T18:00:00.000Z',
      },
      status: 'completed',
    });
    updateVisit.mockResolvedValue({
      result: {
        createdAt: '2026-04-20T18:00:00.000Z',
        id: 'visit-123',
        items: [],
        updatedAt: '2026-04-20T18:00:00.000Z',
      },
      status: 'completed',
    });
  });

  it('returns back navigation and keeps staged photos for queued edits', async () => {
    updateVisit.mockResolvedValue({
      status: 'queued',
    });

    const result = await submitEditVisit(
      buildInput({
        draftItems: [
          {
            deletedPhotoIds: [],
            description: '',
            id: 'visit-item-1',
            name: 'Spicy Wontons',
            notes: '',
            photos: [
              {
                kind: 'new',
                upload: photoUpload as never,
              },
            ],
            rating: 4,
          },
        ],
      }),
    );

    expect(updateVisit).toHaveBeenCalledWith(
      expect.objectContaining({
        includeUsage: true,
        includeVisitPhotos: true,
        visitId: 'visit-123',
      }),
    );
    expect(mockedCleanupStagedPhotoFiles).not.toHaveBeenCalled();
    expect(result).toEqual({
      navigationIntent: 'back',
      status: 'queued',
    });
  });

  it('submits completed edits with new photos and cleans staged files', async () => {
    const result = await submitEditVisit(
      buildInput({
        draftItems: [
          {
            deletedPhotoIds: [],
            description: '',
            id: 'visit-item-1',
            name: 'Spicy Wontons',
            notes: '',
            photos: [
              {
                kind: 'new',
                upload: photoUpload as never,
              },
            ],
            rating: 4,
          },
        ],
      }),
    );

    expect(updateVisit).toHaveBeenCalledWith({
      includeUsage: true,
      includeVisitPhotos: true,
      updates: expect.objectContaining({
        items: [
          expect.objectContaining({
            deletePhotoIds: [],
            id: 'visit-item-1',
            newPhotos: [photoUpload],
          }),
        ],
        restaurantId: 'restaurant-1',
        restaurantName: 'Noodle House',
        visitedAt: '2026-04-20T00:00:00.000Z',
        visitedOn: '2026-04-20',
        visibility: 'friends',
      }),
      visitId: 'visit-123',
    });
    expect(mockedCleanupStagedPhotoFiles).toHaveBeenCalledWith([photoUpload]);
    expect(result).toEqual({
      navigationIntent: 'back',
      status: 'completed',
    });
  });

  it('submits completed edits with deleted photo ids and visit-photo cache invalidation', async () => {
    await submitEditVisit(
      buildInput({
        draftItems: [
          {
            deletedPhotoIds: ['photo-1'],
            description: '',
            id: 'visit-item-1',
            name: 'Spicy Wontons',
            notes: '',
            photos: [],
            rating: 4,
          },
        ],
      }),
    );

    expect(updateVisit).toHaveBeenCalledWith(
      expect.objectContaining({
        includeUsage: false,
        includeVisitPhotos: true,
        updates: expect.objectContaining({
          items: [
            expect.objectContaining({
              deletePhotoIds: ['photo-1'],
              newPhotos: [],
            }),
          ],
        }),
      }),
    );
    expect(mockedCleanupStagedPhotoFiles).toHaveBeenCalledWith([]);
  });

  it('routes persisted item deletion through the visit item delete action writer', async () => {
    await submitEditVisit(
      buildInput({
        hasDeletedPersistedVisitItem: true,
      }),
    );

    expect(deleteVisitItem).toHaveBeenCalledWith(
      expect.objectContaining({
        includeUsage: false,
        includeVisitPhotos: false,
        visitId: 'visit-123',
      }),
    );
    expect(updateVisit).not.toHaveBeenCalled();
  });

  it('blocks validation failures before updating a visit', async () => {
    const result = await submitEditVisit(
      buildInput({
        restaurantName: '   ',
      }),
    );

    expect(result).toEqual({
      errorMessage: 'Select a restaurant before continuing.',
      status: 'blocked',
    });
    expect(updateVisit).not.toHaveBeenCalled();
  });

  it('returns formatted server-limit errors without cleaning staged files', async () => {
    const serverError = new Error('limit');
    mockedParseLimitExceededError.mockReturnValue({
      code: 'LIMIT_EXCEEDED',
      limit: 100,
      message: 'Photo limit reached',
      metric: 'photo_uploads',
      monthKey: '2026-04',
      remaining: 0,
      success: false,
      used: 100,
      userTier: 'free',
    });
    updateVisit.mockRejectedValue(serverError);

    const result = await submitEditVisit(
      buildInput({
        draftItems: [
          {
            deletedPhotoIds: [],
            description: '',
            id: 'visit-item-1',
            name: 'Spicy Wontons',
            notes: '',
            photos: [
              {
                kind: 'new',
                upload: photoUpload as never,
              },
            ],
            rating: 4,
          },
        ],
      }),
    );

    expect(result).toEqual({
      errorMessage: 'Photo limit reached',
      status: 'failed',
    });
    expect(mockedCleanupStagedPhotoFiles).not.toHaveBeenCalled();
  });
});
