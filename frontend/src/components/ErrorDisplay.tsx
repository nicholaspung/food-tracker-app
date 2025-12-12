import { ErrorState } from '@/hooks/useErrorHandler';
import { AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

export interface ErrorDisplayProps {
  /** Error state from useErrorHandler */
  error: ErrorState | null;
  /** Callback to clear the error */
  onClear?: () => void;
  /** Callback to retry the failed operation */
  onRetry?: () => void;
  /** Optional test ID for E2E testing */
  testId?: string;
  /** Optional className for additional styling */
  className?: string;
}

/**
 * Standardized error display component
 *
 * Works with useErrorHandler hook to display errors consistently across the app.
 *
 * @example
 * const { error, handleError, clearError, retry } = useErrorHandler({
 *   source: 'LoginPage',
 *   onRetry: () => retryLogin()
 * });
 *
 * <ErrorDisplay error={error} onClear={clearError} onRetry={retry} testId="login-error" />
 */
export function ErrorDisplay({
  error,
  onClear,
  onRetry,
  testId = 'error-display',
  className = '',
}: ErrorDisplayProps) {
  if (!error) return null;

  const severityStyles = {
    info: {
      container: 'bg-blue-50 border-blue-200',
      text: 'text-blue-800',
      icon: <Info className="w-5 h-5 text-blue-600 flex-shrink-0" />,
    },
    warning: {
      container: 'bg-yellow-50 border-yellow-200',
      text: 'text-yellow-800',
      icon: <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0" />,
    },
    error: {
      container: 'bg-red-50 border-red-200',
      text: 'text-red-800',
      icon: <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />,
    },
    critical: {
      container: 'bg-red-100 border-red-300',
      text: 'text-red-900',
      icon: <AlertCircle className="w-5 h-5 text-red-700 flex-shrink-0" />,
    },
  };

  const style = severityStyles[error.severity];

  return (
    <div
      className={`p-3 border rounded-md ${style.container} ${className}`}
      data-testid={testId}
      role="alert"
    >
      <div className="flex items-start gap-3">
        {style.icon}

        <div className="flex-1 min-w-0">
          <p className={`text-sm ${style.text}`} data-testid={`${testId}-message`}>
            {error.message}
          </p>

          {error.retryable && onRetry && (
            <button
              onClick={onRetry}
              className={`mt-2 text-sm font-medium underline ${style.text} hover:no-underline`}
              data-testid={`${testId}-retry`}
            >
              Try again
            </button>
          )}
        </div>

        {onClear && (
          <button
            onClick={onClear}
            className={`${style.text} hover:opacity-70 transition-opacity`}
            aria-label="Dismiss error"
            data-testid={`${testId}-dismiss`}
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
