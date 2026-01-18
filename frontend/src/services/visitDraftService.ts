/**
 * Visit Draft Service
 *
 * NOTE: This service uses a legacy pattern. For new draft implementations,
 * consider using the generic useDraftState hook from @/hooks/utils/useDraftState
 *
 * This service is kept as-is due to its complex domain logic and tight integration
 * with the visit creation flow. A future refactoring could migrate this to use
 * useDraftState while preserving the helper methods as custom hooks.
 */

import { logger } from '@/lib/logger';
import { Restaurant, MenuItem } from '@/lib/pocketbase';
import { getTodayLocalDateString } from '@/lib/dateUtils';

const VISIT_DRAFT_KEY = 'visitDraft';

export interface VisitDraftItem {
  menuItem: MenuItem;
  description: string;
  rating: number;
  notes: string;
}

export interface RestaurantSearchState {
  restaurantSearchQuery: string;
  manualLocation: string;
  showNearbyPlaces: boolean;
  nearbyPlaces: Restaurant[];
}

export interface VisitDraft {
  restaurant: Restaurant | null;
  items: VisitDraftItem[];
  visitDate: string;
  visitVisibility: 'friends' | 'private';
  searchState?: RestaurantSearchState;
  sourceListItemId?: string; // List item ID to link back to after visit creation (from "I went there" flow)
}

const getEmptyDraft = (): VisitDraft => ({
  restaurant: null,
  items: [],
  visitDate: getTodayLocalDateString(),
  visitVisibility: 'friends',
});

export const visitDraftService = {
  /**
   * Get the current draft from localStorage
   */
  getDraft(): VisitDraft {
    try {
      const stored = localStorage.getItem(VISIT_DRAFT_KEY);
      if (!stored) {
        return getEmptyDraft();
      }
      return JSON.parse(stored);
    } catch (error) {
      logger.error('Failed to load visit draft:', error);
      return getEmptyDraft();
    }
  },

  /**
   * Save restaurant to draft
   */
  saveRestaurant(restaurant: Restaurant): void {
    const draft = this.getDraft();
    draft.restaurant = restaurant;
    localStorage.setItem(VISIT_DRAFT_KEY, JSON.stringify(draft));
  },

  /**
   * Save menu items to draft
   */
  saveItems(items: MenuItem[]): void {
    const draft = this.getDraft();

    // Convert MenuItem[] to VisitDraftItem[]
    // Preserve existing ratings/notes if items already exist in draft
    const existingItemsMap = new Map(
      draft.items.map(item => [item.menuItem.id, item])
    );

    draft.items = items.map(item => {
      const existing = existingItemsMap.get(item.id);
      return {
        menuItem: item,
        description: (item as any).description || existing?.description || '',
        rating: existing?.rating || 3, // Default rating
        notes: existing?.notes || '',
      };
    });

    localStorage.setItem(VISIT_DRAFT_KEY, JSON.stringify(draft));
  },

  /**
   * Update a specific item's rating and notes
   */
  updateItem(itemIndex: number, updates: Partial<Pick<VisitDraftItem, 'rating' | 'notes' | 'description'>>): void {
    const draft = this.getDraft();

    if (itemIndex >= 0 && itemIndex < draft.items.length) {
      draft.items[itemIndex] = {
        ...draft.items[itemIndex],
        ...updates,
      };
      localStorage.setItem(VISIT_DRAFT_KEY, JSON.stringify(draft));
    }
  },

  /**
   * Save visit metadata
   */
  saveMetadata(date: string, visibility: 'friends' | 'private'): void {
    const draft = this.getDraft();
    draft.visitDate = date;
    draft.visitVisibility = visibility;
    localStorage.setItem(VISIT_DRAFT_KEY, JSON.stringify(draft));
  },

  /**
   * Clear the draft (after successful submission)
   */
  clearDraft(): void {
    localStorage.removeItem(VISIT_DRAFT_KEY);
  },

  /**
   * Check if a draft exists
   */
  hasDraft(): boolean {
    const draft = this.getDraft();
    return draft.restaurant !== null || draft.items.length > 0;
  },

  /**
   * Check if restaurant is selected
   */
  hasRestaurant(): boolean {
    const draft = this.getDraft();
    return draft.restaurant !== null;
  },

  /**
   * Check if items are selected
   */
  hasItems(): boolean {
    const draft = this.getDraft();
    return draft.items.length > 0;
  },

  /**
   * Save restaurant search state
   */
  saveSearchState(searchState: RestaurantSearchState): void {
    const draft = this.getDraft();
    draft.searchState = searchState;
    localStorage.setItem(VISIT_DRAFT_KEY, JSON.stringify(draft));
  },

  /**
   * Get saved search state
   */
  getSearchState(): RestaurantSearchState | null {
    const draft = this.getDraft();
    return draft.searchState || null;
  },

  /**
   * Clear search state only
   */
  clearSearchState(): void {
    const draft = this.getDraft();
    draft.searchState = undefined;
    localStorage.setItem(VISIT_DRAFT_KEY, JSON.stringify(draft));
  },

  /**
   * Prepopulate draft from a bookmarked item ("I went there" flow)
   * This sets up the restaurant and item for direct navigation to rate-items
   */
  prepopulateFromBookmark(data: {
    restaurant: Restaurant;
    foodItemName: string;
    foodItemDescription?: string;
    listItemId: string;
  }): void {
    const now = new Date().toISOString();
    // Create a pseudo-MenuItem for the bookmark flow
    const pseudoMenuItem: MenuItem = {
      id: `bookmark-${data.listItemId}`,
      restaurant: data.restaurant.id,
      name: data.foodItemName,
      description: data.foodItemDescription,
      created: now,
      updated: now,
    };

    const draft: VisitDraft = {
      restaurant: data.restaurant,
      items: [{
        menuItem: pseudoMenuItem,
        description: data.foodItemDescription || '',
        rating: 3, // Default rating
        notes: '',
      }],
      visitDate: getTodayLocalDateString(),
      visitVisibility: 'friends',
      sourceListItemId: data.listItemId,
    };

    localStorage.setItem(VISIT_DRAFT_KEY, JSON.stringify(draft));
  },

  /**
   * Get source list item ID (for linking after visit creation)
   */
  getSourceListItemId(): string | null {
    const draft = this.getDraft();
    return draft.sourceListItemId || null;
  },

  /**
   * Clear source list item ID only
   */
  clearSourceListItemId(): void {
    const draft = this.getDraft();
    draft.sourceListItemId = undefined;
    localStorage.setItem(VISIT_DRAFT_KEY, JSON.stringify(draft));
  },
};
