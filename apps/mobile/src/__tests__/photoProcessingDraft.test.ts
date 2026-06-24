import {
  initializeRestaurantPhotoGrouping,
  movePhotoToRestaurantGroup,
  normalizeRestaurantPhotoGroups,
  removePhotoFromPhotoProcessingDraft,
  replaceRestaurantGroupPhoto,
  splitPhotoToRestaurantGroup,
  type PhotoProcessingDraftSnapshot,
} from '../features/photoProcessing/photoProcessingDraft';
import type { DraftPhotoAsset } from '../features/photoProcessing/photoProcessingTypes';

function photo(id: string): DraftPhotoAsset {
  return {
    id,
    captureCoordinates: null,
    captureDate: null,
    metadataDate: null,
    mimeType: 'image/jpeg',
    name: `${id}.jpg`,
    uri: `file:///${id}.jpg`,
  };
}

const restaurantForm = {
  date: '2026-06-24',
  description: '',
  menuItemId: '',
  menuItemName: 'Noodles',
  notes: '',
  rating: 4,
  restaurantId: 'restaurant-1',
  restaurantName: 'Test Restaurant',
};

const foodProductForm = {
  category: 'snack',
  date: '2026-06-24',
  itemName: 'Bar',
  locationText: '',
  notes: '',
  rating: 3,
  visibility: 'friends' as const,
};

describe('photoProcessingDraft', () => {
  it('normalizes restaurant photo groups by removing duplicate photos and empty groups', () => {
    expect(
      normalizeRestaurantPhotoGroups([
        { id: 'group-1', photoIds: ['photo-1', 'photo-2'] },
        { id: 'group-1', photoIds: ['photo-2', 'photo-3'] },
        { id: 'group-3', photoIds: ['photo-1'] },
      ]),
    ).toEqual([
      { id: 'group-1', photoIds: ['photo-1', 'photo-2'] },
      { id: 'group-1-1', photoIds: ['photo-3'] },
    ]);
  });

  it('initializes one restaurant item group for each draft photo', () => {
    expect(initializeRestaurantPhotoGrouping([photo('photo-1'), photo('photo-2')])).toEqual({
      currentPhotoIndex: 0,
      restaurantForms: {},
      restaurantPhotoGroups: [
        { id: 'restaurant-photo-group-photo-1', photoIds: ['photo-1'] },
        { id: 'restaurant-photo-group-photo-2', photoIds: ['photo-2'] },
      ],
      selectedRestaurantPhotoGroupId: 'restaurant-photo-group-photo-1',
    });
  });

  it('removes a photo through one draft transition across forms, groups, selection, and index', () => {
    const snapshot: PhotoProcessingDraftSnapshot = {
      currentPhotoIndex: 2,
      foodProductForms: {
        'photo-2': foodProductForm,
      },
      locationMetadataHintDismissedByPhotoId: {
        'photo-2': true,
      },
      photos: [photo('photo-1'), photo('photo-2'), photo('photo-3')],
      restaurantForms: {
        'photo-2': restaurantForm,
        'restaurant-photo-group-photo-1': restaurantForm,
        'restaurant-photo-group-photo-3': restaurantForm,
      },
      restaurantPhotoGroups: [
        { id: 'restaurant-photo-group-photo-1', photoIds: ['photo-1', 'photo-2'] },
        { id: 'restaurant-photo-group-photo-3', photoIds: ['photo-3'] },
      ],
      selectedRestaurantPhotoGroupId: 'restaurant-photo-group-photo-1',
    };

    expect(
      removePhotoFromPhotoProcessingDraft({
        photoId: 'photo-2',
        snapshot,
      }),
    ).toEqual({
      currentPhotoIndex: 1,
      foodProductForms: {},
      locationMetadataHintDismissedByPhotoId: {},
      photos: [photo('photo-1'), photo('photo-3')],
      restaurantForms: {
        'restaurant-photo-group-photo-1': restaurantForm,
        'restaurant-photo-group-photo-3': restaurantForm,
      },
      restaurantPhotoGroups: [
        { id: 'restaurant-photo-group-photo-1', photoIds: ['photo-1'] },
        { id: 'restaurant-photo-group-photo-3', photoIds: ['photo-3'] },
      ],
      selectedRestaurantPhotoGroupId: 'restaurant-photo-group-photo-1',
    });
  });

  it('removes the form for a restaurant group when its last photo is removed', () => {
    const snapshot: PhotoProcessingDraftSnapshot = {
      currentPhotoIndex: 1,
      foodProductForms: {},
      locationMetadataHintDismissedByPhotoId: {},
      photos: [photo('photo-1'), photo('photo-2')],
      restaurantForms: {
        'restaurant-photo-group-photo-1': restaurantForm,
        'restaurant-photo-group-photo-2': {
          ...restaurantForm,
          menuItemName: 'Soup',
        },
      },
      restaurantPhotoGroups: [
        { id: 'restaurant-photo-group-photo-1', photoIds: ['photo-1'] },
        { id: 'restaurant-photo-group-photo-2', photoIds: ['photo-2'] },
      ],
      selectedRestaurantPhotoGroupId: 'restaurant-photo-group-photo-2',
    };

    expect(
      removePhotoFromPhotoProcessingDraft({
        photoId: 'photo-2',
        snapshot,
      }),
    ).toEqual({
      currentPhotoIndex: 0,
      foodProductForms: {},
      locationMetadataHintDismissedByPhotoId: {},
      photos: [photo('photo-1')],
      restaurantForms: {
        'restaurant-photo-group-photo-1': restaurantForm,
      },
      restaurantPhotoGroups: [
        { id: 'restaurant-photo-group-photo-1', photoIds: ['photo-1'] },
      ],
      selectedRestaurantPhotoGroupId: 'restaurant-photo-group-photo-1',
    });
  });

  it('moves a photo into a group at the draft seam and enforces per-item limits there', () => {
    const restaurantPhotoGroups = [
      { id: 'group-1', photoIds: ['photo-1'] },
      { id: 'group-2', photoIds: ['photo-2'] },
    ];

    expect(
      movePhotoToRestaurantGroup({
        maxPhotosPerRestaurantItem: 1,
        photoId: 'photo-2',
        restaurantPhotoGroups,
        targetGroupId: 'group-1',
      }),
    ).toEqual({
      status: 'limit_reached',
      message:
        'Free users can keep one photo per menu item. Keep this photo as its own item, or replace the selected item photo.',
      restaurantPhotoGroups,
      selectedRestaurantPhotoGroupId: 'group-1',
    });

    expect(
      movePhotoToRestaurantGroup({
        maxPhotosPerRestaurantItem: 2,
        photoId: 'photo-2',
        restaurantPhotoGroups,
        targetGroupId: 'group-1',
      }),
    ).toEqual({
      status: 'changed',
      restaurantPhotoGroups: [{ id: 'group-1', photoIds: ['photo-1', 'photo-2'] }],
      selectedRestaurantPhotoGroupId: 'group-1',
    });
  });

  it('replaces and splits restaurant group photos through draft transitions', () => {
    const restaurantPhotoGroups = [
      { id: 'group-1', photoIds: ['photo-1', 'photo-2'] },
      { id: 'group-3', photoIds: ['photo-3'] },
    ];

    expect(
      replaceRestaurantGroupPhoto({
        photoId: 'photo-3',
        restaurantPhotoGroups,
        targetGroupId: 'group-1',
      }),
    ).toEqual({
      status: 'changed',
      restaurantPhotoGroups: [
        { id: 'group-1', photoIds: ['photo-3'] },
        { id: 'restaurant-photo-group-photo-1', photoIds: ['photo-1'] },
        { id: 'restaurant-photo-group-photo-2', photoIds: ['photo-2'] },
      ],
      selectedRestaurantPhotoGroupId: 'group-1',
    });

    expect(
      splitPhotoToRestaurantGroup({
        photoId: 'photo-2',
        restaurantPhotoGroups,
      }),
    ).toEqual({
      status: 'changed',
      restaurantPhotoGroups: [
        { id: 'group-1', photoIds: ['photo-1'] },
        { id: 'group-3', photoIds: ['photo-3'] },
        { id: 'restaurant-photo-group-photo-2', photoIds: ['photo-2'] },
      ],
      selectedRestaurantPhotoGroupId: 'restaurant-photo-group-photo-2',
    });
  });
});
