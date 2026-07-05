import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';

import type { PhotoPickerPermissionSource } from '../../hooks/usePhotoPickerPermissions';
import { usePhotoPickerPermissions } from '../../hooks/usePhotoPickerPermissions';
import {
  formatDateToLocalDateString,
  formatPhotoAttachmentDateLabel,
} from '../../lib/dateFormatting';
import {
  launchCameraPickerAsync,
  launchImageLibraryPickerAsync,
} from '../../lib/guardedImagePicker';
import { resolvePhotoCaptureDate } from '../../lib/photoMetadata';
import {
  hasNativeImageManipulatorModule,
  PHOTO_RESIZE_NATIVE_MODULE_UNAVAILABLE_MESSAGE,
  stageLocalPhotoFile,
} from '../../lib/photoStaging';
import { trackObservabilityEvent } from '../../observability';
import {
  trackProductEvent,
  type TrackingEntryProperties,
} from '../../observability/productAnalytics';
import type { VisitPhotoUploadInput } from '../store/featureStore';
import {
  FREE_MONTHLY_PHOTO_UPLOAD_LIMIT as FREE_MONTHLY_PHOTO_LIMIT,
  formatFreeMonthlyPhotoLimitStatus,
} from '../store/usageLimitCopy';
import type { MonthlyUsageSnapshot } from '../store/usageLimitsGateway';

export type FoodProductEditorPhotoSource = PhotoPickerPermissionSource;
export type FoodProductEditorPhotoDraftMode = 'keep' | 'replace' | 'remove';

interface FoodProductEditorDraftPhoto {
  label: string;
  upload: VisitPhotoUploadInput;
}

interface FoodProductEditorDisplayedPhoto {
  id: string;
  label: string;
  thumbnailUri: string;
  viewerUri: string;
}

interface UseFoodProductEditorPhotoDraftOptions {
  analyticsSource: 'FoodProductScreen' | 'EditFoodProductScreen';
  currentDateValue?: string;
  emptyInitialPhotoMode?: Extract<FoodProductEditorPhotoDraftMode, 'keep' | 'remove'>;
  existingPhoto?: FoodProductEditorDisplayedPhoto | null;
  isDisplayFreeUser: boolean;
  monthlyUsageSnapshot: MonthlyUsageSnapshot | null;
  onCaptureDateDetected: (dateValue: string) => void;
  onCaptureDateRestored?: (dateValue: string) => void;
  pendingPickerRestoreKey?: string | null;
  resetKey?: string | null;
  shouldEnforceUsageLimitsClientSide: boolean;
  trackingProperties: TrackingEntryProperties;
}

export interface FoodProductEditorPhotoDraftController {
  countLabel: string | null;
  detectedDateValue: string | null;
  displayedPhoto: FoodProductEditorDisplayedPhoto | null;
  errorMessage: string | null;
  hideSourceActions: boolean;
  isViewerVisible: boolean;
  permissionNeedsSettings: boolean;
  photo: FoodProductEditorDraftPhoto | null;
  photoMode: FoodProductEditorPhotoDraftMode;
  quotaStatusMessage: string | null;
  closeViewer: () => void;
  openViewer: () => void;
  pickPhoto: (source: FoodProductEditorPhotoSource) => Promise<void>;
  removePhoto: () => void;
}

async function buildDraftPhotoInput(asset: ImagePicker.ImagePickerAsset): Promise<VisitPhotoUploadInput | null> {
  if (!hasNativeImageManipulatorModule()) {
    throw new Error(PHOTO_RESIZE_NATIVE_MODULE_UNAVAILABLE_MESSAGE);
  }

  return stageLocalPhotoFile(asset, {
    fallbackPrefix: 'food-product',
  });
}

export function useFoodProductEditorPhotoDraft({
  analyticsSource,
  currentDateValue,
  emptyInitialPhotoMode = 'remove',
  existingPhoto = null,
  isDisplayFreeUser,
  monthlyUsageSnapshot,
  onCaptureDateDetected,
  onCaptureDateRestored,
  pendingPickerRestoreKey = '__food_product_create__',
  resetKey,
  shouldEnforceUsageLimitsClientSide,
  trackingProperties,
}: UseFoodProductEditorPhotoDraftOptions): FoodProductEditorPhotoDraftController {
  const [detectedDateValue, setDetectedDateValue] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [photo, setPhoto] = useState<FoodProductEditorDraftPhoto | null>(null);
  const [photoMode, setPhotoMode] = useState<FoodProductEditorPhotoDraftMode>(
    existingPhoto ? 'keep' : emptyInitialPhotoMode,
  );
  const [previousDateBeforePhotoDraft, setPreviousDateBeforePhotoDraft] = useState<string | null>(null);
  const [isViewerVisible, setIsViewerVisible] = useState(false);
  const restoredPendingPickerForKeyRef = useRef<string | null>(null);
  const {
    permissionNeedsSettings,
    requestPermission,
    resetPermissionNeedsSettings,
  } = usePhotoPickerPermissions({
    cameraBlockedMessage: 'Camera permission is blocked. Enable it in device settings.',
    cameraRequiredMessage: 'Camera permission is required to take a photo.',
    galleryBlockedMessage: 'Photo library permission is blocked. Enable it in device settings.',
    galleryRequiredMessage: 'Photo library permission is required to upload an image.',
  });

  const estimatedFreePhotoRemaining = isDisplayFreeUser
    ? monthlyUsageSnapshot?.remaining.photoUploadsMonthly ?? null
    : null;
  const hideSourceActions =
    isDisplayFreeUser &&
    shouldEnforceUsageLimitsClientSide &&
    typeof estimatedFreePhotoRemaining === 'number' &&
    estimatedFreePhotoRemaining <= 0;
  const quotaStatusMessage = hideSourceActions
    ? formatFreeMonthlyPhotoLimitStatus(estimatedFreePhotoRemaining)
    : null;
  const existingPhotoId = existingPhoto?.id ?? null;
  const displayedPhoto = useMemo<FoodProductEditorDisplayedPhoto | null>(() => {
    if (photoMode === 'replace' && photo) {
      return {
        id: photo.upload.uri,
        label: photo.label,
        thumbnailUri: photo.upload.uri,
        viewerUri: photo.upload.uri,
      };
    }

    if (photoMode === 'keep' && existingPhoto) {
      return existingPhoto;
    }

    return null;
  }, [existingPhoto, photo, photoMode]);
  const countLabel = hideSourceActions && !displayedPhoto ? null : displayedPhoto ? '1/1' : '0/1';
  const resetPhotoMode: FoodProductEditorPhotoDraftMode = existingPhotoId ? 'keep' : emptyInitialPhotoMode;

  useEffect(() => {
    setDetectedDateValue(null);
    setErrorMessage(null);
    setPhoto(null);
    setPhotoMode(resetPhotoMode);
    setPreviousDateBeforePhotoDraft(null);
    setIsViewerVisible(false);
    restoredPendingPickerForKeyRef.current = null;
  }, [resetKey, resetPhotoMode]);

  const trackClientQuotaBlocked = useCallback((remaining: number) => {
    const payload = {
      enforcement: 'client_estimate',
      limit: FREE_MONTHLY_PHOTO_LIMIT,
      metric: 'photo_uploads',
      remaining,
      source: analyticsSource,
      used: monthlyUsageSnapshot?.usage.photoUploads ?? null,
    };

    trackObservabilityEvent('USAGE_LIMIT_REACHED', payload);
    trackProductEvent('quality.usage_limit_reached', payload);
    setErrorMessage(formatFreeMonthlyPhotoLimitStatus(remaining));
  }, [analyticsSource, monthlyUsageSnapshot?.usage.photoUploads]);

  const applyDraftPhoto = useCallback(async (
    asset: ImagePicker.ImagePickerAsset,
    source: FoodProductEditorPhotoSource,
    restoredPendingResult = false,
  ) => {
    const nextUpload = await buildDraftPhotoInput(asset);
    if (!nextUpload) {
      throw new Error('Could not read the selected image.');
    }

    const captureDate = await resolvePhotoCaptureDate(asset);
    if (captureDate) {
      const nextDetectedDateValue = formatDateToLocalDateString(captureDate);
      setPreviousDateBeforePhotoDraft((currentValue) => currentValue ?? currentDateValue ?? null);
      setDetectedDateValue(nextDetectedDateValue);
      onCaptureDateDetected(nextDetectedDateValue);
    } else {
      setDetectedDateValue(null);
    }
    setIsViewerVisible(false);
    setPhoto({
      label: formatPhotoAttachmentDateLabel(captureDate ?? new Date()),
      upload: nextUpload,
    });
    setPhotoMode('replace');
    setErrorMessage(null);
    resetPermissionNeedsSettings();

    trackObservabilityEvent('FOOD_PRODUCT_PHOTO_PICKED', {
      photoSource: source,
      ...(restoredPendingResult ? { restoredPendingResult: true } : {}),
      source: analyticsSource,
    });
    trackProductEvent('tracking.photo_added', trackingProperties);
  }, [
    analyticsSource,
    currentDateValue,
    onCaptureDateDetected,
    resetPermissionNeedsSettings,
    trackingProperties,
  ]);

  useEffect(() => {
    if (
      Platform.OS !== 'android' ||
      !pendingPickerRestoreKey ||
      restoredPendingPickerForKeyRef.current === pendingPickerRestoreKey
    ) {
      return;
    }

    let isMounted = true;
    restoredPendingPickerForKeyRef.current = pendingPickerRestoreKey;

    const restorePendingPickerResult = async () => {
      try {
        const pendingResult = await ImagePicker.getPendingResultAsync();
        if (!isMounted || !pendingResult || 'code' in pendingResult || pendingResult.canceled) {
          return;
        }

        const pendingAsset = pendingResult.assets?.[0];
        if (!pendingAsset) {
          return;
        }

        await applyDraftPhoto(pendingAsset, 'gallery', true);
      } catch (error) {
        trackObservabilityEvent('FOOD_PRODUCT_PHOTO_PICK_FAILED', {
          errorMessage: error instanceof Error ? error.message : String(error),
          errorType: error instanceof Error ? error.name : 'unknown_error',
          photoSource: 'gallery',
          restoredPendingResult: true,
          source: analyticsSource,
        });
      }
    };

    void restorePendingPickerResult();
    return () => {
      isMounted = false;
    };
  }, [analyticsSource, applyDraftPhoto, pendingPickerRestoreKey]);

  const pickPhoto = useCallback(async (source: FoodProductEditorPhotoSource) => {
    trackObservabilityEvent('FOOD_PRODUCT_PHOTO_PICK_STARTED', {
      photoSource: source,
      source: analyticsSource,
    });
    setErrorMessage(null);
    resetPermissionNeedsSettings();

    if (
      shouldEnforceUsageLimitsClientSide &&
      isDisplayFreeUser &&
      estimatedFreePhotoRemaining === 0
    ) {
      trackClientQuotaBlocked(estimatedFreePhotoRemaining);
      return;
    }

    try {
      const permission = await requestPermission(source);
      if (!permission.granted) {
        trackObservabilityEvent('FOOD_PRODUCT_PHOTO_PERMISSION_DENIED', {
          canAskAgain: permission.canAskAgain,
          photoSource: source,
          source: analyticsSource,
        });
        setErrorMessage(permission.message);
        return;
      }

      const pickerResult =
        source === 'camera'
          ? await launchCameraPickerAsync({
              mediaTypes: ['images'],
              allowsEditing: false,
              exif: true,
              quality: 0.8,
              presentationStyle:
                Platform.OS === 'ios'
                  ? ImagePicker.UIImagePickerPresentationStyle.FULL_SCREEN
                  : undefined,
            })
          : await launchImageLibraryPickerAsync({
              mediaTypes: ['images'],
              allowsEditing: false,
              exif: true,
              quality: 1,
              selectionLimit: 1,
              presentationStyle:
                Platform.OS === 'ios'
                  ? ImagePicker.UIImagePickerPresentationStyle.FULL_SCREEN
                  : undefined,
              preferredAssetRepresentationMode:
                Platform.OS === 'ios'
                  ? ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current
                  : undefined,
            });

      if (!pickerResult || pickerResult.canceled) {
        trackObservabilityEvent('FOOD_PRODUCT_PHOTO_PICK_CANCELED', {
          photoSource: source,
          source: analyticsSource,
        });
        return;
      }

      const selectedAsset = pickerResult.assets?.[0];
      if (!selectedAsset) {
        throw new Error('Could not read the selected image.');
      }

      await applyDraftPhoto(selectedAsset, source);
    } catch (error) {
      trackObservabilityEvent('FOOD_PRODUCT_PHOTO_PICK_FAILED', {
        errorMessage: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.name : 'unknown_error',
        photoSource: source,
        source: analyticsSource,
      });
      setErrorMessage(error instanceof Error ? error.message : 'Could not select a photo.');
    }
  }, [
    analyticsSource,
    applyDraftPhoto,
    estimatedFreePhotoRemaining,
    isDisplayFreeUser,
    requestPermission,
    resetPermissionNeedsSettings,
    shouldEnforceUsageLimitsClientSide,
    trackClientQuotaBlocked,
  ]);

  const removePhoto = useCallback(() => {
    setIsViewerVisible(false);

    if (photoMode === 'replace') {
      if (
        detectedDateValue &&
        previousDateBeforePhotoDraft &&
        currentDateValue === detectedDateValue
      ) {
        onCaptureDateRestored?.(previousDateBeforePhotoDraft);
      }

      setDetectedDateValue(null);
      setPreviousDateBeforePhotoDraft(null);
      setPhoto(null);
      setPhotoMode(existingPhoto ? 'keep' : 'remove');
      return;
    }

    setDetectedDateValue(null);
    setPreviousDateBeforePhotoDraft(null);
    setPhoto(null);
    setPhotoMode('remove');
  }, [
    currentDateValue,
    detectedDateValue,
    existingPhoto,
    onCaptureDateRestored,
    photoMode,
    previousDateBeforePhotoDraft,
  ]);

  return useMemo(
    () => ({
      closeViewer: () => {
        setIsViewerVisible(false);
      },
      countLabel,
      detectedDateValue,
      displayedPhoto,
      errorMessage,
      hideSourceActions,
      isViewerVisible,
      openViewer: () => {
        setIsViewerVisible(true);
      },
      permissionNeedsSettings,
      photo,
      photoMode,
      pickPhoto,
      quotaStatusMessage,
      removePhoto,
    }),
    [
      countLabel,
      detectedDateValue,
      displayedPhoto,
      errorMessage,
      hideSourceActions,
      isViewerVisible,
      permissionNeedsSettings,
      photo,
      photoMode,
      pickPhoto,
      quotaStatusMessage,
      removePhoto,
    ],
  );
}
