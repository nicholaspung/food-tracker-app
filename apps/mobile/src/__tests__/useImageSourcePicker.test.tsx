import * as ImagePicker from 'expo-image-picker';
import React, { useEffect } from 'react';
import { act, create } from 'react-test-renderer';

import { useImageSourcePicker } from '../hooks/useImageSourcePicker';
import { usePhotoPickerPermissions } from '../hooks/usePhotoPickerPermissions';

jest.mock('expo-image-picker', () => ({
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

jest.mock('../hooks/usePhotoPickerPermissions', () => ({
  usePhotoPickerPermissions: jest.fn(),
}));

const mockedUsePhotoPickerPermissions = usePhotoPickerPermissions as jest.MockedFunction<
  typeof usePhotoPickerPermissions
>;

function HookProbe({
  onController,
}: {
  onController: (controller: ReturnType<typeof useImageSourcePicker>) => void;
}) {
  const controller = useImageSourcePicker({
    cameraBlockedMessage: 'Camera blocked',
    cameraRequiredMessage: 'Camera required',
    galleryBlockedMessage: 'Gallery blocked',
    galleryRequiredMessage: 'Gallery required',
  });

  useEffect(() => {
    onController(controller);
  }, [controller, onController]);

  return null;
}

describe('useImageSourcePicker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('delegates requestSourcePermission without launching an image picker', async () => {
    const requestPermission = jest.fn().mockResolvedValue({
      canAskAgain: true,
      granted: true,
    });
    mockedUsePhotoPickerPermissions.mockReturnValue({
      permissionNeedsSettings: false,
      requestPermission,
      resetPermissionNeedsSettings: jest.fn(),
    });

    let controller!: ReturnType<typeof useImageSourcePicker>;
    await act(async () => {
      create(<HookProbe onController={(nextController) => {
        controller = nextController;
      }} />);
    });

    await act(async () => {
      await controller.requestSourcePermission('camera');
    });

    expect(requestPermission).toHaveBeenCalledWith('camera');
    expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
    expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
  });
});
