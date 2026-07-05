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
  renderScaffold?: (props: {
    children: ReactNode;
    onBackPress: () => void;
    title: string;
  }) => ReactNode;
  session: TastingSessionRecord | null | undefined;
  title: string;
}

function renderDetailScaffold({
  children,
  onBackPress,
  title,
}: {
  children: ReactNode;
  onBackPress: () => void;
  title: string;
}) {
  return (
    <FeatureDetailScreenScaffold headerScrollMode="fixed" onBackPress={onBackPress} title={title}>
      {children}
    </FeatureDetailScreenScaffold>
  );
}

export function TastingSessionLifecycleShell({
  children,
  isError,
  loadingTitle,
  onBackPress,
  renderScaffold = renderDetailScaffold,
  session,
  title,
}: TastingSessionLifecycleShellProps) {
  if (isError && !session) {
    return renderScaffold({
      children: <ErrorState description="Could not load this tasting session." title="Session unavailable" />,
      onBackPress,
      title,
    });
  }

  if (!session) {
    return renderScaffold({
      children: <EmptyState title={loadingTitle} />,
      onBackPress,
      title,
    });
  }

  return <>{children(session)}</>;
}
