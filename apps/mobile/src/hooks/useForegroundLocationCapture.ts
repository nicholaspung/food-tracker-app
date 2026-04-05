import * as Location from 'expo-location';
import { useCallback, useState } from 'react';

import { formatCoordinateLabel, type Coordinates } from '../lib/coordinates';

interface UseForegroundLocationCaptureOptions {
  accuracy?: Location.LocationAccuracy;
  blockedPermissionMessage: string;
  defaultErrorMessage: string;
  deniedPermissionMessage: string;
  labelFractionDigits?: number;
}

interface ForegroundLocationCaptureSuccess {
  coordinates: Coordinates;
  label: string;
  status: 'success';
}

interface ForegroundLocationCapturePermissionDenied {
  canAskAgain: boolean;
  message: string;
  status: 'permission_denied';
}

interface ForegroundLocationCaptureError {
  error: unknown;
  message: string;
  status: 'error';
}

export type ForegroundLocationCaptureResult =
  | ForegroundLocationCaptureSuccess
  | ForegroundLocationCapturePermissionDenied
  | ForegroundLocationCaptureError;

export function useForegroundLocationCapture({
  accuracy = Location.Accuracy.Balanced,
  blockedPermissionMessage,
  defaultErrorMessage,
  deniedPermissionMessage,
  labelFractionDigits = 6,
}: UseForegroundLocationCaptureOptions) {
  const [isCapturing, setIsCapturing] = useState(false);
  const [permissionNeedsSettings, setPermissionNeedsSettings] = useState(false);

  const resetPermissionNeedsSettings = useCallback(() => {
    setPermissionNeedsSettings(false);
  }, []);

  const captureLocation = useCallback(async (): Promise<ForegroundLocationCaptureResult> => {
    setPermissionNeedsSettings(false);
    setIsCapturing(true);

    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        const needsSettings = permission.canAskAgain === false;
        setPermissionNeedsSettings(needsSettings);
        return {
          canAskAgain: permission.canAskAgain,
          message: needsSettings
            ? blockedPermissionMessage
            : deniedPermissionMessage,
          status: 'permission_denied',
        };
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy,
      });
      const coordinates = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };

      return {
        coordinates,
        label: formatCoordinateLabel(coordinates, labelFractionDigits),
        status: 'success',
      };
    } catch (error) {
      return {
        error,
        message: error instanceof Error ? error.message : defaultErrorMessage,
        status: 'error',
      };
    } finally {
      setIsCapturing(false);
    }
  }, [
    accuracy,
    blockedPermissionMessage,
    defaultErrorMessage,
    deniedPermissionMessage,
    labelFractionDigits,
  ]);

  return {
    captureLocation,
    isCapturing,
    permissionNeedsSettings,
    resetPermissionNeedsSettings,
  };
}
