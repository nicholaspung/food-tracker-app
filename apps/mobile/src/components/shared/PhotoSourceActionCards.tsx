import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '../../theme';
import { IconActionCard } from './IconActionCard';

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
    action: {
      flex: 1,
    },
  });

  return (
    <View style={[styles.row, containerStyle]}>
      <View style={styles.action}>
        <IconActionCard
          description={cameraSubtitle}
          disabled={disabled}
          iconBackground={theme.colors.background.muted}
          iconColor={theme.colors.text.secondary}
          iconName="camera-outline"
          layout="vertical"
          onPress={onCameraPress}
          title={cameraTitle}
        />
      </View>

      <View style={styles.action}>
        <IconActionCard
          description={gallerySubtitle}
          disabled={disabled}
          iconBackground={theme.colors.background.muted}
          iconColor={theme.colors.text.secondary}
          iconName="image-outline"
          layout="vertical"
          onPress={onGalleryPress}
          title={galleryTitle}
        />
      </View>
    </View>
  );
}
