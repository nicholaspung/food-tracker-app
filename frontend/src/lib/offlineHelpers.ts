/**
 * Offline error handling utilities
 * Standardizes offline success messaging and error detection
 */

/**
 * Check if an error is an offline-related queued error
 */
export function isOfflineError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.message?.includes("queued") || false;
  }
  return false;
}

/**
 * Handle success message when operation is queued offline
 * @param message - Success message to display
 * @param showSuccess - showSuccess function from useErrorHandler
 */
export function handleOfflineSuccess(
  message: string,
  showSuccess: (message: string) => void
): void {
  showSuccess(`You're offline. ${message} will sync when you're back online.`);
}

/**
 * Predefined offline success messages
 */
export const OFFLINE_MESSAGES = {
  ITEM_SAVED: "Your item has been saved and",
  VISIT_SAVED: "Your visit has been saved and",
  DELETION_QUEUED: "Your deletion has been queued and",
  UPDATE_QUEUED: "Your update has been queued and",
} as const;
