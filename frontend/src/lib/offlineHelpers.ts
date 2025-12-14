/**
 * Offline error handling utilities
 * Standardizes offline success messaging and error detection
 */

// Re-export offline messages from constants
export { OFFLINE_MESSAGES } from '@/constants/offline';

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
