import type { ReactNode } from 'react';

import { EmptyState, type EmptyStateProps } from './EmptyState';
import { ErrorState, type ErrorStateProps } from './ErrorState';
import {
  FeatureFormScreenScaffold,
  type FeatureFormScreenScaffoldProps,
} from './FeatureFormScreenScaffold';
import { LoadingState } from './LoadingState';
import { Skeleton } from './Skeleton';

type FeatureFormReadState = 'loading' | 'error' | 'empty';

interface FeatureFormReadStateLoadingConfig {
  content?: ReactNode;
  label?: string;
  skeletonHeights?: number[];
}

export interface FeatureFormReadStateScaffoldProps {
  empty?: EmptyStateProps;
  error?: ErrorStateProps;
  loading?: FeatureFormReadStateLoadingConfig;
  scaffold: Omit<FeatureFormScreenScaffoldProps, 'children'>;
  state: FeatureFormReadState;
}

function renderLoadingState(config?: FeatureFormReadStateLoadingConfig) {
  if (config?.content) {
    return config.content;
  }

  if (config?.label) {
    return <LoadingState label={config.label} />;
  }

  const skeletonHeights = config?.skeletonHeights ?? [20, 20, 20];
  return skeletonHeights.map((height, index) => <Skeleton height={height} key={`${height}-${index}`} />);
}

export function FeatureFormReadStateScaffold({
  empty,
  error,
  loading,
  scaffold,
  state,
}: FeatureFormReadStateScaffoldProps) {
  let content: ReactNode;

  if (state === 'loading') {
    content = renderLoadingState(loading);
  } else if (state === 'error') {
    content = <ErrorState {...error} />;
  } else {
    content = <EmptyState title="Not found" {...empty} />;
  }

  return <FeatureFormScreenScaffold {...scaffold}>{content}</FeatureFormScreenScaffold>;
}
