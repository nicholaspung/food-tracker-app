import { localDateStringToUTC } from '../lib/dateFormatting';
import {
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
        rating: 4,
        notes: 'Smooth and sweet',
        visibility: 'private',
        itemDate: '2026-04-12T18:30:00.000Z',
        createdAt: '2026-04-12T18:30:00.000Z',
        updatedAt: '2026-04-12T18:30:00.000Z',
      }),
    ).toEqual({
      itemName: 'Iced Coffee',
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
        rating: 3,
        notes: undefined,
        visibility: undefined,
        itemDate: 'invalid-date',
        createdAt: '2026-04-12T18:30:00.000Z',
        updatedAt: '2026-04-12T18:30:00.000Z',
      }),
    ).toEqual({
      itemName: 'Soup',
      category: '',
      rating: 3,
      notes: '',
      visibility: 'friends',
      date: expect.any(String),
    });

    expect(
      buildUpdateQuickTrackInput(
        {
          itemName: '  Updated Latte  ',
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
