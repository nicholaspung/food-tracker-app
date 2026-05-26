import {
  submitProcessedPhotos,
  type SubmitProcessedPhotosInput,
} from '../features/photoProcessing/photoProcessingSubmissionLifecycle';
import {
  submitFoodProductPhotoEntries,
  submitRestaurantPhotoEntries,
} from '../features/photoProcessing/photoSubmission';
import { cleanupStagedPhotoFiles } from '../lib/photoStaging';
import { showQueuedOfflineAlert } from '../lib/offlineAlerts';
import { buildFoodProductCreatedHomeParams } from '../navigation/homeRouteParams';
import { trackObservabilityEvent } from '../observability';

jest.mock('../features/photoProcessing/photoSubmission', () => ({
  submitFoodProductPhotoEntries: jest.fn(),
  submitRestaurantPhotoEntries: jest.fn(),
}));

jest.mock('../features/store', () => ({
  formatLimitExceededMessage: jest.fn((payload: { message?: string }) => payload.message ?? 'Limit exceeded'),
  homeFeedMapQueryKeys: {
    root: ['feature', 'homeFeedMap'],
  },
  homeFeedQueryKeys: {
    root: ['feature', 'homeFeed'],
  },
  parseLimitExceededError: jest.fn(() => null),
  restaurantsQueryKeys: {
    root: ['feature', 'restaurants'],
  },
}));

jest.mock('../lib/photoStaging', () => ({
  cleanupStagedPhotoFiles: jest.fn(),
}));

jest.mock('../lib/offlineAlerts', () => ({
  showQueuedOfflineAlert: jest.fn(),
}));

jest.mock('../navigation/homeRouteParams', () => ({
  buildFoodProductCreatedHomeParams: jest.fn(() => ({
    createdFoodProduct: '1',
  })),
}));

jest.mock('../observability', () => ({
  trackObservabilityEvent: jest.fn(),
}));

jest.mock('../observability/productAnalytics', () => ({
  trackFirstFoodLogged: jest.fn(),
  trackProductEvent: jest.fn(),
}));

const mockedSubmitRestaurantPhotoEntries = submitRestaurantPhotoEntries as jest.MockedFunction<
  typeof submitRestaurantPhotoEntries
>;
const mockedSubmitFoodProductPhotoEntries = submitFoodProductPhotoEntries as jest.MockedFunction<
  typeof submitFoodProductPhotoEntries
>;
const mockedCleanupStagedPhotoFiles = cleanupStagedPhotoFiles as jest.MockedFunction<
  typeof cleanupStagedPhotoFiles
>;
const mockedShowQueuedOfflineAlert = showQueuedOfflineAlert as jest.MockedFunction<
  typeof showQueuedOfflineAlert
>;
const mockedBuildFoodProductCreatedHomeParams = buildFoodProductCreatedHomeParams as jest.MockedFunction<
  typeof buildFoodProductCreatedHomeParams
>;
const mockedTrackObservabilityEvent = trackObservabilityEvent as jest.MockedFunction<
  typeof trackObservabilityEvent
>;

describe('submitProcessedPhotos', () => {
  const invalidateQueries = jest.fn().mockResolvedValue(undefined);
  const writeFeature = jest.fn();

  function buildInput(
    overrides: Partial<SubmitProcessedPhotosInput> = {},
  ): SubmitProcessedPhotosInput {
    return {
      foodProductForms: {
        'photo-1': {
          category: '',
          date: '2026-04-20',
          itemName: 'Sparkling Water',
          locationText: '',
          notes: '',
          rating: 4,
          visibility: 'friends',
        },
      },
      isDisplayFreeUser: false,
      isOnline: true,
      monthlyUsageSnapshot: null,
      photos: [
        {
          captureCoordinates: null,
          captureDate: null,
          id: 'photo-1',
          metadataDate: null,
          mimeType: 'image/jpeg',
          name: 'photo.jpg',
          uri: 'file:///photo.jpg',
        },
      ],
      processType: 'restaurant',
      queryClient: {
        invalidateQueries,
      } as never,
      restaurantForms: {
        'photo-1': {
          date: '2026-04-20',
          description: '',
          menuItemId: 'menu-item-1',
          menuItemName: 'Burger',
          notes: '',
          rating: 4,
          restaurantId: 'restaurant-1',
          restaurantName: 'Corner Spot',
        },
      },
      shouldEnforceUsageLimitsClientSide: false,
      visitVisibility: 'friends',
      writeFeature: writeFeature as never,
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    invalidateQueries.mockResolvedValue(undefined);
    mockedSubmitRestaurantPhotoEntries.mockResolvedValue({
      photoCount: 1,
      queued: false,
      visitCount: 1,
    });
    mockedSubmitFoodProductPhotoEntries.mockResolvedValue({
      photoCount: 1,
      queued: false,
    });
  });

  it('blocks submit before writes when the client-side photo quota would be exceeded', async () => {
    const result = await submitProcessedPhotos(
      buildInput({
        isDisplayFreeUser: true,
        monthlyUsageSnapshot: {
          limits: {
            menuScansMonthly: null,
            photoUploadsMonthly: 100,
            photoUploadsPerRecord: null,
            placesQueriesMonthly: null,
            receiptScansMonthly: null,
          },
          monthKey: '2026-04',
          remaining: {
            menuScansMonthly: null,
            photoUploadsMonthly: 0,
            placesQueriesMonthly: null,
            receiptScansMonthly: null,
          },
          usage: {
            menuScans: 0,
            photoUploads: 100,
            placesQueries: 0,
            receiptScans: 0,
          },
          userTier: 'free',
        },
        shouldEnforceUsageLimitsClientSide: true,
      }),
    );

    expect(result).toMatchObject({
      status: 'blocked',
      errorMessage: expect.stringContaining('Free users can upload up to 100 photos per month.'),
    });
    expect(mockedSubmitRestaurantPhotoEntries).not.toHaveBeenCalled();
    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  it('submits restaurant photos, refreshes affected queries, cleans staged files, and returns Home', async () => {
    const result = await submitProcessedPhotos(
      buildInput({
        sourceNoteId: 'note-1',
      }),
    );

    expect(mockedSubmitRestaurantPhotoEntries).toHaveBeenCalledWith(expect.objectContaining({
      noteId: 'note-1',
      visitVisibility: 'friends',
    }));
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['feature', 'homeFeed'] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['feature', 'homeFeedMap'] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['feature', 'visits'] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['feature', 'restaurants'] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['feature', 'foodProducts'] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['feature', 'visitPhotos'] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['feature', 'usage', 'monthly'] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['feature', 'notes'] });
    expect(mockedCleanupStagedPhotoFiles).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ id: 'photo-1' }),
    ]));
    expect(result).toEqual({
      destination: {
        name: 'Home',
      },
      status: 'completed',
    });
  });

  it('submits queued food product photos, keeps staged files, shows queued feedback, and returns filtered Home', async () => {
    mockedSubmitFoodProductPhotoEntries.mockResolvedValue({
      photoCount: 1,
      queued: true,
    });

    const result = await submitProcessedPhotos(
      buildInput({
        isOnline: false,
        processType: 'foodProduct',
      }),
    );

    expect(mockedSubmitFoodProductPhotoEntries).toHaveBeenCalledWith(expect.objectContaining({
      foodProductForms: expect.any(Object),
    }));
    expect(invalidateQueries).not.toHaveBeenCalledWith({ queryKey: ['feature', 'restaurants'] });
    expect(mockedShowQueuedOfflineAlert).toHaveBeenCalledWith({
      analyticsSource: 'PhotoProcessingScreen',
      subject: 'Photo entries',
    });
    expect(mockedCleanupStagedPhotoFiles).not.toHaveBeenCalled();
    expect(mockedBuildFoodProductCreatedHomeParams).toHaveBeenCalled();
    expect(result).toEqual({
      destination: {
        name: 'Home',
        params: {
          createdFoodProduct: '1',
        },
      },
      status: 'queued',
    });
  });

  it('returns a failed result with preserved telemetry when the submit write fails', async () => {
    mockedSubmitRestaurantPhotoEntries.mockRejectedValue(new Error('Upload failed'));

    const result = await submitProcessedPhotos(buildInput());

    expect(result).toEqual({
      errorMessage: 'Upload failed',
      status: 'failed',
    });
    expect(mockedTrackObservabilityEvent).toHaveBeenCalledWith(
      'PHOTO_PROCESSING_SUBMIT_FAILED',
      expect.objectContaining({
        errorMessage: 'Upload failed',
        processType: 'restaurant',
      }),
    );
  });
});
