import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface LoadingStateProps {
  message?: string;
  fullScreen?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeClasses = {
  sm: "w-4 h-4",
  md: "w-8 h-8",
  lg: "w-12 h-12",
};

/**
 * Reusable loading state component
 *
 * @example
 * ```tsx
 * // Simple spinner
 * <LoadingState />
 *
 * // With message
 * <LoadingState message="Loading your data..." />
 *
 * // Full screen
 * <LoadingState fullScreen message="Please wait..." />
 *
 * // In a card
 * <Card>
 *   <CardContent>
 *     <LoadingState message="Loading..." />
 *   </CardContent>
 * </Card>
 * ```
 */
export function LoadingState({
  message = "Loading...",
  fullScreen = false,
  size = "md",
  className = "",
}: LoadingStateProps) {
  const content = (
    <div className={`flex flex-col items-center justify-center gap-3 ${className}`}>
      <Loader2 className={`${sizeClasses[size]} animate-spin text-gray-400`} />
      {message && (
        <p className="text-sm text-gray-600">{message}</p>
      )}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        {content}
      </div>
    );
  }

  return content;
}

/**
 * Loading state for cards
 */
export function CardLoadingState({
  message = "Loading...",
  size = "md",
}: Pick<LoadingStateProps, "message" | "size">) {
  return (
    <Card>
      <CardContent className="py-12">
        <LoadingState message={message} size={size} />
      </CardContent>
    </Card>
  );
}

/**
 * Inline loading spinner (no text)
 */
export function InlineSpinner({
  size = "sm",
  className = "",
}: Pick<LoadingStateProps, "size" | "className">) {
  return (
    <Loader2 className={`${sizeClasses[size]} animate-spin ${className}`} />
  );
}
