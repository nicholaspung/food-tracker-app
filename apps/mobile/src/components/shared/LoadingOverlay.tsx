import { ActivityIndicator, Modal, View } from 'react-native';

import { getPlatformPointerEventsProps, getPlatformPointerEventsStyle } from '../../lib/platformPointerEvents';
import { createThemedStyles, useTheme } from '../../theme';
import { Text } from '../../ui';

export interface LoadingOverlayProps {
  visible: boolean;
  label?: string;
}

const useStyles = createThemedStyles((theme) => ({
  overlay: {
    flex: 1,
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
  const styles = useStyles();
  const pointerEventsStyle = getPlatformPointerEventsStyle('auto');

  return (
    <Modal
      animationType="fade"
      onRequestClose={() => undefined}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <View
        {...getPlatformPointerEventsProps('auto')}
        style={pointerEventsStyle ? [styles.overlay, pointerEventsStyle] : styles.overlay}
      >
        <View style={styles.card}>
          <ActivityIndicator color={theme.colors.button.primaryBg} />
          {label ? <Text>{label}</Text> : null}
        </View>
      </View>
    </Modal>
  );
}
