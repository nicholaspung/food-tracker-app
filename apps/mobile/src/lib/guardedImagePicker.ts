import * as ImagePicker from 'expo-image-picker';

let isImagePickerOpen = false;

async function runImagePickerOnce(
  launchPicker: () => Promise<ImagePicker.ImagePickerResult>,
): Promise<ImagePicker.ImagePickerResult | null> {
  if (isImagePickerOpen) {
    return null;
  }

  isImagePickerOpen = true;
  try {
    return await launchPicker();
  } finally {
    isImagePickerOpen = false;
  }
}

export async function launchCameraPickerAsync(
  options: ImagePicker.ImagePickerOptions,
): Promise<ImagePicker.ImagePickerResult | null> {
  return runImagePickerOnce(() => ImagePicker.launchCameraAsync(options));
}

export async function launchImageLibraryPickerAsync(
  options: ImagePicker.ImagePickerOptions,
): Promise<ImagePicker.ImagePickerResult | null> {
  return runImagePickerOnce(() => ImagePicker.launchImageLibraryAsync(options));
}
