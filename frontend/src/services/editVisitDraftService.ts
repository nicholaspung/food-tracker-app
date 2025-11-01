import { Visit, FoodItem, Restaurant } from '@/lib/pocketbase';

const EDIT_VISIT_DRAFT_KEY = 'editVisitDraft';

export interface EditVisitDraftItem {
  id?: string; // undefined if new item
  name: string;
  description: string;
  rating: number;
  notes: string;
  _deleted?: boolean;
}

export interface EditVisitDraft {
  visitId: string;
  restaurant: Restaurant | null;
  menuItems: EditVisitDraftItem[];
  visitDate: string;
  visitVisibility: 'friends' | 'private';
  step: number;
}

export const editVisitDraftService = {
  /**
   * Get the current edit draft from localStorage
   */
  getDraft(visitId: string): EditVisitDraft | null {
    try {
      const stored = localStorage.getItem(EDIT_VISIT_DRAFT_KEY);
      if (!stored) {
        return null;
      }
      const draft = JSON.parse(stored) as EditVisitDraft;
      // Only return if it matches the current visit being edited
      if (draft.visitId === visitId) {
        return draft;
      }
      return null;
    } catch (error) {
      console.error('Failed to load edit visit draft:', error);
      return null;
    }
  },

  /**
   * Initialize or update the draft
   */
  saveDraft(draft: EditVisitDraft): void {
    try {
      localStorage.setItem(EDIT_VISIT_DRAFT_KEY, JSON.stringify(draft));
    } catch (error) {
      console.error('Failed to save edit visit draft:', error);
    }
  },

  /**
   * Update menu items in the draft
   */
  updateMenuItems(visitId: string, menuItems: EditVisitDraftItem[]): void {
    const draft = this.getDraft(visitId);
    if (draft) {
      draft.menuItems = menuItems;
      this.saveDraft(draft);
    }
  },

  /**
   * Update step in the draft
   */
  updateStep(visitId: string, step: number): void {
    const draft = this.getDraft(visitId);
    if (draft) {
      draft.step = step;
      this.saveDraft(draft);
    }
  },

  /**
   * Update visit metadata
   */
  updateMetadata(visitId: string, visitDate: string, visitVisibility: 'friends' | 'private'): void {
    const draft = this.getDraft(visitId);
    if (draft) {
      draft.visitDate = visitDate;
      draft.visitVisibility = visitVisibility;
      this.saveDraft(draft);
    }
  },

  /**
   * Clear the draft (after successful save or cancellation)
   */
  clearDraft(): void {
    try {
      localStorage.removeItem(EDIT_VISIT_DRAFT_KEY);
    } catch (error) {
      console.error('Failed to clear edit visit draft:', error);
    }
  },

  /**
   * Check if a draft exists for a specific visit
   */
  hasDraft(visitId: string): boolean {
    const draft = this.getDraft(visitId);
    return draft !== null;
  },
};
