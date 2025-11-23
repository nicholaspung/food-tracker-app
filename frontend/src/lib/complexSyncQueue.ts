/**
 * Enhanced Sync Queue with Complex Operation Support
 *
 * Extends the base sync queue to support complex multi-step operations
 * including file uploads and inter-operation dependencies.
 */

import { syncQueue, type QueuedOperation } from './syncQueue';

export interface PhotoData {
  file: File;
  fileName: string;
  fileType: string;
  fileSize: number;
}

export interface ComplexOperationPayload {
  visit?: {
    restaurant: string;
    user: string;
    visitDate: string;
    visibility: string;
    notes: string;
  };
  foodItems?: Array<{
    name: string;
    description: string;
    rating: number;
    notes: string;
    user: string;
    photoIndex?: number; // Link to photo in photos array
  }>;
  photos?: PhotoData[];
}

export interface ComplexQueuedOperation extends QueuedOperation {
  complexPayload?: ComplexOperationPayload;
  isComplex?: boolean;
}

class ComplexSyncQueueManager {
  /**
   * Queue a complex multi-step operation (e.g., visit + food items + photos)
   */
  async enqueueComplexVisit(payload: ComplexOperationPayload): Promise<string> {
    const operation: Omit<ComplexQueuedOperation, 'id' | 'timestamp' | 'retries'> = {
      type: 'create',
      collection: 'visits_complex', // Special collection name for complex ops
      data: null, // Will be reconstructed from complexPayload
      complexPayload: payload,
      isComplex: true,
    };

    return await syncQueue.enqueue(operation as any);
  }

  /**
   * Convert File to storable format (base64 data URL)
   */
  async fileToPhotoData(file: File): Promise<PhotoData> {
    return Promise.resolve({
      file: file, // Store original file
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
    });
  }

  /**
   * Prepare photos for queuing
   */
  async preparePhotos(photoFiles: Map<number, File>): Promise<PhotoData[]> {
    const photos: PhotoData[] = [];

    for (const [index, file] of photoFiles.entries()) {
      const photoData = await this.fileToPhotoData(file);
      photos[index] = photoData;
    }

    return photos;
  }
}

// Export singleton
export const complexSyncQueue = new ComplexSyncQueueManager();
