import type { ReactNode } from 'react';

import {
  EmptyState,
  Skeleton,
} from '../../components/shared';
import { PageErrorToast } from '../../components/shared/PageErrorToast';

interface SettingsDetailReadStateViewProps {
  children: ReactNode;
  errorDescription: string;
  errorTitle: string;
  isError: boolean;
  isLoading: boolean;
  onRetry: () => void;
}

export function SettingsDetailReadStateView({
  children,
  errorDescription,
  errorTitle,
  isError,
  isLoading,
  onRetry,
}: SettingsDetailReadStateViewProps) {
  if (isLoading) {
    return (
      <>
        <Skeleton height={20} />
        <Skeleton height={20} />
        <Skeleton height={20} />
      </>
    );
  }

  if (isError) {
    return (
      <>
        <PageErrorToast
          actionLabel="Retry"
          errorMessage={errorDescription}
          onAction={onRetry}
          title={errorTitle}
        />
        <EmptyState
          actionLabel="Retry"
          description={errorDescription}
          onAction={onRetry}
          title={errorTitle}
        />
      </>
    );
  }

  return <>{children}</>;
}
