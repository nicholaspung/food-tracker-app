import type { ImagePickerAsset } from 'expo-image-picker';
import { useCallback, useState } from 'react';

import { buildLocalPhotoFile } from '../../lib/photoFiles';
import { resolvePhotoCaptureDate } from '../../lib/photoMetadata';
import {
  buildDefaultQuickTrackForm,
  type QuickTrackFormValues,
} from '../../lib/quickTrackForm';
import {
  buildDefaultRestaurantForm,
  extractCaptureCoordinates,
  type DraftPhotoAsset,
  type RestaurantPhotoForm,
} from './shared';

export function usePhotoProcessingDraftState() {
  const [photos, setPhotos] = useState<DraftPhotoAsset[]>([]);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [restaurantForms, setRestaurantForms] = useState<
    Record<string, RestaurantPhotoForm>
  >({});
  const [quickTrackForms, setQuickTrackForms] = useState<
    Record<string, QuickTrackFormValues>
  >({});
  const [locationMetadataHintDismissedByPhotoId, setLocationMetadataHintDismissedByPhotoId] =
    useState<Record<string, boolean>>({});

  const currentPhoto = photos[currentPhotoIndex] ?? null;
  const currentRestaurantForm = currentPhoto
    ? restaurantForms[currentPhoto.id]
    : undefined;
  const currentQuickTrackForm = currentPhoto
    ? quickTrackForms[currentPhoto.id]
    : undefined;

  const updateCurrentRestaurantForm = useCallback(
    (updates: Partial<RestaurantPhotoForm>) => {
      if (!currentPhoto) {
        return;
      }

      setRestaurantForms((current) => {
        const currentForm =
          current[currentPhoto.id] ??
          buildDefaultRestaurantForm(currentPhoto, undefined);
        return {
          ...current,
          [currentPhoto.id]: {
            ...currentForm,
            ...updates,
          },
        };
      });
    },
    [currentPhoto],
  );

  const updateCurrentQuickTrackForm = useCallback(
    (updates: Partial<QuickTrackFormValues>) => {
      if (!currentPhoto) {
        return;
      }

      setQuickTrackForms((current) => {
        const currentForm =
          current[currentPhoto.id] ??
          buildDefaultQuickTrackForm({
            captureDate: currentPhoto.captureDate,
          });
        return {
          ...current,
          [currentPhoto.id]: {
            ...currentForm,
            ...updates,
          },
        };
      });
    },
    [currentPhoto],
  );

  const dismissCurrentPhotoLocationHint = useCallback(() => {
    if (!currentPhoto?.captureCoordinates) {
      return;
    }

    setLocationMetadataHintDismissedByPhotoId((current) => {
      if (current[currentPhoto.id]) {
        return current;
      }

      return {
        ...current,
        [currentPhoto.id]: true,
      };
    });
  }, [currentPhoto]);

  const appendAssets = useCallback(async (assets: ImagePickerAsset[]) => {
    if (assets.length === 0) {
      return;
    }

    const resolvedAssets = await Promise.all(
      assets.map(async (asset) => ({
        asset,
        captureDate: await resolvePhotoCaptureDate(asset),
        captureCoordinates: extractCaptureCoordinates(asset),
      })),
    );

    setPhotos((current) => {
      const existingUris = new Set(current.map((photo) => photo.uri));
      const nextPhotos = [...current];
      const timestamp = Date.now();

      resolvedAssets.forEach(
        ({ asset, captureDate, captureCoordinates }, index) => {
          const nextPhoto = buildLocalPhotoFile(asset, {
            fallbackPrefix: 'photo',
          });
          if (!nextPhoto || existingUris.has(nextPhoto.uri)) {
            return;
          }

          nextPhotos.push({
            id: `${timestamp}-${index}-${asset.assetId ?? index}`,
            ...nextPhoto,
            captureDate,
            captureCoordinates,
          });
          existingUris.add(nextPhoto.uri);
        },
      );

      return nextPhotos;
    });
  }, []);

  const removePhoto = useCallback((photoId: string) => {
    setPhotos((current) => current.filter((photo) => photo.id !== photoId));
    setRestaurantForms((current) => {
      if (!current[photoId]) {
        return current;
      }

      const next = { ...current };
      delete next[photoId];
      return next;
    });
    setQuickTrackForms((current) => {
      if (!current[photoId]) {
        return current;
      }

      const next = { ...current };
      delete next[photoId];
      return next;
    });
    setLocationMetadataHintDismissedByPhotoId((current) => {
      if (!current[photoId]) {
        return current;
      }

      const next = { ...current };
      delete next[photoId];
      return next;
    });
  }, []);

  const resetDraftState = useCallback(() => {
    setPhotos([]);
    setCurrentPhotoIndex(0);
    setRestaurantForms({});
    setQuickTrackForms({});
    setLocationMetadataHintDismissedByPhotoId({});
  }, []);

  return {
    appendAssets,
    currentPhoto,
    currentPhotoIndex,
    currentQuickTrackForm,
    currentRestaurantForm,
    dismissCurrentPhotoLocationHint,
    locationMetadataHintDismissedByPhotoId,
    photos,
    quickTrackForms,
    removePhoto,
    resetDraftState,
    restaurantForms,
    setCurrentPhotoIndex,
    setQuickTrackForms,
    setRestaurantForms,
    updateCurrentQuickTrackForm,
    updateCurrentRestaurantForm,
  };
}
