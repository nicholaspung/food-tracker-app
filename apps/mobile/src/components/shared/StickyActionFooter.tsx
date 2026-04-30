import { View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';

import { createThemedStyles } from '../../theme';
import { Button } from '../../ui';

export interface StickyActionFooterAction {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary';
  testID?: string;
}

export interface StickyActionFooterProps {
  primaryAction: StickyActionFooterAction;
  secondaryAction?: StickyActionFooterAction;
  onLayout?: (event: LayoutChangeEvent) => void;
}

const useStyles = createThemedStyles((theme) => ({
  container: {
    backgroundColor: theme.colors.background.surface,
    borderTopColor: theme.colors.border.subtle,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  action: {
    flex: 1,
  },
}));

export function StickyActionFooter({
  primaryAction,
  secondaryAction,
  onLayout,
}: StickyActionFooterProps) {
  const styles = useStyles();

  return (
    <View onLayout={onLayout} style={styles.container}>
      {secondaryAction ? (
        <Button
          disabled={secondaryAction.disabled}
          label={secondaryAction.label}
          loading={secondaryAction.loading}
          onPress={secondaryAction.onPress}
          style={styles.action}
          testID={secondaryAction.testID}
          variant={secondaryAction.variant ?? 'secondary'}
        />
      ) : null}
      <Button
        disabled={primaryAction.disabled}
        label={primaryAction.label}
        loading={primaryAction.loading}
        onPress={primaryAction.onPress}
        style={styles.action}
        testID={primaryAction.testID}
        variant={primaryAction.variant ?? 'primary'}
      />
    </View>
  );
}
