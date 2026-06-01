import type * as ImagePicker from 'expo-image-picker';

import { resolvePhotoCaptureDate } from '../lib/photoMetadata';

const mockGetCreationTime = jest.fn<Promise<number | null>, []>();
const mockAssetConstructor = jest.fn();

jest.mock('expo-media-library', () => ({
  Asset: jest.fn().mockImplementation((assetId: string) => {
    mockAssetConstructor(assetId);

    return {
      getCreationTime: mockGetCreationTime,
    };
  }),
}));

function buildAsset(overrides: Record<string, unknown> = {}): ImagePicker.ImagePickerAsset {
  return {
    uri: 'file:///selected-photo.jpg',
    width: 1200,
    height: 900,
    ...overrides,
  } as ImagePicker.ImagePickerAsset;
}

describe('resolvePhotoCaptureDate', () => {
  beforeEach(() => {
    mockGetCreationTime.mockReset();
    mockAssetConstructor.mockClear();
  });

  it('uses current media library asset metadata when an asset id is available', async () => {
    const expectedDate = new Date('2026-04-06T12:00:00.000Z');
    mockGetCreationTime.mockResolvedValue(expectedDate.getTime());

    await expect(resolvePhotoCaptureDate(buildAsset({ assetId: 'asset-123' }))).resolves.toEqual(expectedDate);

    expect(mockAssetConstructor).toHaveBeenCalledWith('asset-123');
  });

  it('preserves EXIF date parsing when media library metadata is unavailable', async () => {
    mockGetCreationTime.mockResolvedValue(null);

    await expect(
      resolvePhotoCaptureDate(
        buildAsset({
          assetId: 'asset-without-creation-time',
          exif: {
            DateTimeOriginal: '2026:04:07 08:09:10',
          },
        }),
      ),
    ).resolves.toEqual(new Date(2026, 3, 7, 8, 9, 10));
  });

  it('parses numeric timestamps from picker assets', async () => {
    const expectedDate = new Date('2026-04-07T12:00:00.000Z');

    await expect(
      resolvePhotoCaptureDate(
        buildAsset({
          creationTime: expectedDate.getTime() / 1000,
        }),
      ),
    ).resolves.toEqual(expectedDate);

    expect(mockAssetConstructor).not.toHaveBeenCalled();
  });

  it('falls back gracefully when no metadata is present', async () => {
    await expect(resolvePhotoCaptureDate(buildAsset())).resolves.toBeNull();
  });

  it('falls back to EXIF metadata when media library lookup fails', async () => {
    mockGetCreationTime.mockRejectedValue(new Error('asset not found'));

    await expect(
      resolvePhotoCaptureDate(
        buildAsset({
          assetId: 'missing-asset',
          exif: {
            DateTimeDigitized: '2026:04:08 09:10:11Z',
          },
        }),
      ),
    ).resolves.toEqual(new Date('2026-04-08T09:10:11.000Z'));
  });
});
