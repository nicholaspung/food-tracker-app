/**
 * useDraftState Usage Examples
 *
 * This file demonstrates how to use the generic useDraftState hook
 * for managing temporary/draft data with localStorage persistence.
 */

import { createLocalStorageAdapter, useDraftState } from './useDraftState';

// ============================================================================
// Example 1: Simple Form Draft
// ============================================================================

interface ContactFormDraft {
  name: string;
  email: string;
  message: string;
}

const contactFormAdapter = createLocalStorageAdapter<ContactFormDraft>({
  key: 'contactFormDraft',
  defaultValue: {
    name: '',
    email: '',
    message: '',
  },
  validate: (draft) => {
    // Optional: validate that the draft has expected structure
    return typeof draft.name === 'string' && typeof draft.email === 'string';
  },
});

export function useContactFormDraft() {
  const { draft, setDraft, clearDraft, hasDraft } = useDraftState(
    contactFormAdapter,
    {
      name: '',
      email: '',
      message: '',
    }
  );

  return {
    formData: draft,
    updateForm: setDraft,
    clearForm: clearDraft,
    hasUnsavedChanges: hasDraft,
  };
}

// Usage in component:
// const { formData, updateForm, clearForm } = useContactFormDraft();
// updateForm({ ...formData, name: 'John' });

// ============================================================================
// Example 2: Multi-Step Wizard Draft
// ============================================================================

interface WizardDraft {
  step: number;
  userData: {
    name: string;
    age: number;
  };
  preferences: {
    theme: 'light' | 'dark';
    notifications: boolean;
  };
}

const wizardAdapter = createLocalStorageAdapter<WizardDraft>({
  key: 'wizardDraft',
  defaultValue: {
    step: 1,
    userData: { name: '', age: 0 },
    preferences: { theme: 'light', notifications: true },
  },
});

export function useWizardDraft() {
  const { draft, setDraft, clearDraft } = useDraftState(wizardAdapter, {
    step: 1,
    userData: { name: '', age: 0 },
    preferences: { theme: 'light', notifications: true },
  });

  const goToNextStep = () => {
    setDraft((prev) => ({ ...prev, step: prev.step + 1 }));
  };

  const goToPreviousStep = () => {
    setDraft((prev) => ({ ...prev, step: Math.max(1, prev.step - 1) }));
  };

  const updateUserData = (userData: Partial<WizardDraft['userData']>) => {
    setDraft((prev) => ({
      ...prev,
      userData: { ...prev.userData, ...userData },
    }));
  };

  return {
    draft,
    goToNextStep,
    goToPreviousStep,
    updateUserData,
    clearDraft,
  };
}

// ============================================================================
// Example 3: Shopping Cart Draft
// ============================================================================

interface CartItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
}

interface CartDraft {
  items: CartItem[];
  appliedCoupon?: string;
}

const cartAdapter = createLocalStorageAdapter<CartDraft>({
  key: 'shoppingCartDraft',
  defaultValue: {
    items: [],
  },
});

export function useCartDraft() {
  const { draft, setDraft, clearDraft } = useDraftState(cartAdapter, {
    items: [],
  });

  const addItem = (item: CartItem) => {
    setDraft((prev) => ({
      ...prev,
      items: [...prev.items, item],
    }));
  };

  const removeItem = (itemId: string) => {
    setDraft((prev) => ({
      ...prev,
      items: prev.items.filter((item) => item.id !== itemId),
    }));
  };

  const updateQuantity = (itemId: string, quantity: number) => {
    setDraft((prev) => ({
      ...prev,
      items: prev.items.map((item) =>
        item.id === itemId ? { ...item, quantity } : item
      ),
    }));
  };

  const applyCoupon = (coupon: string) => {
    setDraft((prev) => ({ ...prev, appliedCoupon: coupon }));
  };

  const getTotalPrice = () => {
    return draft.items.reduce(
      (total, item) => total + item.price * item.quantity,
      0
    );
  };

  return {
    cart: draft,
    addItem,
    removeItem,
    updateQuantity,
    applyCoupon,
    getTotalPrice,
    clearCart: clearDraft,
  };
}

// ============================================================================
// Migration Pattern from Legacy Services
// ============================================================================

/**
 * Legacy services like visitDraftService can be migrated in these steps:
 *
 * 1. Create an adapter for the draft type:
 *    const visitDraftAdapter = createLocalStorageAdapter<VisitDraft>({
 *      key: 'visitDraft',
 *      defaultValue: getEmptyDraft(),
 *    });
 *
 * 2. Replace the service with a hook:
 *    export function useVisitDraft() {
 *      const { draft, setDraft, clearDraft } = useDraftState(
 *        visitDraftAdapter,
 *        getEmptyDraft()
 *      );
 *
 *      // Migrate helper methods as functions/hooks
 *      const saveRestaurant = (restaurant: Restaurant) => {
 *        setDraft(prev => ({ ...prev, restaurant }));
 *      };
 *
 *      const saveItems = (items: MenuItem[]) => {
 *        setDraft(prev => ({ ...prev, items: convertItems(items) }));
 *      };
 *
 *      return {
 *        draft,
 *        saveRestaurant,
 *        saveItems,
 *        clearDraft,
 *        // ... other methods
 *      };
 *    }
 *
 * 3. Replace service calls in components:
 *    - Before: visitDraftService.getDraft()
 *    - After:  const { draft } = useVisitDraft()
 */
