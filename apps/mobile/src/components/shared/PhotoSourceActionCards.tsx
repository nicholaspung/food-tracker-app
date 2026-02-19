import { Ionicons } from '@expo/vector-icons';
import type { StyleProp, ViewStyle } from 'react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '../../theme';
import { Text } from '../../ui';

interface PhotoSourceActionCardsProps {
  onCameraPress: () => void;
  onGalleryPress: () => void;
  disabled?: boolean;
  cameraTitle?: string;
  cameraSubtitle?: string;
  galleryTitle?: string;
  gallerySubtitle?: string;
  containerStyle?: StyleProp<ViewStyle>;
}

export function PhotoSourceActionCards({
  onCameraPress,
  onGalleryPress,
  disabled = false,
  cameraTitle = 'Capture',
  cameraSubtitle = 'Camera',
  galleryTitle = 'Upload',
  gallerySubtitle = 'Photo Library',
  containerStyle,
}: PhotoSourceActionCardsProps) {
  const theme = useTheme();

  const styles = StyleSheet.create({
    row: {
      flexDirection: 'row',
      gap: theme.spacing.xs,
    },
    card: {
      alignItems: 'center',
      backgroundColor: theme.colors.background.surface,
      borderColor: theme.colors.border.default,
      borderRadius: theme.radii.md,
      borderWidth: 1,
      flex: 1,
      gap: theme.spacing.xxs,
      justifyContent: 'center',
      minHeight: 74,
      paddingHorizontal: theme.spacing.xs,
      paddingVertical: theme.spacing.sm,
    },
    cardPressed: {
      backgroundColor: theme.colors.background.app,
      borderColor: theme.colors.border.strong,
    },
    cardDisabled: {
      opacity: 0.55,
    },
    title: {
      fontSize: theme.typography.label.fontSize,
      fontWeight: theme.typography.label.fontWeight,
      lineHeight: theme.typography.label.lineHeight,
    },
  });

  return (
    <View style={[styles.row, containerStyle]}>
      <Pressable
        accessibilityLabel="Capture photo with camera"
        accessibilityRole="button"
        disabled={disabled}
        onPress={onCameraPress}
        style={({ pressed }) => [
          styles.card,
          disabled ? styles.cardDisabled : null,
          pressed && !disabled ? styles.cardPressed : null,
        ]}
      >
        <Ionicons color={theme.colors.text.secondary} name="camera-outline" size={18} />
        <Text style={styles.title}>{cameraTitle}</Text>
        <Text tone="secondary" variant="bodySm">
          {cameraSubtitle}
        </Text>
      </Pressable>

      <Pressable
        accessibilityLabel="Upload photo from library"
        accessibilityRole="button"
        disabled={disabled}
        onPress={onGalleryPress}
        style={({ pressed }) => [
          styles.card,
          disabled ? styles.cardDisabled : null,
          pressed && !disabled ? styles.cardPressed : null,
        ]}
      >
        <Ionicons color={theme.colors.text.secondary} name="image-outline" size={18} />
        <Text style={styles.title}>{galleryTitle}</Text>
        <Text tone="secondary" variant="bodySm">
          {gallerySubtitle}
        </Text>
      </Pressable>
    </View>
  );
}
