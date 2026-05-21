import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { submitProcessedPhotos } from '../features';
import { buildFoodProductCreatedHomeParams } from '../navigation/homeRouteParams';
import { usePhotoProcessingSubmission } from '../screens/photoProcessing/usePhotoProcessingSubmission';

jest.mock('../features', () => ({
  createFoodProduct: jest.fn(),
  createVisit: jest.fn(),
  formatLimitExceededMessage: jest.fn((payload: { message?: string }) => payload.message ?? 'Limit exceeded'),
  homeFeedMapQueryKeys: {
    root: ['feature', 'homeFeedMap'],
  },
  homeFeedQueryKeys: {
    root: ['feature', 'homeFeed'],
  },
  markNoteUsed: jest.fn(),
  parseLimitExceededError: jest.fn(() => null),
  promoteCachedNoteToUsed: jest.fn(),
  restaurantsQueryKeys: {
    root: ['feature', 'restaurants'],
  },
  submitProcessedPhotos: jest.fn(),
}));

jest.mock('../features/store/notesQuery', () => ({
  notesQueryKeys: {
    detail: (noteId: string) => ['feature', 'notes', 'detail', noteId],
  },
}));

jest.mock('../lib/dateFormatting', () => ({
  isValidLocalDate: jest.fn(() => true),
  localDateStringToUTC: jest.fn((value: string) => `${value}T00:00:00.000Z`),
}));

jest.mock('../lib/offlineAlerts', () => ({
  showQueuedOfflineAlert: jest.fn(),
}));

jest.mock('../lib/foodProductForm', () => ({
  buildCreateFoodProductInput: jest.fn((form: { itemName?: string }) => ({
    itemName: form.itemName ?? 'Created food product',
  })),
  buildDefaultFoodProductForm: jest.fn(() => ({
    category: '',
    date: '2026-04-20',
    itemName: '',
    locationText: '',
    notes: '',
    rating: 4,
    visibility: 'friends',
  })),
  validateFoodProductForm: jest.fn(() => null),
}));

jest.mock('../observability', () => ({
  trackObservabilityEvent: jest.fn(),
}));

jest.mock('../screens/photoProcessing/shared', () => ({
  buildDefaultRestaurantForm: jest.fn(() => ({
    date: '2026-04-20',
    menuItemName: '',
    rating: 4,
    restaurantId: '',
    restaurantName: '',
  })),
  buildPhotoUploadInput: jest.fn(() => ({
    mimeType: 'image/jpeg',
    name: 'photo.jpg',
    uri: 'file:///photo.jpg',
  })),
  FREE_MONTHLY_PHOTO_LIMIT: 100,
  resolveDraftPhotoDetectedDateValue: jest.fn(() => null),
}));

describe('usePhotoProcessingSubmission', () => {
  const mockedSubmitProcessedPhotos = submitProcessedPhotos as jest.MockedFunction<
    typeof submitProcessedPhotos
  >;
  const queryClient = {
    invalidateQueries: jest.fn().mockResolvedValue(undefined),
  };
  const setErrorMessage = jest.fn();
  const setStep = jest.fn();

  beforeEach(() => {
    queryClient.invalidateQueries.mockClear();
    setErrorMessage.mockClear();
    setStep.mockClear();
    mockedSubmitProcessedPhotos.mockResolvedValue({
      destination: {
        name: 'Home',
        params: buildFoodProductCreatedHomeParams(),
      },
      status: 'completed',
    });
  });

  function renderSubmissionHook(
    overrideParams: Partial<Parameters<typeof usePhotoProcessingSubmission>[0]> = {},
  ) {
    let hookResult: ReturnType<typeof usePhotoProcessingSubmission> | null = null;
    let renderer: ReactTestRenderer | null = null;

    function TestComponent() {
      hookResult = usePhotoProcessingSubmission({
        currentFoodProductForm: {
          category: '',
          date: '2026-04-20',
          itemName: 'Sparkling Water',
          locationText: '',
          notes: '',
          rating: 4,
          visibility: 'friends',
        },
        currentPhoto: null,
        currentPhotoIndex: 0,
        currentRestaurantForm: {
          date: '2026-04-20',
          description: '',
          menuItemId: 'menu-item-1',
          menuItemName: 'Burger',
          notes: '',
          rating: 4,
          restaurantId: 'restaurant-1',
          restaurantName: 'Corner Spot',
        },
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
        goToProcessPhoto: jest.fn(),
        isDisplayFreeUser: false,
        isOnline: true,
        monthlyUsageSnapshot: null,
        navigation: {
          navigate: jest.fn(),
        } as never,
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
        processType: 'foodProduct',
        queryClient: queryClient as never,
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
        setErrorMessage,
        setStep,
        shouldEnforceUsageLimitsClientSide: false,
        visitVisibility: 'friends',
        writeFeature: jest.fn().mockResolvedValue({
          result: {
            id: 'created-record-1',
          },
          status: 'completed',
        }) as never,
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

  it('navigates to the filtered Home success view after food product submission', async () => {
    const navigate = jest.fn();
    const hook = renderSubmissionHook({
      navigation: {
        navigate,
      } as never,
      processType: 'foodProduct',
    });

    await hook.mount();

    await act(async () => {
      await hook.getResult()?.handleSubmitAll();
    });

    expect(mockedSubmitProcessedPhotos).toHaveBeenCalledWith(expect.objectContaining({
      processType: 'foodProduct',
    }));
    expect(navigate).toHaveBeenCalledWith('Home', buildFoodProductCreatedHomeParams());

    await hook.unmount();
  });

  it('keeps the plain Home redirect for restaurant submissions', async () => {
    const navigate = jest.fn();
    mockedSubmitProcessedPhotos.mockResolvedValue({
      destination: {
        name: 'Home',
      },
      status: 'completed',
    });
    const hook = renderSubmissionHook({
      navigation: {
        navigate,
      } as never,
      processType: 'restaurant',
    });

    await hook.mount();

    await act(async () => {
      await hook.getResult()?.handleSubmitAll();
    });

    expect(mockedSubmitProcessedPhotos).toHaveBeenCalledWith(expect.objectContaining({
      processType: 'restaurant',
    }));
    expect(navigate).toHaveBeenCalledWith('Home');

    await hook.unmount();
  });
});
