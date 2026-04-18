import { buildDefaultQuickTrackForm } from '../lib/quickTrackForm';
import {
  buildDefaultRestaurantForm,
  resolveDraftPhotoDetectedDateValue,
  type DraftPhotoAsset,
} from '../screens/photoProcessing/shared';

function buildDraftPhotoAsset(
  overrides: Partial<DraftPhotoAsset> = {},
): DraftPhotoAsset {
  return {
    id: 'photo-1',
    uri: 'file:///tmp/photo-1.jpg',
    name: 'photo-1.jpg',
    mimeType: 'image/jpeg',
    captureDate: null,
    captureCoordinates: null,
    metadataDate: null,
    ...overrides,
  };
}

describe('resolveDraftPhotoDetectedDateValue', () => {
  it('prefers captureDate over metadataDate', () => {
    const photo = buildDraftPhotoAsset({
      captureDate: new Date('2026-04-10T12:00:00.000Z'),
      metadataDate: '2026-04-08 15:00:00.000Z',
    });

    expect(resolveDraftPhotoDetectedDateValue(photo)).toBe('2026-04-10');
  });

  it('falls back to metadataDate when captureDate is null', () => {
    const photo = buildDraftPhotoAsset({
      metadataDate: '2026-04-08 15:00:00.000Z',
    });

    expect(resolveDraftPhotoDetectedDateValue(photo)).toBe('2026-04-08');
  });

  it('returns null when captureDate and metadataDate are unusable', () => {
    const photo = buildDraftPhotoAsset({
      metadataDate: 'invalid-date-value',
    });

    expect(resolveDraftPhotoDetectedDateValue(photo)).toBeNull();
  });
});

describe('photo-processing default forms', () => {
  it('uses the detected metadata fallback date for restaurant forms', () => {
    const photo = buildDraftPhotoAsset({
      metadataDate: '2026-04-08 15:00:00.000Z',
    });

    expect(buildDefaultRestaurantForm(photo, undefined).date).toBe('2026-04-08');
  });

  it('honors detectedDateValue for quick-track forms', () => {
    expect(
      buildDefaultQuickTrackForm({
        detectedDateValue: '2026-04-08',
      }).date,
    ).toBe('2026-04-08');
  });
});
