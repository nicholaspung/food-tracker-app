import type PocketBase from 'pocketbase';
import type { RecordListOptions } from 'pocketbase';
import { BaseRepository } from './BaseRepository';
import type { Note, NotePhoto } from '../lib/pocketbase';
import { COLLECTIONS } from '../constants/collections';

/**
 * Repository for managing note records
 */
export class NoteRepository extends BaseRepository<Note> {
  constructor(pb: PocketBase) {
    super(pb, COLLECTIONS.NOTES);
  }

  /**
   * Get all notes for a specific user
   */
  async getByUser(userId: string, options?: RecordListOptions): Promise<Note[]> {
    return await this.getFullList({
      filter: `user = "${userId}"`,
      sort: '-created',
      ...options,
    });
  }

  /**
   * Get all unused (draft) notes for a user
   */
  async getUnusedNotes(userId: string, options?: RecordListOptions): Promise<Note[]> {
    return await this.getFullList({
      filter: `user = "${userId}" && status = "draft"`,
      sort: '-created',
      ...options,
    });
  }

  /**
   * Get all used notes for a user
   */
  async getUsedNotes(userId: string, options?: RecordListOptions): Promise<Note[]> {
    return await this.getFullList({
      filter: `user = "${userId}" && status = "used"`,
      sort: '-created',
      ...options,
    });
  }

  /**
   * Mark a note as used by a visit
   */
  async markAsUsedByVisit(noteId: string, visitId: string): Promise<Note> {
    return await this.update(noteId, {
      status: 'used',
      usedInVisit: visitId,
    });
  }

  /**
   * Mark a note as used by a food item (quick track)
   */
  async markAsUsedByFoodItem(noteId: string, foodItemId: string): Promise<Note> {
    return await this.update(noteId, {
      status: 'used',
      usedInFoodItem: foodItemId,
    });
  }

  /**
   * Search notes by content
   */
  async searchByContent(query: string, userId: string, options?: RecordListOptions): Promise<Note[]> {
    return await this.getFullList({
      filter: `user = "${userId}" && content ~ "${query}"`,
      sort: '-created',
      ...options,
    });
  }
}

/**
 * Repository for managing note photo records
 */
export class NotePhotoRepository extends BaseRepository<NotePhoto> {
  constructor(pb: PocketBase) {
    super(pb, COLLECTIONS.NOTE_PHOTOS);
  }

  /**
   * Get all photos for a specific note
   */
  async getByNote(noteId: string, options?: RecordListOptions): Promise<NotePhoto[]> {
    return await this.getFullList({
      filter: `note = "${noteId}"`,
      sort: 'created',
      ...options,
    });
  }

  /**
   * Get all photos for a user
   */
  async getByUser(userId: string, options?: RecordListOptions): Promise<NotePhoto[]> {
    return await this.getFullList({
      filter: `user = "${userId}"`,
      sort: '-created',
      ...options,
    });
  }

  /**
   * Delete all photos for a note
   */
  async deleteByNote(noteId: string): Promise<void> {
    const photos = await this.getByNote(noteId);
    for (const photo of photos) {
      await this.delete(photo.id);
    }
  }
}
