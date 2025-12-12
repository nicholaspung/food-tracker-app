import { useState, useCallback } from 'react';
import { useSync } from '@/contexts/SyncContext';

export type ErrorSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface ErrorState {
  message: string;
  severity: ErrorSeverity;
  retryable?: boolean;
  source?: string;
}

export interface ErrorHandlerOptions {
  /** Component/page name for debugging */
  source?: string;
  /** Default severity level */
  defaultSeverity?: ErrorSeverity;
  /** Callback when retry is clicked */
  onRetry?: () => void;
  /** Auto-clear error after duration (ms) */
  autoClearMs?: number;
}

export interface HandleErrorOptions {
  /** Error severity level */
  severity?: ErrorSeverity;
  /** Whether error is retryable */
  retryable?: boolean;
  /** Custom error message (overrides error.message) */
  customMessage?: string;
}

/**
 * Standardized error handling hook
 *
 * @example
 * ```tsx
 * const { error, handleError, clearError, showValidation, showOffline } = useErrorHandler({
 *   source: 'LoginPage',
 *   onRetry: () => retryLogin()
 * });
 *
 * try {
 *   await loginMutation.mutateAsync(data);
 * } catch (err) {
 *   handleError(err, { severity: 'critical', retryable: true });
 * }
 *
 * // Validation
 * if (!email) {
 *   showValidation('Email is required');
 *   return;
 * }
 *
 * // Offline check
 * if (!isOnline) {
 *   showOffline('Login requires internet connection');
 *   return;
 * }
 * ```
 */
export function useErrorHandler(options: ErrorHandlerOptions = {}) {
  const {
    source,
    defaultSeverity = 'error',
    onRetry,
    autoClearMs,
  } = options;

  const [errorState, setErrorState] = useState<ErrorState | null>(null);
  const { isOnline } = useSync();

  /**
   * Clear the current error
   */
  const clearError = useCallback(() => {
    setErrorState(null);
  }, []);

  /**
   * Parse PocketBase API error responses
   */
  const parsePocketBaseError = useCallback((err: any): string => {
    if (err?.response?.data) {
      const errorData = err.response.data;

      // Field-specific errors
      const fieldErrors = Object.entries(errorData)
        .filter(([key]) => key !== 'code' && key !== 'message')
        .map(([field, value]: [string, any]) => {
          const message = value?.message || value;
          return `${field}: ${message}`;
        });

      if (fieldErrors.length > 0) {
        return fieldErrors[0]; // Return first field error
      }

      // Fallback to data message
      if (errorData.message) {
        return errorData.message;
      }
    }

    // Standard error message
    return err?.message || 'An unexpected error occurred';
  }, []);

  /**
   * Main error handler
   */
  const handleError = useCallback((
    err: any,
    handleOptions: HandleErrorOptions = {}
  ) => {
    const {
      severity = defaultSeverity,
      retryable = false,
      customMessage,
    } = handleOptions;

    let message: string;

    if (customMessage) {
      message = customMessage;
    } else if (typeof err === 'string') {
      message = err;
    } else {
      message = parsePocketBaseError(err);
    }

    const newErrorState: ErrorState = {
      message,
      severity,
      retryable: retryable && !!onRetry,
      source,
    };

    setErrorState(newErrorState);

    // Console logging for debugging
    if (source) {
      console.error(`[${source}] Error:`, err);
    } else {
      console.error('Error:', err);
    }

    // Auto-clear if specified
    if (autoClearMs) {
      setTimeout(clearError, autoClearMs);
    }
  }, [defaultSeverity, onRetry, source, parsePocketBaseError, clearError, autoClearMs]);

  /**
   * Show a validation error
   */
  const showValidation = useCallback((message: string) => {
    setErrorState({
      message,
      severity: 'warning',
      retryable: false,
      source,
    });
  }, [source]);

  /**
   * Show an offline error
   */
  const showOffline = useCallback((message?: string) => {
    const defaultMessage = 'This action requires an internet connection. Please connect and try again.';

    setErrorState({
      message: message || defaultMessage,
      severity: 'warning',
      retryable: false,
      source,
    });
  }, [source]);

  /**
   * Show a success message (info severity)
   */
  const showSuccess = useCallback((message: string, autoClear = true) => {
    setErrorState({
      message,
      severity: 'info',
      retryable: false,
      source,
    });

    if (autoClear) {
      setTimeout(clearError, 3000); // Auto-clear success messages after 3s
    }
  }, [source, clearError]);

  /**
   * Check if offline and show error if true
   * @returns true if offline (error shown), false if online
   */
  const checkOffline = useCallback((customMessage?: string): boolean => {
    if (!isOnline) {
      showOffline(customMessage);
      return true;
    }
    return false;
  }, [isOnline, showOffline]);

  return {
    /** Current error state (null if no error) */
    error: errorState,
    /** Handle an error from try-catch or callback */
    handleError,
    /** Clear the current error */
    clearError,
    /** Show a validation error */
    showValidation,
    /** Show an offline error */
    showOffline,
    /** Show a success message */
    showSuccess,
    /** Check if offline and show error if true */
    checkOffline,
    /** Retry callback (if provided in options) */
    retry: onRetry,
  };
}
