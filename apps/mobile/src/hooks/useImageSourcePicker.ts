import * as ImagePicker from 'expo-image-picker';
import { useCallback } from 'react';

import {
  usePhotoPickerPermissions,
  type PhotoPickerPermissionResult,
  type PhotoPickerPermissionSource,
} from './usePhotoPickerPermissions';

interface UseImageSourcePickerOptions {
  cameraBlockedMessage: string;
  cameraRequiredMessage: string;
  galleryBlockedMessage: string;
  galleryRequiredMessage: string;
}

interface PickImageAssetsOptions {
  source: PhotoPickerPermissionSource;
  allowsMultipleSelection?: boolean;
  exif?: boolean;
  quality?: number;
  selectionLimit?: number;
}

type PickImageAssetsResult =
  | {
      status: 'success';
      assets: ImagePicker.ImagePickerAsset[];
    }
  | {
      status: 'canceled';
    }
  | {
      status: 'permission_denied';
      canAskAgain: boolean;
      message: string;
    };

export function useImageSourcePicker({
  cameraBlockedMessage,
  cameraRequiredMessage,
  galleryBlockedMessage,
  galleryRequiredMessage,
}: UseImageSourcePickerOptions) {
  const {
    permissionNeedsSettings,
    requestPermission,
    resetPermissionNeedsSettings,
  } = usePhotoPickerPermissions({
    cameraBlockedMessage,
    cameraRequiredMessage,
    galleryBlockedMessage,
    galleryRequiredMessage,
  });

  const requestSourcePermission = useCallback(
    async (source: PhotoPickerPermissionSource): Promise<PhotoPickerPermissionResult> =>
      requestPermission(source),
    [requestPermission],
  );

  const pickImageAssets = useCallback(
    async ({
      source,
      allowsMultipleSelection = false,
      exif = false,
      quality = 0.8,
      selectionLimit = 1,
    }: PickImageAssetsOptions): Promise<PickImageAssetsResult> => {
      resetPermissionNeedsSettings();

      const permission = await requestPermission(source);
      if (!permission.granted) {
        return {
          status: 'permission_denied',
          canAskAgain: permission.canAskAgain,
          message: permission.message,
        };
      }

      const pickerResult =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({
              mediaTypes: ['images'],
              allowsEditing: false,
              quality,
              exif,
            })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'],
              allowsEditing: false,
              allowsMultipleSelection,
              selectionLimit,
              quality,
              exif,
            });

      if (pickerResult.canceled || pickerResult.assets.length === 0) {
        return {
          status: 'canceled',
        };
      }

      return {
        status: 'success',
        assets: pickerResult.assets,
      };
    },
    [requestPermission, resetPermissionNeedsSettings],
  );

  return {
    permissionNeedsSettings,
    pickImageAssets,
    requestSourcePermission,
    resetPermissionNeedsSettings,
  };
}
