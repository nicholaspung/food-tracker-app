import { Directory, File, Paths } from 'expo-file-system';
import type { Action } from 'expo-image-manipulator';

import {
  buildLocalPhotoFile,
  type LocalPhotoAsset,
  type LocalPhotoFile,
} from './photoFiles';

export interface StagedPhotoFile extends LocalPhotoFile {
  stagedUri: string;
  originalUri: string;
}

interface StageLocalPhotoFileOptions {
  fallbackPrefix?: string;
  jpegQuality?: number;
  maxLongEdge?: number;
  resize?: boolean;
}

const PHOTO_STAGING_DIRECTORY_NAME = 'photo-staging';
const DEFAULT_PHOTO_MAX_LONG_EDGE = 1600;
const DEFAULT_PHOTO_JPEG_QUALITY = 0.78;
const STAGED_PHOTO_MIME_TYPE = 'image/jpeg';

type ImageManipulatorModule = typeof import('expo-image-manipulator');
type ExpoModule = typeof import('expo');

export const PHOTO_RESIZE_NATIVE_MODULE_UNAVAILABLE_MESSAGE =
  'Photo resizing is unavailable in this app build. Rebuild and reinstall the app, then try adding the photo again.';

export function hasNativeImageManipulatorModule(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Expo = require('expo') as Pick<ExpoModule, 'requireOptionalNativeModule'>;
    return Boolean(Expo.requireOptionalNativeModule('ExpoImageManipulator'));
  } catch {
    return false;
  }
}

function loadImageManipulator(): ImageManipulatorModule | null {
  // Lazy-load so screens that do not stage photos can render in dev clients built without this native module.
  if (!hasNativeImageManipulatorModule()) {
    return null;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-image-manipulator') as ImageManipulatorModule;
  } catch {
    return null;
  }
}

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

function normalizePhotoFileNameToJpeg(fileName: string): string {
  const sanitizedFileName = sanitizePhotoFileName(fileName);
  const extensionIndex = sanitizedFileName.lastIndexOf('.');
  if (extensionIndex <= 0) {
    return `${sanitizedFileName}.jpg`;
  }

  return `${sanitizedFileName.slice(0, extensionIndex)}.jpg`;
}

function isStagedPhotoUri(uri: string): boolean {
  return uri.includes(`/${PHOTO_STAGING_DIRECTORY_NAME}/`);
}

function resolveResizeAction(
  asset: LocalPhotoAsset,
  maxLongEdge: number,
  shouldResize: boolean,
): Action[] {
  if (!shouldResize || maxLongEdge <= 0) {
    return [];
  }

  const width = typeof asset.width === 'number' ? asset.width : null;
  const height = typeof asset.height === 'number' ? asset.height : null;
  if (!width || !height || width <= 0 || height <= 0) {
    return [];
  }

  const longEdge = Math.max(width, height);
  if (longEdge <= maxLongEdge) {
    return [];
  }

  return width >= height
    ? [{ resize: { width: maxLongEdge } }]
    : [{ resize: { height: maxLongEdge } }];
}

async function deleteFileBestEffort(uri: string): Promise<void> {
  try {
    const file = new File(uri);
    if (file.exists) {
      file.delete();
    }
  } catch {
    // Best effort only: temporary manipulation cleanup should not affect upload flow.
  }
}

export async function stageLocalPhotoFile(
  asset: LocalPhotoAsset,
  options: StageLocalPhotoFileOptions = {},
): Promise<LocalPhotoFile | null> {
  const localPhoto = buildLocalPhotoFile(asset, options);
  if (!localPhoto) {
    return null;
  }

  const maxLongEdge = options.maxLongEdge ?? DEFAULT_PHOTO_MAX_LONG_EDGE;
  const jpegQuality = options.jpegQuality ?? DEFAULT_PHOTO_JPEG_QUALITY;
  const resize = options.resize ?? true;
  let manipulatedUri: string | null = null;
  let stagedUri: string | null = null;

  const stagingDirectory = getPhotoStagingDirectory();
  const stagedPhotoName = normalizePhotoFileNameToJpeg(localPhoto.name);
  const destinationFile = new File(
    stagingDirectory,
    buildStagedPhotoFileName(stagedPhotoName),
  );

  try {
    const ImageManipulator = loadImageManipulator();
    if (!ImageManipulator) {
      return null;
    }

    const manipulatedPhoto = await ImageManipulator.manipulateAsync(
      localPhoto.uri,
      resolveResizeAction(asset, maxLongEdge, resize),
      {
        compress: jpegQuality,
        format: ImageManipulator.SaveFormat.JPEG,
      },
    );
    manipulatedUri = manipulatedPhoto.uri;

    stagingDirectory.create({
      idempotent: true,
      intermediates: true,
    });
    const sourceFile = new File(manipulatedUri);
    stagedUri = destinationFile.uri;
    await sourceFile.copy(destinationFile);
  } catch {
    if (stagedUri) {
      await deleteFileBestEffort(stagedUri);
    }
    return null;
  } finally {
    if (manipulatedUri) {
      await deleteFileBestEffort(manipulatedUri);
    }
  }

  return {
    mimeType: STAGED_PHOTO_MIME_TYPE,
    name: stagedPhotoName,
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
