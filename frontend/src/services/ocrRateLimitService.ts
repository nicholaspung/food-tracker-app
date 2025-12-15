/**
 * Service to track and enforce rate limits for failed OCR attempts
 * Users are limited to 5 failed non-menu image uploads per day
 */

const STORAGE_KEY_PREFIX = 'ocr_failed_attempts_';
const MAX_DAILY_ATTEMPTS = 5;

/**
 * Get today's date in YYYY-MM-DD format for storage key
 */
function getTodayKey(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${STORAGE_KEY_PREFIX}${year}-${month}-${day}`;
}

/**
 * Get the number of failed attempts for today
 */
export function getFailedAttemptsToday(): number {
  try {
    const key = getTodayKey();
    const stored = localStorage.getItem(key);
    return stored ? parseInt(stored, 10) : 0;
  } catch (error) {
    logger.error('Failed to get OCR rate limit:', error);
    return 0;
  }
}

/**
 * Increment the failed attempts counter for today
 */
export function incrementFailedAttempts(): void {
  try {
    const key = getTodayKey();
    const current = getFailedAttemptsToday();
    localStorage.setItem(key, String(current + 1));

    // Clean up old entries (keep last 7 days)
    cleanupOldEntries();
  } catch (error) {
    logger.error('Failed to increment OCR rate limit:', error);
  }
}

/**
 * Check if user has exceeded daily limit
 */
export function hasExceededDailyLimit(): boolean {
  return getFailedAttemptsToday() >= MAX_DAILY_ATTEMPTS;
}

/**
 * Get remaining attempts for today
 */
export function getRemainingAttempts(): number {
  const attempts = getFailedAttemptsToday();
  return Math.max(0, MAX_DAILY_ATTEMPTS - attempts);
}

/**
 * Clean up old rate limit entries (older than 7 days)
 */
function cleanupOldEntries(): void {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Get all keys from localStorage
    const keys = Object.keys(localStorage);

    for (const key of keys) {
      if (key.startsWith(STORAGE_KEY_PREFIX)) {
        // Extract date from key (format: ocr_failed_attempts_YYYY-MM-DD)
        const dateStr = key.replace(STORAGE_KEY_PREFIX, '');
        const entryDate = new Date(dateStr);

        // Remove if older than 7 days
        if (entryDate < sevenDaysAgo) {
          localStorage.removeItem(key);
        }
      }
    }
  } catch (error) {
    logger.error('Failed to cleanup old OCR rate limit entries:', error);
  }
}

/**
 * Reset today's counter (for testing purposes)
 */
export function resetTodayCounter(): void {
  try {
    const key = getTodayKey();
    localStorage.removeItem(key);
  } catch (error) {
    logger.error('Failed to reset OCR rate limit:', error);
  }
}
