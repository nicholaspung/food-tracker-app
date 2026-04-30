import { Fragment, type ReactNode } from 'react';

import { EmptyState } from './EmptyState';
import { PageErrorToast } from './PageErrorToast';
import { Skeleton } from './Skeleton';

interface QueryListStateViewProps {
  actionLabel?: string;
  analyticsProps?: Record<string, string | number | boolean | null>;
  analyticsSource?: string;
  blockingErrorMessage: string;
  children?: ReactNode;
  emptyActionLabel?: string;
  emptyDescription: string;
  emptyTitle: string;
  hasBlockingError: boolean;
  hasRefreshError: boolean;
  isLoading: boolean;
  loadingSkeletonCount?: number;
  loadingSkeletonHeight?: number;
  onEmptyAction?: () => void;
  onRetry: () => void;
  refreshErrorMessage: string;
  showEmpty: boolean;
  title: string;
}

export function QueryListStateView({
  actionLabel = 'Retry',
  analyticsProps,
  analyticsSource,
  blockingErrorMessage,
  children,
  emptyActionLabel,
  emptyDescription,
  emptyTitle,
  hasBlockingError,
  hasRefreshError,
  isLoading,
  loadingSkeletonCount = 2,
  loadingSkeletonHeight = 20,
  onEmptyAction,
  onRetry,
  refreshErrorMessage,
  showEmpty,
  title,
}: QueryListStateViewProps) {
  const errorMessage = hasBlockingError
    ? blockingErrorMessage
    : hasRefreshError
      ? refreshErrorMessage
      : null;

  return (
    <>
      {isLoading ? (
        <>
          {Array.from({ length: loadingSkeletonCount }).map((_, index) => (
            <Skeleton height={loadingSkeletonHeight} key={index} />
          ))}
        </>
      ) : null}

      <PageErrorToast
        actionLabel={actionLabel}
        analyticsProps={analyticsProps}
        analyticsSource={analyticsSource}
        errorMessage={errorMessage}
        onAction={onRetry}
        title={title}
      />

      {!isLoading && !hasBlockingError && showEmpty ? (
        <EmptyState
          actionLabel={emptyActionLabel}
          analyticsProps={analyticsProps}
          analyticsSource={analyticsSource}
          description={emptyDescription}
          onAction={onEmptyAction}
          tone="default"
          title={emptyTitle}
        />
      ) : null}

      {!isLoading && !hasBlockingError && !showEmpty ? <Fragment>{children}</Fragment> : null}
    </>
  );
}
