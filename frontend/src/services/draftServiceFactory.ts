/**
 * Generic Draft Service Factory
 *
 * Creates type-safe draft services for managing temporary state in localStorage.
 * Use this for simple draft use cases. For React components, prefer useDraftState hook.
 *
 * @example
 * ```typescript
 * interface MyDraft {
 *   name: string;
 *   email: string;
 * }
 *
 * const myDraftService = createDraftService<MyDraft>({
 *   key: 'myDraft',
 *   defaultValue: { name: '', email: '' },
 * });
 *
 * // Usage
 * myDraftService.save({ name: 'John', email: 'john@example.com' });
 * const draft = myDraftService.get();
 * myDraftService.clear();
 * ```
 */

export interface DraftServiceConfig<T> {
  /** Unique localStorage key for this draft */
  key: string;
  /** Default value when no draft exists */
  defaultValue: T;
  /** Optional validation function */
  validate?: (draft: T) => boolean;
}

export interface DraftService<T> {
  /** Get the current draft, or default value if none exists */
  get(): T;
  /** Save draft to localStorage */
  save(draft: T): void;
  /** Update draft with partial data */
  update(updates: Partial<T>): void;
  /** Clear the draft */
  clear(): void;
  /** Check if a draft exists */
  exists(): boolean;
}

/**
 * Creates a type-safe draft service for localStorage persistence
 */
export function createDraftService<T extends Record<string, any>>(
  config: DraftServiceConfig<T>
): DraftService<T> {
  const { key, defaultValue, validate } = config;

  return {
    get(): T {
      try {
        const stored = localStorage.getItem(key);
        if (!stored) {
          return defaultValue;
        }

        const draft = JSON.parse(stored) as T;

        // Validate if validator provided
        if (validate && !validate(draft)) {
          console.warn(`Draft validation failed for key "${key}", returning default`);
          return defaultValue;
        }

        return draft;
      } catch (error) {
        console.error(`Failed to load draft from "${key}":`, error);
        return defaultValue;
      }
    },

    save(draft: T): void {
      try {
        // Validate before saving if validator provided
        if (validate && !validate(draft)) {
          console.error(`Cannot save invalid draft for key "${key}"`);
          return;
        }

        localStorage.setItem(key, JSON.stringify(draft));
      } catch (error) {
        console.error(`Failed to save draft to "${key}":`, error);
      }
    },

    update(updates: Partial<T>): void {
      const current = this.get();
      this.save({ ...current, ...updates });
    },

    clear(): void {
      try {
        localStorage.removeItem(key);
      } catch (error) {
        console.error(`Failed to clear draft from "${key}":`, error);
      }
    },

    exists(): boolean {
      try {
        const stored = localStorage.getItem(key);
        if (!stored) {
          return false;
        }

        const draft = JSON.parse(stored) as T;

        // If validator exists, check validity
        if (validate) {
          return validate(draft);
        }

        return true;
      } catch {
        return false;
      }
    },
  };
}

/**
 * Creates a draft service that stores drafts by ID
 * Useful for editing existing records where each record needs its own draft
 *
 * @example
 * ```typescript
 * interface EditPostDraft {
 *   postId: string;
 *   title: string;
 *   content: string;
 * }
 *
 * const editPostDrafts = createIdBasedDraftService<EditPostDraft>({
 *   key: 'editPostDraft',
 *   getId: (draft) => draft.postId,
 * });
 *
 * // Usage
 * editPostDrafts.save('post123', { postId: 'post123', title: 'New Title', content: '' });
 * const draft = editPostDrafts.get('post123');
 * editPostDrafts.clear('post123');
 * ```
 */
export interface IdBasedDraftServiceConfig<T> {
  /** Base localStorage key (actual key will be `${key}_${id}`) */
  key: string;
  /** Function to extract ID from draft data */
  getId: (draft: T) => string;
  /** Optional validation function */
  validate?: (draft: T) => boolean;
}

export interface IdBasedDraftService<T> {
  /** Get draft for specific ID */
  get(id: string): T | null;
  /** Save draft for specific ID */
  save(id: string, draft: T): void;
  /** Clear draft for specific ID */
  clear(id: string): void;
  /** Check if draft exists for ID */
  exists(id: string): boolean;
}

/**
 * Creates an ID-based draft service for storing multiple drafts
 */
export function createIdBasedDraftService<T>(
  config: IdBasedDraftServiceConfig<T>
): IdBasedDraftService<T> {
  const { key, getId, validate } = config;

  const getStorageKey = (id: string) => `${key}_${id}`;

  return {
    get(id: string): T | null {
      try {
        const stored = localStorage.getItem(getStorageKey(id));
        if (!stored) {
          return null;
        }

        const draft = JSON.parse(stored) as T;

        // Verify ID matches
        if (getId(draft) !== id) {
          console.warn(`Draft ID mismatch for key "${key}", expected ${id}, got ${getId(draft)}`);
          return null;
        }

        // Validate if validator provided
        if (validate && !validate(draft)) {
          console.warn(`Draft validation failed for key "${key}_${id}"`);
          return null;
        }

        return draft;
      } catch (error) {
        console.error(`Failed to load draft for "${key}_${id}":`, error);
        return null;
      }
    },

    save(id: string, draft: T): void {
      try {
        // Verify ID matches
        if (getId(draft) !== id) {
          console.error(`Cannot save draft: ID mismatch (expected ${id}, got ${getId(draft)})`);
          return;
        }

        // Validate if validator provided
        if (validate && !validate(draft)) {
          console.error(`Cannot save invalid draft for "${key}_${id}"`);
          return;
        }

        localStorage.setItem(getStorageKey(id), JSON.stringify(draft));
      } catch (error) {
        console.error(`Failed to save draft for "${key}_${id}":`, error);
      }
    },

    clear(id: string): void {
      try {
        localStorage.removeItem(getStorageKey(id));
      } catch (error) {
        console.error(`Failed to clear draft for "${key}_${id}":`, error);
      }
    },

    exists(id: string): boolean {
      try {
        const stored = localStorage.getItem(getStorageKey(id));
        if (!stored) {
          return false;
        }

        const draft = JSON.parse(stored) as T;

        // Verify ID matches
        if (getId(draft) !== id) {
          return false;
        }

        // If validator exists, check validity
        if (validate) {
          return validate(draft);
        }

        return true;
      } catch {
        return false;
      }
    },
  };
}
