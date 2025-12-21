import type PocketBase from 'pocketbase';
import type { RecordListOptions, RecordOptions } from 'pocketbase';

/**
 * Base repository class providing common CRUD operations for PocketBase collections.
 * All collection-specific repositories should extend this class.
 *
 * @template T - The type of the record model for this collection
 */
export class BaseRepository<T extends { id: string }> {
  protected pb: PocketBase;
  protected collectionName: string;

  constructor(pb: PocketBase, collectionName: string) {
    this.pb = pb;
    this.collectionName = collectionName;
  }

  /**
   * Get a single record by ID
   */
  async getOne(id: string, options?: RecordOptions): Promise<T> {
    return await this.pb.collection(this.collectionName).getOne<T>(id, options);
  }

  /**
   * Get the first record that matches the filter
   */
  async getFirstListItem(filter: string, options?: RecordListOptions): Promise<T> {
    return await this.pb.collection(this.collectionName).getFirstListItem<T>(filter, options);
  }

  /**
   * Get a paginated list of records
   */
  async getList(page: number = 1, perPage: number = 30, options?: RecordListOptions): Promise<{
    page: number;
    perPage: number;
    totalItems: number;
    totalPages: number;
    items: T[];
  }> {
    return await this.pb.collection(this.collectionName).getList<T>(page, perPage, options);
  }

  /**
   * Get all records that match the options (no pagination)
   */
  async getFullList(options?: RecordListOptions): Promise<T[]> {
    return await this.pb.collection(this.collectionName).getFullList<T>(options);
  }

  /**
   * Create a new record
   */
  async create(data: { [key: string]: any } | FormData, options?: RecordOptions): Promise<T> {
    return await this.pb.collection(this.collectionName).create<T>(data, options);
  }

  /**
   * Update an existing record
   */
  async update(id: string, data: { [key: string]: any } | FormData, options?: RecordOptions): Promise<T> {
    return await this.pb.collection(this.collectionName).update<T>(id, data, options);
  }

  /**
   * Delete a record
   */
  async delete(id: string): Promise<boolean> {
    return await this.pb.collection(this.collectionName).delete(id);
  }

  /**
   * Subscribe to real-time changes for a specific record
   */
  subscribe(idOrFilter: string, callback: (data: { action: string; record: T }) => void): () => void {
    this.pb.collection(this.collectionName).subscribe<T>(idOrFilter, callback);

    // Return unsubscribe function
    return () => {
      this.pb.collection(this.collectionName).unsubscribe(idOrFilter);
    };
  }

  /**
   * Subscribe to all changes in the collection
   */
  subscribeToAll(callback: (data: { action: string; record: T }) => void): () => void {
    return this.subscribe('*', callback);
  }
}
