import { AlertCircle, WifiOff, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryText?: string;
  type?: "error" | "warning" | "offline";
  fullScreen?: boolean;
  className?: string;
}

const icons = {
  error: AlertCircle,
  warning: AlertCircle,
  offline: WifiOff,
};

const colorClasses = {
  error: "text-red-600",
  warning: "text-yellow-600",
  offline: "text-gray-600",
};

/**
 * Reusable error state component
 *
 * @example
 * ```tsx
 * // Simple error
 * <ErrorState message="Failed to load data" />
 *
 * // With retry
 * <ErrorState
 *   message="Connection failed"
 *   onRetry={() => refetch()}
 *   retryText="Try Again"
 * />
 *
 * // Offline state
 * <ErrorState
 *   type="offline"
 *   message="You're offline. Some features are unavailable."
 * />
 *
 * // Full screen
 * <ErrorState
 *   fullScreen
 *   title="Something went wrong"
 *   message="Please try again later"
 * />
 * ```
 */
export function ErrorState({
  title,
  message,
  onRetry,
  retryText = "Try Again",
  type = "error",
  fullScreen = false,
  className = "",
}: ErrorStateProps) {
  const Icon = icons[type];

  const content = (
    <div className={`flex flex-col items-center justify-center gap-4 text-center ${className}`}>
      <Icon className={`w-12 h-12 ${colorClasses[type]}`} />
      {title && (
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
      )}
      <p className="text-sm text-gray-600 max-w-md">{message}</p>
      {onRetry && (
        <Button onClick={onRetry} variant="outline" size="sm">
          <RefreshCw className="w-4 h-4 mr-2" />
          {retryText}
        </Button>
      )}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        {content}
      </div>
    );
  }

  return content;
}

/**
 * Error state for cards
 */
export function CardErrorState({
  title,
  message,
  onRetry,
  retryText,
  type = "error",
}: Omit<ErrorStateProps, "fullScreen" | "className">) {
  return (
    <Card>
      <CardContent className="py-12">
        <ErrorState
          title={title}
          message={message}
          onRetry={onRetry}
          retryText={retryText}
          type={type}
        />
      </CardContent>
    </Card>
  );
}

/**
 * Inline error alert (for forms, etc.)
 */
export function InlineError({
  message,
  type = "error",
}: Pick<ErrorStateProps, "message" | "type">) {
  const Icon = icons[type];

  return (
    <Alert variant={type === "error" ? "destructive" : "default"} className="mb-4">
      <Icon className="h-4 w-4" />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

/**
 * Empty state (when no data exists)
 */
export function EmptyState({
  title,
  message,
  action,
  actionText,
  icon: Icon = AlertCircle,
}: {
  title: string;
  message: string;
  action?: () => void;
  actionText?: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 text-center py-12">
      <Icon className="w-12 h-12 text-gray-400" />
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
        <p className="text-sm text-gray-600 max-w-md">{message}</p>
      </div>
      {action && actionText && (
        <Button onClick={action} variant="outline">
          {actionText}
        </Button>
      )}
    </div>
  );
}
