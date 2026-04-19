import { localDateStringToUTC } from '../lib/dateFormatting';
import {
  buildCreateQuickTrackInput,
  buildDefaultQuickTrackForm,
  buildQuickTrackFormFromRecord,
  buildUpdateQuickTrackInput,
} from '../lib/quickTrackForm';

jest.mock('../features', () => ({
  resolveDefaultVisitVisibilityFromAuth: jest.fn(() => 'friends'),
}));

describe('quickTrackForm', () => {
  it('builds form values from a quick-track record', () => {
    expect(
      buildQuickTrackFormFromRecord({
        id: 'quick-track-1',
        restaurantName: 'Quick Track',
        itemCategory: 'packaged_food',
        itemName: 'Iced Coffee',
        locationText: 'Mission District',
        rating: 4,
        notes: 'Smooth and sweet',
        visibility: 'private',
        itemDate: '2026-04-12T18:30:00.000Z',
        createdAt: '2026-04-12T18:30:00.000Z',
        updatedAt: '2026-04-12T18:30:00.000Z',
      }),
    ).toEqual({
      itemName: 'Iced Coffee',
      locationText: 'Mission District',
      category: 'packaged_food',
      rating: 4,
      notes: 'Smooth and sweet',
      visibility: 'private',
      date: '2026-04-12',
    });
  });

  it('normalizes unsupported edit categories and builds a photo-aware update payload', () => {
    expect(
      buildQuickTrackFormFromRecord({
        id: 'quick-track-2',
        restaurantName: 'Quick Track',
        itemCategory: 'restaurant',
        itemName: 'Soup',
        locationText: undefined,
        rating: 3,
        notes: undefined,
        visibility: undefined,
        itemDate: 'invalid-date',
        createdAt: '2026-04-12T18:30:00.000Z',
        updatedAt: '2026-04-12T18:30:00.000Z',
      }),
    ).toEqual({
      itemName: 'Soup',
      locationText: '',
      category: '',
      rating: 3,
      notes: '',
      visibility: 'friends',
      date: expect.any(String),
    });

    expect(
      buildDefaultQuickTrackForm({
        previousForm: {
          itemName: 'Previous Snack',
          locationText: 'Downtown',
          category: 'other',
          rating: 2,
          notes: 'Previous notes',
          visibility: 'private',
          date: '2026-04-16',
        },
      }),
    ).toEqual({
      itemName: '',
      locationText: 'Downtown',
      category: 'other',
      rating: 3,
      notes: '',
      visibility: 'private',
      date: expect.any(String),
    });

    expect(
      buildCreateQuickTrackInput({
        itemName: '  Croissant  ',
        locationText: '  Ferry Building  ',
        category: 'packaged_food',
        rating: 4,
        notes: '  Buttery  ',
        visibility: 'friends',
        date: '2026-04-18',
      }),
    ).toEqual({
      itemName: 'Croissant',
      locationText: 'Ferry Building',
      rating: 4,
      itemCategory: 'packaged_food',
      notes: 'Buttery',
      visibility: 'friends',
      itemDate: localDateStringToUTC('2026-04-18'),
    });

    expect(
      buildUpdateQuickTrackInput(
        {
          itemName: '  Updated Latte  ',
          locationText: '',
          category: '',
          rating: 5,
          notes: 'Keep foam',
          visibility: 'friends',
          date: '2026-04-18',
        },
        {
          newPhoto: {
            uri: 'file:///latte.jpg',
            name: 'latte.jpg',
            mimeType: 'image/jpeg',
          },
          deletePhotoIds: ['photo-1', '', 'photo-2'],
        },
      ),
    ).toEqual({
      itemName: 'Updated Latte',
      locationText: '',
      rating: 5,
      itemCategory: null,
      notes: 'Keep foam',
      visibility: 'friends',
      itemDate: localDateStringToUTC('2026-04-18'),
      newPhoto: {
        uri: 'file:///latte.jpg',
        name: 'latte.jpg',
        mimeType: 'image/jpeg',
      },
      deletePhotoIds: ['photo-1', 'photo-2'],
    });
  });
});
