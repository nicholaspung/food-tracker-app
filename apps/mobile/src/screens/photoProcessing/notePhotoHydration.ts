import { Directory, File, Paths } from 'expo-file-system';

import {
  buildPocketBaseFileUrl,
  type NotePhotoRecord,
} from '../../features';
import { buildLocalPhotoFileName } from '../../lib/photoFiles';
import { stageLocalPhotoFile } from '../../lib/photoStaging';
import type { DraftPhotoAsset } from './shared';

function getNotePhotoHydrationDirectory(noteId: string): Directory {
  return new Directory(Paths.cache, 'note-use', noteId);
}

function buildHydratedNotePhotoName(notePhoto: NotePhotoRecord, index: number): string {
  const baseName = buildLocalPhotoFileName(notePhoto.photo, {
    fallbackPrefix: `note-photo-${index + 1}`,
  });
  return `${notePhoto.id}-${baseName}`;
}

export async function hydrateDraftPhotosFromNote(
  noteId: string,
  notePhotos: NotePhotoRecord[],
): Promise<DraftPhotoAsset[]> {
  const directory = getNotePhotoHydrationDirectory(noteId);
  directory.create({
    idempotent: true,
    intermediates: true,
  });

  const hydratedPhotos = await Promise.all(
    notePhotos.map(async (notePhoto, index) => {
      const destinationName = buildHydratedNotePhotoName(notePhoto, index);
      const destination = new File(directory, destinationName);
      const downloadedFile = await File.downloadFileAsync(
        buildPocketBaseFileUrl({
          collectionName: 'note_photos',
          recordId: notePhoto.id,
          filename: notePhoto.photo,
        }),
        destination,
        {
          idempotent: true,
        },
      );

      const localPhoto = await stageLocalPhotoFile(
        {
          uri: downloadedFile.uri,
          fileName: destinationName,
        },
        {
          fallbackPrefix: 'note-photo',
        },
      );
      if (!localPhoto) {
        throw new Error('Could not prepare the selected note photo.');
      }

      return {
        id: `note-photo-${notePhoto.id}`,
        ...localPhoto,
        captureDate: null,
        captureCoordinates: null,
        metadataDate: notePhoto.capturedAt ?? notePhoto.created,
      };
    }),
  );

  return hydratedPhotos;
}

export function cleanupHydratedNotePhotos(noteId: string): void {
  try {
    const directory = getNotePhotoHydrationDirectory(noteId);
    if (!directory.exists) {
      return;
    }

    directory.delete();
  } catch {
    // Best effort only: cache cleanup should not interrupt navigation.
  }
}
