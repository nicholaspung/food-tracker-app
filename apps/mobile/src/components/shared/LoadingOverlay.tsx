import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { createThemedStyles, useTheme } from '../../theme';
import { Text } from '../../ui';

export interface LoadingOverlayProps {
  visible: boolean;
  label?: string;
}

const useStyles = createThemedStyles((theme) => ({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.background.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.lg,
  },
  card: {
    borderWidth: 1,
    borderColor: theme.colors.border.default,
    borderRadius: theme.radii.lg,
    backgroundColor: theme.colors.background.surface,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
}));

export function LoadingOverlay({ visible, label }: LoadingOverlayProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useStyles();

  if (!visible) {
    return null;
  }

  return (
    <View
      pointerEvents="auto"
      style={[
        styles.overlay,
        {
          top: -insets.top,
          bottom: -insets.bottom,
          left: -insets.left,
          right: -insets.right,
        },
      ]}
    >
      <View style={styles.card}>
        <ActivityIndicator color={theme.colors.button.primaryBg} />
        {label ? <Text>{label}</Text> : null}
      </View>
    </View>
  );
}
