import {
  buildFoodProductInputsFromPhotos,
  buildRestaurantVisitInputsFromPhotos,
  submitFoodProductPhotoEntries,
  submitRestaurantPhotoEntries,
  validateRestaurantPhotoSubmissionForm,
} from '../features/photoProcessing/photoSubmission';
import {
  createFoodProduct,
  createVisit,
  markNoteUsed,
} from '../features/store/featureStore';
import { promoteCachedNoteToUsed } from '../features/store/notesCache';

jest.mock('../features/store/featureStore', () => ({
  createFoodProduct: jest.fn(),
  createVisit: jest.fn(),
  markNoteUsed: jest.fn(),
}));

jest.mock('../features/store/notesCache', () => ({
  promoteCachedNoteToUsed: jest.fn(),
}));

jest.mock('../lib/dateFormatting', () => ({
  isValidLocalDate: jest.fn((value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)),
  localDateStringToUTC: jest.fn((value: string) => `${value}T00:00:00.000Z`),
}));

jest.mock('../lib/foodProductForm', () => ({
  buildCreateFoodProductInput: jest.fn((form, options) => ({
    itemName: form.itemName,
    rating: form.rating,
    photo: options.photo,
    sourceNoteId: options.sourceNoteId,
  })),
  validateFoodProductForm: jest.fn(() => null),
}));

const mockedCreateFoodProduct = createFoodProduct as jest.MockedFunction<typeof createFoodProduct>;
const mockedCreateVisit = createVisit as jest.MockedFunction<typeof createVisit>;
const mockedMarkNoteUsed = markNoteUsed as jest.MockedFunction<typeof markNoteUsed>;
const mockedPromoteCachedNoteToUsed = promoteCachedNoteToUsed as jest.MockedFunction<
  typeof promoteCachedNoteToUsed
>;

const photos = [
  {
    id: 'photo-1',
    mimeType: 'image/jpeg',
    name: 'photo-1.jpg',
    uri: 'file:///photo-1.jpg',
  },
  {
    id: 'photo-2',
    mimeType: 'image/jpeg',
    name: 'photo-2.jpg',
    uri: 'file:///photo-2.jpg',
  },
];

const restaurantForms = {
  'photo-1': {
    date: '2026-05-18',
    description: 'Rich broth',
    menuItemName: 'Ramen',
    notes: '',
    rating: 5,
    restaurantId: 'restaurant-1',
    restaurantName: 'Ramen House',
  },
  'photo-2': {
    date: '2026-05-18',
    description: '',
    menuItemName: 'Gyoza',
    notes: 'Crispy',
    rating: 4,
    restaurantId: 'restaurant-1',
    restaurantName: 'Ramen House',
  },
};

const foodProductForms = {
  'photo-1': {
    category: '',
    date: '2026-05-18',
    itemName: 'Sparkling Water',
    locationText: '',
    notes: '',
    rating: 4,
    visibility: 'friends' as const,
  },
};

describe('photo submission module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedCreateFoodProduct.mockResolvedValue({ id: 'food-product-1' } as never);
    mockedCreateVisit.mockResolvedValue({ id: 'visit-1' } as never);
    mockedMarkNoteUsed.mockResolvedValue({ id: 'note-1' } as never);
  });

  it('validates restaurant photo forms', () => {
    expect(
      validateRestaurantPhotoSubmissionForm({
        ...restaurantForms['photo-1'],
        menuItemName: '',
      }),
    ).toBe('Select a menu item before continuing.');

    expect(
      validateRestaurantPhotoSubmissionForm({
        ...restaurantForms['photo-1'],
        date: '05/18/2026',
      }),
    ).toBe('Date must use YYYY-MM-DD format.');

    expect(validateRestaurantPhotoSubmissionForm(restaurantForms['photo-1'])).toBeNull();
  });

  it('groups restaurant photos into one visit by restaurant and date', () => {
    const inputs = buildRestaurantVisitInputsFromPhotos({
      photos,
      restaurantForms,
      sourceNoteId: 'note-1',
      visitVisibility: 'friends',
    });

    expect(inputs).toEqual([
      expect.objectContaining({
        restaurantId: 'restaurant-1',
        restaurantName: 'Ramen House',
        sourceNoteId: 'note-1',
        visitedAt: '2026-05-18T00:00:00.000Z',
        visitedOn: '2026-05-18',
        visibility: 'friends',
        items: [
          expect.objectContaining({
            name: 'Ramen',
            rating: 5,
            photos: [{ uri: 'file:///photo-1.jpg', name: 'photo-1.jpg', mimeType: 'image/jpeg' }],
          }),
          expect.objectContaining({
            name: 'Gyoza',
            rating: 4,
            notes: 'Crispy',
            photos: [{ uri: 'file:///photo-2.jpg', name: 'photo-2.jpg', mimeType: 'image/jpeg' }],
          }),
        ],
      }),
    ]);
  });

  it('builds food product inputs with a source note only for single-photo submissions', () => {
    const inputs = buildFoodProductInputsFromPhotos({
      foodProductForms,
      photos: [photos[0]],
      sourceNoteId: 'note-1',
    });

    expect(inputs).toEqual([
      {
        itemName: 'Sparkling Water',
        rating: 4,
        photo: { uri: 'file:///photo-1.jpg', name: 'photo-1.jpg', mimeType: 'image/jpeg' },
        sourceNoteId: 'note-1',
      },
    ]);
  });

  it('queues restaurant visit creation and persists source note usage for queued single-visit submissions', async () => {
    const queryClient = {};
    const writeFeature = jest.fn()
      .mockResolvedValueOnce({ status: 'queued' })
      .mockResolvedValueOnce({ status: 'queued' });

    const result = await submitRestaurantPhotoEntries({
      noteId: 'note-1',
      photos,
      queryClient: queryClient as never,
      restaurantForms,
      visitVisibility: 'friends',
      writeFeature: writeFeature as never,
    });

    expect(writeFeature).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        operationName: 'visit.create',
        offline: expect.objectContaining({
          strategy: 'outbox',
          payload: expect.objectContaining({
            restaurantId: 'restaurant-1',
            sourceNoteId: 'note-1',
          }),
        }),
      }),
    );
    expect(writeFeature).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        operationName: 'note.mark-used',
        trackOnlineWrite: false,
      }),
    );
    expect(mockedCreateVisit).not.toHaveBeenCalled();
    expect(mockedPromoteCachedNoteToUsed).toHaveBeenCalledWith(
      queryClient,
      expect.objectContaining({ noteId: 'note-1' }),
    );
    expect(result).toEqual({ photoCount: 2, queued: true, visitCount: 1 });
  });

  it('runs food product creation online and promotes the source note for completed single-photo submissions', async () => {
    const queryClient = {};
    const writeFeature = jest.fn(async ({ execute }) => ({
      result: await execute(),
      status: 'completed' as const,
    }));

    const result = await submitFoodProductPhotoEntries({
      foodProductForms,
      noteId: 'note-1',
      photos: [photos[0]],
      queryClient: queryClient as never,
      writeFeature: writeFeature as never,
    });

    expect(writeFeature).toHaveBeenCalledWith(
      expect.objectContaining({
        operationName: 'food-product.create',
        offline: expect.objectContaining({
          strategy: 'outbox',
          payload: expect.objectContaining({
            itemName: 'Sparkling Water',
            sourceNoteId: 'note-1',
          }),
        }),
      }),
    );
    expect(mockedCreateFoodProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        itemName: 'Sparkling Water',
        sourceNoteId: 'note-1',
      }),
    );
    expect(mockedMarkNoteUsed).not.toHaveBeenCalled();
    expect(mockedPromoteCachedNoteToUsed).toHaveBeenCalledWith(
      queryClient,
      expect.objectContaining({ noteId: 'note-1' }),
    );
    expect(result).toEqual({ photoCount: 1, queued: false });
  });
});
