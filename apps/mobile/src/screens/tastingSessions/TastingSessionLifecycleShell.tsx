import type { ReactNode } from 'react';

import {
  EmptyState,
  ErrorState,
  FeatureDetailScreenScaffold,
} from '../../components/shared';
import type { TastingSessionRecord } from '../../features';

interface TastingSessionLifecycleShellProps {
  children: (session: TastingSessionRecord) => ReactNode;
  isError: boolean;
  loadingTitle: string;
  onBackPress: () => void;
  session: TastingSessionRecord | null | undefined;
  title: string;
}

export function TastingSessionLifecycleShell({
  children,
  isError,
  loadingTitle,
  onBackPress,
  session,
  title,
}: TastingSessionLifecycleShellProps) {
  if (isError && !session) {
    return (
      <FeatureDetailScreenScaffold headerScrollMode="fixed" onBackPress={onBackPress} title={title}>
        <ErrorState description="Could not load this tasting session." title="Session unavailable" />
      </FeatureDetailScreenScaffold>
    );
  }

  if (!session) {
    return (
      <FeatureDetailScreenScaffold headerScrollMode="fixed" onBackPress={onBackPress} title={title}>
        <EmptyState title={loadingTitle} />
      </FeatureDetailScreenScaffold>
    );
  }

  return <>{children(session)}</>;
}
