import type { ImagePickerAsset } from 'expo-image-picker';
import { useCallback, useState } from 'react';

import { buildLocalPhotoFile } from '../../lib/photoFiles';
import { resolvePhotoCaptureDate } from '../../lib/photoMetadata';
import {
  buildDefaultFoodProductForm,
  type FoodProductFormValues,
} from '../../lib/foodProductForm';
import {
  buildDefaultRestaurantForm,
  extractCaptureCoordinates,
  resolveDraftPhotoDetectedDateValue,
  type DraftPhotoAsset,
  type RestaurantPhotoForm,
} from './shared';

export function usePhotoProcessingDraftState() {
  const [photos, setPhotos] = useState<DraftPhotoAsset[]>([]);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [restaurantForms, setRestaurantForms] = useState<
    Record<string, RestaurantPhotoForm>
  >({});
  const [foodProductForms, setFoodProductForms] = useState<
    Record<string, FoodProductFormValues>
  >({});
  const [locationMetadataHintDismissedByPhotoId, setLocationMetadataHintDismissedByPhotoId] =
    useState<Record<string, boolean>>({});

  const currentPhoto = photos[currentPhotoIndex] ?? null;
  const currentRestaurantForm = currentPhoto
    ? restaurantForms[currentPhoto.id]
    : undefined;
  const currentFoodProductForm = currentPhoto
    ? foodProductForms[currentPhoto.id]
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

  const updateCurrentFoodProductForm = useCallback(
    (updates: Partial<FoodProductFormValues>) => {
      if (!currentPhoto) {
        return;
      }

      setFoodProductForms((current) => {
        const currentForm =
          current[currentPhoto.id] ??
          buildDefaultFoodProductForm({
            captureDate: currentPhoto.captureDate,
            detectedDateValue: resolveDraftPhotoDetectedDateValue(currentPhoto),
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
            metadataDate: captureDate,
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
    setFoodProductForms((current) => {
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

  const replacePhotos = useCallback((nextPhotos: DraftPhotoAsset[]) => {
    setPhotos(nextPhotos);
    setCurrentPhotoIndex(0);
    setRestaurantForms({});
    setFoodProductForms({});
    setLocationMetadataHintDismissedByPhotoId({});
  }, []);

  const resetProcessingForms = useCallback(() => {
    setCurrentPhotoIndex(0);
    setRestaurantForms({});
    setFoodProductForms({});
    setLocationMetadataHintDismissedByPhotoId({});
  }, []);

  const resetDraftState = useCallback(() => {
    setPhotos([]);
    setCurrentPhotoIndex(0);
    setRestaurantForms({});
    setFoodProductForms({});
    setLocationMetadataHintDismissedByPhotoId({});
  }, []);

  return {
    appendAssets,
    currentPhoto,
    currentPhotoIndex,
    currentFoodProductForm,
    currentRestaurantForm,
    dismissCurrentPhotoLocationHint,
    locationMetadataHintDismissedByPhotoId,
    photos,
    foodProductForms,
    removePhoto,
    replacePhotos,
    resetDraftState,
    resetProcessingForms,
    restaurantForms,
    setCurrentPhotoIndex,
    setFoodProductForms,
    setRestaurantForms,
    updateCurrentFoodProductForm,
    updateCurrentRestaurantForm,
  };
}
