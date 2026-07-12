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
type FeatureFormScaffoldProps = Omit<FeatureFormScreenScaffoldProps, 'children'>;
type FeatureFormScaffoldAction = NonNullable<FeatureFormScaffoldProps['primaryAction']>;

type FeatureFormReadStateScaffoldOverride = Omit<
  Partial<FeatureFormScaffoldProps>,
  'primaryAction' | 'secondaryAction'
> & {
  primaryAction?: Partial<FeatureFormScaffoldAction>;
  secondaryAction?: Partial<FeatureFormScaffoldAction>;
};

export interface FeatureFormReadStateScaffoldConfig {
  base: Omit<FeatureFormScaffoldProps, 'primaryAction' | 'secondaryAction'> & {
    primaryAction: FeatureFormScaffoldAction;
    secondaryAction: FeatureFormScaffoldAction;
  };
  overrides?: Partial<Record<FeatureFormReadState, FeatureFormReadStateScaffoldOverride>>;
}

interface FeatureFormReadStateLoadingConfig {
  content?: ReactNode;
  label?: string;
  skeletonHeights?: number[];
}

export interface FeatureFormReadStateScaffoldProps {
  empty?: EmptyStateProps;
  error?: ErrorStateProps;
  loading?: FeatureFormReadStateLoadingConfig;
  scaffold: FeatureFormScaffoldProps | FeatureFormReadStateScaffoldConfig;
  state: FeatureFormReadState;
}

function mergeAction(
  base: FeatureFormScaffoldAction,
  override: FeatureFormReadStateScaffoldOverride['primaryAction'],
): FeatureFormScaffoldAction {
  if (!override) {
    return base;
  }

  return { ...base, ...override };
}

function resolveScaffoldConfig(
  scaffold: FeatureFormReadStateScaffoldProps['scaffold'],
  state: FeatureFormReadState,
): FeatureFormScaffoldProps {
  if (!('base' in scaffold)) {
    return scaffold;
  }

  const override = scaffold.overrides?.[state];

  return {
    ...scaffold.base,
    ...override,
    primaryAction: mergeAction(scaffold.base.primaryAction, override?.primaryAction),
    secondaryAction: mergeAction(scaffold.base.secondaryAction, override?.secondaryAction),
  };
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
  const resolvedScaffold = resolveScaffoldConfig(scaffold, state);

  if (state === 'loading') {
    content = renderLoadingState(loading);
  } else if (state === 'error') {
    content = <ErrorState {...error} />;
  } else {
    content = <EmptyState title="Not found" {...empty} />;
  }

  return <FeatureFormScreenScaffold {...resolvedScaffold}>{content}</FeatureFormScreenScaffold>;
}
