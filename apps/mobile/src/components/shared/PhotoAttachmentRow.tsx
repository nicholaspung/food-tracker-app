import { Ionicons } from '../../ui/AppIcon';
import { Pressable } from 'react-native';
import type { GestureResponderEvent, StyleProp, ViewStyle } from 'react-native';

import { createThemedStyles, useTheme } from '../../theme';
import { Text } from '../../ui';
import { CachedRemoteImage } from './CachedRemoteImage';

interface PhotoAttachmentRowProps {
  uri: string;
  label: string;
  onRemove: () => void;
  onPress?: () => void;
  containerStyle?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

const useStyles = createThemedStyles((theme) => ({
  container: {
    alignItems: 'center',
    backgroundColor: theme.colors.background.surface,
    borderColor: theme.colors.border.default,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.xs,
    minHeight: 44,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: theme.spacing.xs,
  },
  containerPressed: {
    backgroundColor: theme.colors.background.muted,
    borderColor: theme.colors.border.strong,
  },
  thumbnail: {
    backgroundColor: theme.colors.background.muted,
    borderRadius: theme.radii.sm,
    height: 28,
    width: 28,
  },
  name: {
    flex: 1,
  },
  removeButton: {
    alignItems: 'center',
    borderColor: theme.colors.border.default,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    height: 20,
    justifyContent: 'center',
    width: 20,
  },
}));

export function PhotoAttachmentRow({
  uri,
  label,
  onRemove,
  onPress,
  containerStyle,
  accessibilityLabel,
}: PhotoAttachmentRowProps) {
  const theme = useTheme();
  const isPressable = typeof onPress === 'function';
  const styles = useStyles();

  const handleRemovePress = (event: GestureResponderEvent) => {
    event.stopPropagation();
    onRemove();
  };

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={isPressable ? 'button' : undefined}
      disabled={!isPressable}
      onPress={onPress}
      style={({ pressed }) => [
        styles.container,
        containerStyle,
        pressed && isPressable ? styles.containerPressed : null,
      ]}
    >
      <CachedRemoteImage uri={uri} style={styles.thumbnail} />
      <Text ellipsizeMode="tail" numberOfLines={1} style={styles.name} variant="bodySm">
        {label}
      </Text>
      <Pressable
        accessibilityLabel="Remove attached photo"
        accessibilityRole="button"
        onPress={handleRemovePress}
        style={styles.removeButton}
      >
        <Ionicons color={theme.colors.text.secondary} name="close" size={12} />
      </Pressable>
    </Pressable>
  );
}
