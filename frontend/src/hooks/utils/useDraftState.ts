/**
 * Generic draft state management with localStorage persistence
 * Provides a reusable pattern for managing temporary/draft data
 */

import { logger } from '@/lib/logger';
import { useState, useCallback } from 'react';

export interface DraftStorageAdapter<T> {
  getDraft(): T | null;
  saveDraft(draft: T): void;
  clearDraft(): void;
  hasDraft(): boolean;
}

export interface LocalStorageDraftConfig<T> {
  key: string;
  defaultValue: T;
  validate?: (draft: T) => boolean;
}

/**
 * Creates a localStorage-based draft storage adapter
 */
export function createLocalStorageAdapter<T>(
  config: LocalStorageDraftConfig<T>
): DraftStorageAdapter<T> {
  return {
    getDraft(): T | null {
      try {
        const stored = localStorage.getItem(config.key);
        if (!stored) return null;
        const draft = JSON.parse(stored) as T;
        if (config.validate && !config.validate(draft)) {
          return null;
        }
        return draft;
      } catch (error) {
        logger.error(`Failed to load draft from ${config.key}:`, error);
        return null;
      }
    },

    saveDraft(draft: T): void {
      try {
        localStorage.setItem(config.key, JSON.stringify(draft));
      } catch (error) {
        logger.error(`Failed to save draft to ${config.key}:`, error);
      }
    },

    clearDraft(): void {
      try {
        localStorage.removeItem(config.key);
      } catch (error) {
        logger.error(`Failed to clear draft from ${config.key}:`, error);
      }
    },

    hasDraft(): boolean {
      return this.getDraft() !== null;
    },
  };
}

/**
 * Generic hook for managing draft state with persistence
 *
 * @param adapter - Storage adapter for draft persistence
 * @param defaultValue - Default value if no draft exists
 * @returns Draft state and control functions
 */
export function useDraftState<T>(
  adapter: DraftStorageAdapter<T>,
  defaultValue: T
) {
  const [draft, setDraftInternal] = useState<T>(() => {
    return adapter.getDraft() ?? defaultValue;
  });

  const setDraft = useCallback(
    (value: T | ((prev: T) => T)) => {
      setDraftInternal((prev) => {
        const newValue = typeof value === 'function'
          ? (value as (prev: T) => T)(prev)
          : value;
        adapter.saveDraft(newValue);
        return newValue;
      });
    },
    [adapter]
  );

  const clearDraft = useCallback(() => {
    adapter.clearDraft();
    setDraftInternal(defaultValue);
  }, [adapter, defaultValue]);

  const hasDraft = useCallback(() => {
    return adapter.hasDraft();
  }, [adapter]);

  return {
    draft,
    setDraft,
    clearDraft,
    hasDraft,
  };
}
