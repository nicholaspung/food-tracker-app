/**
 * Application limits and constraints
 */

/**
 * Daily limit for restaurant name detection (OCR) operations
 * Non-subscriber users can process this many photos per day
 */
export const RESTAURANT_DETECTION_DAILY_LIMIT = 5;

/**
 * Maximum photos allowed per food item during rating
 * Non-subscriber users are limited to this many photos
 */
export const MAX_PHOTOS_PER_FOOD_ITEM = 3;

/**
 * Maximum photos allowed per note
 * Notes can have more photos since they're for personal reference
 */
export const MAX_PHOTOS_PER_NOTE = 5;
