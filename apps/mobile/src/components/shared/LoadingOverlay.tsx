import { useEffect, useRef } from 'react';
import { AccessibilityInfo, ActivityIndicator, Modal, Platform, View } from 'react-native';

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
  const lastAnnouncedLabelRef = useRef<string | null>(null);
  const accessibilityLabel = label?.trim() || 'Loading';
  const visibleRef = useRef(visible);
  const accessibilityLabelRef = useRef(accessibilityLabel);
  visibleRef.current = visible;
  accessibilityLabelRef.current = accessibilityLabel;

  useEffect(() => {
    if (!visible) {
      lastAnnouncedLabelRef.current = null;
      return;
    }

    if (
      Platform.OS === 'ios' &&
      lastAnnouncedLabelRef.current !== null &&
      lastAnnouncedLabelRef.current !== accessibilityLabel
    ) {
      lastAnnouncedLabelRef.current = accessibilityLabel;
      AccessibilityInfo.announceForAccessibility(accessibilityLabel);
    }
  }, [accessibilityLabel, visible]);

  const announceVisibleOverlay = () => {
    const currentLabel = accessibilityLabelRef.current;
    if (
      Platform.OS !== 'ios' ||
      !visibleRef.current ||
      lastAnnouncedLabelRef.current === currentLabel
    ) {
      return;
    }

    lastAnnouncedLabelRef.current = currentLabel;
    AccessibilityInfo.announceForAccessibility(currentLabel);
  };

  return (
    <Modal
      accessibilityLabel={accessibilityLabel}
      accessibilityViewIsModal
      animationType="fade"
      onRequestClose={() => undefined}
      onShow={announceVisibleOverlay}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <View
        {...getPlatformPointerEventsProps('auto')}
        style={pointerEventsStyle ? [styles.overlay, pointerEventsStyle] : styles.overlay}
      >
        <View
          accessibilityLabel={accessibilityLabel}
          accessibilityLiveRegion="polite"
          accessibilityRole="progressbar"
          accessibilityState={{ busy: true }}
          accessible
          style={styles.card}
        >
          <ActivityIndicator accessible={false} color={theme.colors.button.primaryBg} />
          {label ? <Text>{label}</Text> : null}
        </View>
      </View>
    </Modal>
  );
}
