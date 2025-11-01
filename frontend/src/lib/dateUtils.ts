/**
 * Date utility functions for handling UTC storage and local time display
 *
 * Key principles:
 * - All dates are stored in the database as UTC datetime strings (ISO 8601)
 * - All dates are displayed to users in their local timezone
 * - Date pickers work with local dates (YYYY-MM-DD format)
 */

/**
 * Get the current local date in YYYY-MM-DD format
 * Used for initializing date pickers
 */
export function getTodayLocalDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Convert a local date string (YYYY-MM-DD) to UTC ISO string
 * Treats the input as midnight in the user's local timezone
 *
 * @param localDateString - Date in YYYY-MM-DD format (e.g., "2025-10-31")
 * @returns ISO 8601 datetime string in UTC (e.g., "2025-10-31T07:00:00.000Z" if PST)
 */
export function localDateStringToUTC(localDateString: string): string {
  // Parse as local midnight (not UTC midnight)
  const localDate = new Date(localDateString + 'T00:00:00');
  return localDate.toISOString();
}

/**
 * Convert a UTC datetime string to local date string (YYYY-MM-DD)
 * Used for loading dates into date pickers
 *
 * @param utcDateString - ISO 8601 datetime string (e.g., "2025-10-31T07:00:00.000Z")
 * @returns Local date in YYYY-MM-DD format (e.g., "2025-10-31")
 */
export function utcToLocalDateString(utcDateString: string): string {
  const date = new Date(utcDateString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Format a UTC datetime string for display in the user's local timezone
 *
 * @param utcDateString - ISO 8601 datetime string
 * @param options - Intl.DateTimeFormatOptions for formatting
 * @returns Formatted date string in local timezone
 */
export function formatUTCDateForDisplay(
  utcDateString: string,
  options: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }
): string {
  const date = new Date(utcDateString);
  return date.toLocaleDateString('en-US', options);
}

/**
 * Format a local date string (YYYY-MM-DD) for display
 * This is used when displaying dates that are already in local format (e.g., from date pickers)
 *
 * @param localDateString - Date in YYYY-MM-DD format
 * @param options - Intl.DateTimeFormatOptions for formatting
 * @returns Formatted date string
 */
export function formatLocalDateForDisplay(
  localDateString: string,
  options: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }
): string {
  // Append T00:00:00 to force JavaScript to interpret as local midnight, not UTC midnight
  const date = new Date(localDateString + 'T00:00:00');
  return date.toLocaleDateString('en-US', options);
}
