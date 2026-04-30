import { Directory, File, Paths } from 'expo-file-system';

import {
  buildLocalPhotoFile,
  type LocalPhotoAsset,
  type LocalPhotoFile,
} from './photoFiles';

export interface StagedPhotoFile extends LocalPhotoFile {
  stagedUri: string;
  originalUri: string;
}

const PHOTO_STAGING_DIRECTORY_NAME = 'photo-staging';

function getPhotoStagingDirectory(): Directory {
  return new Directory(Paths.document, PHOTO_STAGING_DIRECTORY_NAME);
}

function sanitizePhotoFileName(fileName: string): string {
  const sanitized = fileName.replace(/[^A-Za-z0-9._-]/g, '_');
  return sanitized || `photo-${Date.now()}.jpg`;
}

function buildStagedPhotoFileName(fileName: string): string {
  const timestamp = Date.now().toString(36);
  const randomSuffix = Math.random().toString(36).slice(2, 10);
  return `${timestamp}-${randomSuffix}-${sanitizePhotoFileName(fileName)}`;
}

function isStagedPhotoUri(uri: string): boolean {
  return uri.includes(`/${PHOTO_STAGING_DIRECTORY_NAME}/`);
}

export async function stageLocalPhotoFile(
  asset: LocalPhotoAsset,
  options: { fallbackPrefix?: string } = {},
): Promise<LocalPhotoFile | null> {
  const localPhoto = buildLocalPhotoFile(asset, options);
  if (!localPhoto) {
    return null;
  }

  const stagingDirectory = getPhotoStagingDirectory();
  const sourceFile = new File(localPhoto.uri);
  const destinationFile = new File(
    stagingDirectory,
    buildStagedPhotoFileName(localPhoto.name),
  );

  try {
    stagingDirectory.create({
      idempotent: true,
      intermediates: true,
    });
    sourceFile.copy(destinationFile);
  } catch {
    return null;
  }

  return {
    ...localPhoto,
    uri: destinationFile.uri,
  };
}

export async function cleanupStagedPhotoFiles(
  photos: readonly { uri?: string }[],
): Promise<void> {
  await Promise.all(
    photos.map(async (photo) => {
      const uri = photo.uri?.trim();
      if (!uri || !isStagedPhotoUri(uri)) {
        return;
      }

      try {
        const file = new File(uri);
        if (file.exists) {
          file.delete();
        }
      } catch {
        // Best effort only: upload cleanup should not affect saved records.
      }
    }),
  );
}
