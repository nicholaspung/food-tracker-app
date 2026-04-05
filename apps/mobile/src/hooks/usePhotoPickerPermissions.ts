import * as ImagePicker from 'expo-image-picker';
import { useCallback, useState } from 'react';

export type PhotoPickerPermissionSource = 'camera' | 'gallery';

interface UsePhotoPickerPermissionsOptions {
  cameraBlockedMessage: string;
  cameraRequiredMessage: string;
  galleryBlockedMessage: string;
  galleryRequiredMessage: string;
}

interface PhotoPickerPermissionGranted {
  canAskAgain: boolean;
  granted: true;
}

interface PhotoPickerPermissionDenied {
  canAskAgain: boolean;
  granted: false;
  message: string;
}

export type PhotoPickerPermissionResult =
  | PhotoPickerPermissionGranted
  | PhotoPickerPermissionDenied;

export function usePhotoPickerPermissions({
  cameraBlockedMessage,
  cameraRequiredMessage,
  galleryBlockedMessage,
  galleryRequiredMessage,
}: UsePhotoPickerPermissionsOptions) {
  const [permissionNeedsSettings, setPermissionNeedsSettings] = useState(false);

  const resetPermissionNeedsSettings = useCallback(() => {
    setPermissionNeedsSettings(false);
  }, []);

  const requestPermission = useCallback(async (
    source: PhotoPickerPermissionSource,
  ): Promise<PhotoPickerPermissionResult> => {
    setPermissionNeedsSettings(false);

    const permission = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (permission.granted) {
      return {
        canAskAgain: permission.canAskAgain,
        granted: true,
      };
    }

    const needsSettings = permission.canAskAgain === false;
    setPermissionNeedsSettings(needsSettings);

    return {
      canAskAgain: permission.canAskAgain,
      granted: false,
      message: needsSettings
        ? source === 'camera'
          ? cameraBlockedMessage
          : galleryBlockedMessage
        : source === 'camera'
          ? cameraRequiredMessage
          : galleryRequiredMessage,
    };
  }, [
    cameraBlockedMessage,
    cameraRequiredMessage,
    galleryBlockedMessage,
    galleryRequiredMessage,
  ]);

  return {
    permissionNeedsSettings,
    requestPermission,
    resetPermissionNeedsSettings,
  };
}
