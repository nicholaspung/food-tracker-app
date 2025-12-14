/**
 * Quick track item category constants
 */

export const ITEM_CATEGORIES = [
  { value: "convenience_store", label: "Convenience Store" },
  { value: "packaged_food", label: "Packaged Food" },
  { value: "homemade", label: "Homemade" },
  { value: "recipe", label: "Recipe" },
  { value: "other", label: "Other" },
] as const;

export type ItemCategory = typeof ITEM_CATEGORIES[number]["value"];
