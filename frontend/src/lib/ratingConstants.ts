/**
 * Centralized rating constants used throughout the application
 * All rating labels and colors are defined here to ensure consistency
 */

export interface RatingOption {
  value: number;
  label: string;
  color: string;
}

export const RATING_OPTIONS: RatingOption[] = [
  { value: 1, label: "Don't eat", color: "bg-red-500" },
  { value: 2, label: "Not good not bad", color: "bg-orange-500" },
  { value: 3, label: "Worth trying", color: "bg-yellow-500" },
  { value: 4, label: "Eat occasionally", color: "bg-lime-500" },
  { value: 5, label: "Eat often", color: "bg-green-500" },
];

// Legacy arrays for backward compatibility with existing code
export const RATING_LABELS = RATING_OPTIONS.map(opt => opt.label);

export const RATING_COLORS = RATING_OPTIONS.map(opt => opt.color);

// Hex color values for use in canvas/image generation
export const RATING_COLORS_HEX = [
  "#ef4444", // red-500
  "#f97316", // orange-500
  "#eab308", // yellow-500
  "#84cc16", // lime-500
  "#22c55e", // green-500
];

/**
 * Get rating label by value (1-5)
 */
export function getRatingLabel(rating: number): string {
  return RATING_LABELS[rating - 1] || "Unknown";
}

/**
 * Get rating color class by value (1-5)
 */
export function getRatingColor(rating: number): string {
  return RATING_COLORS[rating - 1] || "bg-gray-500";
}

/**
 * Get rating hex color by value (1-5)
 */
export function getRatingColorHex(rating: number): string {
  return RATING_COLORS_HEX[rating - 1] || "#6b7280";
}
