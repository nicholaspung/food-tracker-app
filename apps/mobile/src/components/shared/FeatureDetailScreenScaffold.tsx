import type { BackHeaderScreenScaffoldProps } from './BackHeaderScreenScaffold';
import { BackHeaderScreenScaffold } from './BackHeaderScreenScaffold';

export type FeatureDetailScreenScaffoldProps = Omit<BackHeaderScreenScaffoldProps, 'headerVariant'>;

/**
 * Reusable scaffold for feature-detail pages that use a compact header with back navigation.
 * Use this for nested screens where the large profile-style header is too heavy.
 */
export function FeatureDetailScreenScaffold(props: FeatureDetailScreenScaffoldProps) {
  return <BackHeaderScreenScaffold {...props} headerVariant="compact" />;
}
