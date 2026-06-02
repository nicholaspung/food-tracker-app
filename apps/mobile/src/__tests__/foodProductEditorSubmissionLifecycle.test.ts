import {
  submitCreateFoodProductEditor,
  submitEditFoodProductEditor,
  type SubmitCreateFoodProductEditorInput,
  type SubmitEditFoodProductEditorInput,
} from '../features/foodProducts/foodProductEditorSubmissionLifecycle';
import { cleanupStagedPhotoFiles } from '../lib/photoStaging';
import { buildFoodProductCreatedHomeParams } from '../navigation/homeRouteParams';
import { trackObservabilityEvent } from '../observability';
import { trackFirstFoodLogged, trackProductEvent } from '../observability/productAnalytics';
import { formatLimitExceededMessage, parseLimitExceededError } from '../features/store';

jest.mock('../lib/photoStaging', () => ({
  cleanupStagedPhotoFiles: jest.fn(),
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

jest.mock('../features/store', () => ({
  formatLimitExceededMessage: jest.fn((payload: { message?: string }) => payload.message ?? 'Limit exceeded'),
  parseLimitExceededError: jest.fn(() => null),
}));

const mockedCleanupStagedPhotoFiles = cleanupStagedPhotoFiles as jest.MockedFunction<
  typeof cleanupStagedPhotoFiles
>;
const mockedBuildFoodProductCreatedHomeParams = buildFoodProductCreatedHomeParams as jest.MockedFunction<
  typeof buildFoodProductCreatedHomeParams
>;
const mockedTrackObservabilityEvent = trackObservabilityEvent as jest.MockedFunction<
  typeof trackObservabilityEvent
>;
const mockedTrackFirstFoodLogged = trackFirstFoodLogged as jest.MockedFunction<
  typeof trackFirstFoodLogged
>;
const mockedTrackProductEvent = trackProductEvent as jest.MockedFunction<typeof trackProductEvent>;
const mockedFormatLimitExceededMessage = formatLimitExceededMessage as jest.MockedFunction<
  typeof formatLimitExceededMessage
>;
const mockedParseLimitExceededError = parseLimitExceededError as jest.MockedFunction<
  typeof parseLimitExceededError
>;

const draftPhoto = {
  label: 'May 20, 2026',
  upload: {
    mimeType: 'image/jpeg',
    name: 'food.jpg',
    uri: 'file:///photo-staging/food.jpg',
  },
};

const validForm = {
  category: 'Snacks',
  date: '2026-05-20',
  itemName: 'Chocolate Bar',
  locationText: 'Corner Market',
  notes: 'Good texture',
  rating: 4,
  visibility: 'friends' as const,
};

const monthlyUsageAtLimit = {
  usage: {
    photoUploads: 100,
  },
};

describe('food product editor submission lifecycle', () => {
  const createFoodProduct = jest.fn();
  const updateFoodProduct = jest.fn();
  const markRatedBefore = jest.fn();

  function buildCreateInput(
    overrides: Partial<SubmitCreateFoodProductEditorInput> = {},
  ): SubmitCreateFoodProductEditorInput {
    return {
      foodProductWrites: {
        createFoodProduct,
      },
      form: validForm,
      isDisplayFreeUser: false,
      isOnline: true,
      markRatedBefore,
      monthlyUsageSnapshot: null,
      photo: draftPhoto,
      shouldEnforceUsageLimitsClientSide: false,
      source: 'FoodProductScreen',
      ...overrides,
    };
  }

  function buildEditInput(
    overrides: Partial<SubmitEditFoodProductEditorInput> = {},
  ): SubmitEditFoodProductEditorInput {
    return {
      foodProductId: 'food-product-1',
      foodProductWrites: {
        updateFoodProduct,
      },
      form: validForm,
      isDisplayFreeUser: false,
      isOnline: true,
      monthlyUsageSnapshot: null,
      photoMode: 'replace',
      primaryExistingPhotoId: 'photo-1',
      replacementPhoto: draftPhoto,
      shouldEnforceUsageLimitsClientSide: false,
      source: 'EditFoodProductScreen',
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    createFoodProduct.mockResolvedValue({
      result: { id: 'food-product-1' },
      status: 'completed',
    });
    updateFoodProduct.mockResolvedValue({
      result: { id: 'food-product-1' },
      status: 'completed',
    });
    markRatedBefore.mockResolvedValue(undefined);
    mockedCleanupStagedPhotoFiles.mockResolvedValue(undefined);
    mockedParseLimitExceededError.mockReturnValue(null);
  });

  it('blocks create on validation failure before writes', async () => {
    const result = await submitCreateFoodProductEditor(
      buildCreateInput({
        form: {
          ...validForm,
          itemName: '',
        },
      }),
    );

    expect(result).toEqual({
      errorMessage: 'Food product name is required.',
      status: 'blocked',
    });
    expect(createFoodProduct).not.toHaveBeenCalled();
    expect(mockedTrackObservabilityEvent).toHaveBeenCalledWith(
      'FOOD_PRODUCT_SUBMIT_VALIDATION_FAILED',
      expect.objectContaining({
        validationMessage: 'Food product name is required.',
      }),
    );
  });

  it('blocks create when client photo quota would be exceeded', async () => {
    const result = await submitCreateFoodProductEditor(
      buildCreateInput({
        isDisplayFreeUser: true,
        monthlyUsageSnapshot: monthlyUsageAtLimit,
        shouldEnforceUsageLimitsClientSide: true,
      }),
    );

    expect(result).toMatchObject({
      errorMessage: 'Free users can upload up to 100 photos per month. Remaining estimate: 0.',
      status: 'blocked',
    });
    expect(createFoodProduct).not.toHaveBeenCalled();
    expect(mockedTrackProductEvent).toHaveBeenCalledWith(
      'quality.usage_limit_reached',
      expect.objectContaining({
        enforcement: 'client_estimate',
      }),
    );
  });

  it('maps server quota failure to the formatted create error', async () => {
    const error = new Error('limit');
    createFoodProduct.mockRejectedValue(error);
    mockedParseLimitExceededError.mockReturnValue({
      code: 'LIMIT_EXCEEDED',
      limit: 100,
      message: 'Monthly photo upload limit reached.',
      metric: 'photo_uploads',
      monthKey: '2026-05',
      remaining: 0,
      success: false,
      used: 100,
      userTier: 'free',
    });
    mockedFormatLimitExceededMessage.mockReturnValue('Photo upload limit reached (100).');

    const result = await submitCreateFoodProductEditor(buildCreateInput());

    expect(result).toEqual({
      errorMessage: 'Photo upload limit reached (100).',
      status: 'failed',
    });
    expect(mockedTrackObservabilityEvent).toHaveBeenCalledWith(
      'USAGE_LIMIT_REACHED',
      expect.objectContaining({
        enforcement: 'server',
      }),
    );
    expect(mockedTrackProductEvent).toHaveBeenCalledWith(
      'quality.usage_limit_reached',
      expect.objectContaining({
        enforcement: 'server',
      }),
    );
  });

  it('returns queued create without cleaning staged photos or marking rated before', async () => {
    createFoodProduct.mockResolvedValue({ status: 'queued' });

    const result = await submitCreateFoodProductEditor(
      buildCreateInput({
        sourceNoteId: 'note-1',
      }),
    );

    expect(createFoodProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          itemName: 'Chocolate Bar',
          photo: draftPhoto.upload,
          sourceNoteId: 'note-1',
        }),
        sourceNote: expect.objectContaining({
          noteId: 'note-1',
          usedAt: expect.any(String),
        }),
      }),
    );
    expect(mockedCleanupStagedPhotoFiles).not.toHaveBeenCalled();
    expect(markRatedBefore).not.toHaveBeenCalled();
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

  it('returns completed create, cleans staged photos, marks rated before, and records completion analytics', async () => {
    const result = await submitCreateFoodProductEditor(buildCreateInput());

    expect(mockedCleanupStagedPhotoFiles).toHaveBeenCalledWith([draftPhoto.upload]);
    expect(markRatedBefore).toHaveBeenCalled();
    expect(mockedTrackFirstFoodLogged).toHaveBeenCalledWith(
      expect.objectContaining({
        completed: true,
        entryType: 'food_product',
      }),
    );
    expect(mockedBuildFoodProductCreatedHomeParams).toHaveBeenCalled();
    expect(result).toEqual({
      destination: {
        name: 'Home',
        params: {
          createdFoodProduct: '1',
        },
      },
      status: 'completed',
    });
  });

  it('blocks edit on validation failure before writes', async () => {
    const result = await submitEditFoodProductEditor(
      buildEditInput({
        form: {
          ...validForm,
          date: 'not-a-date',
        },
      }),
    );

    expect(result).toEqual({
      errorMessage: 'Please choose a valid date.',
      status: 'blocked',
    });
    expect(updateFoodProduct).not.toHaveBeenCalled();
    expect(mockedTrackObservabilityEvent).toHaveBeenCalledWith(
      'EDIT_FOOD_PRODUCT_SUBMIT_VALIDATION_FAILED',
      expect.objectContaining({
        reason: 'invalid_item_date',
      }),
    );
  });

  it('blocks edit when client photo quota would be exceeded', async () => {
    const result = await submitEditFoodProductEditor(
      buildEditInput({
        isDisplayFreeUser: true,
        monthlyUsageSnapshot: monthlyUsageAtLimit,
        shouldEnforceUsageLimitsClientSide: true,
      }),
    );

    expect(result).toMatchObject({
      errorMessage: 'Free users can upload up to 100 photos per month. Remaining estimate: 0.',
      status: 'blocked',
    });
    expect(updateFoodProduct).not.toHaveBeenCalled();
  });

  it('returns queued edit without cleaning staged photos', async () => {
    updateFoodProduct.mockResolvedValue({ status: 'queued' });

    const result = await submitEditFoodProductEditor(buildEditInput());

    expect(updateFoodProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        foodProductId: 'food-product-1',
        includeFoodProductPhotos: true,
        includeUsage: true,
        updates: expect.objectContaining({
          deletePhotoIds: ['photo-1'],
          newPhoto: draftPhoto.upload,
        }),
      }),
    );
    expect(mockedCleanupStagedPhotoFiles).not.toHaveBeenCalled();
    expect(mockedTrackObservabilityEvent).toHaveBeenCalledWith(
      'EDIT_FOOD_PRODUCT_SUBMIT_STARTED',
      expect.not.objectContaining({
        extraLegacyPhotoCount: expect.anything(),
      }),
    );
    expect(result).toEqual({
      destination: { name: 'Previous' },
      status: 'queued',
    });
  });

  it('returns completed edit and cleans staged photos', async () => {
    const result = await submitEditFoodProductEditor(buildEditInput());

    expect(mockedCleanupStagedPhotoFiles).toHaveBeenCalledWith([draftPhoto.upload]);
    expect(result).toEqual({
      destination: { name: 'Previous' },
      status: 'completed',
    });
  });

  it('returns failed edit when the write fails', async () => {
    updateFoodProduct.mockRejectedValue(new Error('Could not update'));

    const result = await submitEditFoodProductEditor(buildEditInput());

    expect(result).toEqual({
      errorMessage: 'Could not update',
      status: 'failed',
    });
    expect(mockedTrackObservabilityEvent).toHaveBeenCalledWith(
      'EDIT_FOOD_PRODUCT_SUBMIT_FAILED',
      expect.objectContaining({
        error: 'Could not update',
      }),
    );
  });
});
