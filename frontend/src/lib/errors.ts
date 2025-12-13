/**
 * Type definitions for error handling across the application
 * Provides type-safe error handling for PocketBase and general errors
 */

/**
 * PocketBase error response structure
 * Used when PocketBase API calls fail
 */
export interface PocketBaseError {
  status: number;
  response?: {
    code: number;
    message: string;
    data?: Record<string, {
      code: string;
      message: string;
    }>;
  };
  isAbort?: boolean;
  message?: string;
}

/**
 * Type guard to check if an error is a PocketBase error
 * @param error - The error to check
 * @returns true if the error is a PocketBaseError
 */
export function isPocketBaseError(error: unknown): error is PocketBaseError {
  return (
    typeof error === 'object' &&
    error !== null &&
    ('status' in error || 'response' in error || 'isAbort' in error)
  );
}

/**
 * Generic error handler type
 */
export type ErrorHandler = (error: unknown) => void;

/**
 * Async operation result type
 */
export type AsyncResult<T> = Promise<T>;
