import {
  buildPhotoFileUrl,
  buildPhotoPreviewUrls,
  buildPhotoThumbnailUrl,
  buildPhotoViewerState,
  buildPhotoViewerUrls,
} from '../lib/photoUrls';
import { buildPocketBaseFileUrl } from '../features/store/pocketbaseGateway';

jest.mock('../features/store/pocketbaseGateway', () => ({
  buildPocketBaseFileUrl: jest.fn(
    ({ collectionName, filename, recordId, thumb }) =>
      `${collectionName}/${recordId}/${filename}${thumb ? `?thumb=${thumb}` : ''}`,
  ),
}));

const mockedBuildPocketBaseFileUrl = jest.mocked(buildPocketBaseFileUrl);

describe('photoUrls', () => {
  beforeEach(() => {
    mockedBuildPocketBaseFileUrl.mockClear();
  });

  it('builds remote file URLs with the visit photo default collection', () => {
    expect(buildPhotoFileUrl({ id: 'photo-1', photo: 'ramen.jpg' })).toBe(
      'visit_photos/photo-1/ramen.jpg',
    );
  });

  it('builds note thumbnail URLs with an explicit collection', () => {
    expect(
      buildPhotoThumbnailUrl({ id: 'note-photo-1', photo: 'note.jpg' }, { collectionName: 'note_photos' }),
    ).toBe('note_photos/note-photo-1/note.jpg?thumb=100x100');
  });

  it('prefers local URIs', () => {
    expect(buildPhotoFileUrl({ id: 'local-1', photo: 'local.jpg', uri: 'file://local.jpg' })).toBe(
      'file://local.jpg',
    );
    expect(mockedBuildPocketBaseFileUrl).not.toHaveBeenCalled();
  });

  it('builds viewer URL arrays in order', () => {
    const photos = [
      { id: 'photo-1', photo: 'one.jpg' },
      { id: 'photo-2', photo: 'two.jpg' },
    ];

    expect(buildPhotoViewerUrls(photos)).toEqual([
      'visit_photos/photo-1/one.jpg',
      'visit_photos/photo-2/two.jpg',
    ]);
    expect(buildPhotoPreviewUrls(photos)).toEqual([
      'visit_photos/photo-1/one.jpg?thumb=100x100',
      'visit_photos/photo-2/two.jpg?thumb=100x100',
    ]);
  });

  it('bounds viewer initial index and supports photo ids', () => {
    const state = buildPhotoViewerState(
      [
        { id: 'photo-1', photo: 'one.jpg' },
        { id: 'photo-2', photo: 'two.jpg' },
      ],
      'photo-2',
    );

    expect(state.initialIndex).toBe(1);
    expect(buildPhotoViewerState(state.urls.map((url, index) => ({ id: `id-${index}`, photo: url })), 99).initialIndex).toBe(1);
  });
});
