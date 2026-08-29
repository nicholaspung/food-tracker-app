import type { Ref } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { View } from 'react-native';

import { createThemedStyles, useTheme } from '../../theme';
import { IconActionCard } from './IconActionCard';

interface PhotoSourceActionCardsProps {
  onCameraPress: () => void;
  onGalleryPress: () => void;
  disabled?: boolean;
  tone?: 'default' | 'muted';
  cameraTitle?: string;
  cameraSubtitle?: string;
  galleryTitle?: string;
  gallerySubtitle?: string;
  containerStyle?: StyleProp<ViewStyle>;
  cameraActionRef?: Ref<View>;
}

const useStyles = createThemedStyles((theme) => ({
  row: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  action: {
    flex: 1,
  },
}));

export function PhotoSourceActionCards({
  onCameraPress,
  onGalleryPress,
  disabled = false,
  tone = 'default',
  cameraTitle = 'Capture',
  cameraSubtitle = 'Camera',
  galleryTitle = 'Upload',
  gallerySubtitle = 'Photo Library',
  containerStyle,
  cameraActionRef,
}: PhotoSourceActionCardsProps) {
  const theme = useTheme();
  const styles = useStyles();
  const iconBackground =
    tone === 'muted' ? theme.colors.background.surface : theme.colors.background.muted;
  const iconColor = tone === 'muted' ? theme.colors.text.muted : theme.colors.text.secondary;

  return (
    <View style={[styles.row, containerStyle]}>
      <View style={styles.action}>
        <IconActionCard
          description={cameraSubtitle}
          disabled={disabled}
          iconBackground={iconBackground}
          iconColor={iconColor}
          iconName="camera-outline"
          layout="vertical"
          onPress={onCameraPress}
          actionRef={cameraActionRef}
          tone={tone}
          title={cameraTitle}
        />
      </View>

      <View style={styles.action}>
        <IconActionCard
          description={gallerySubtitle}
          disabled={disabled}
          iconBackground={iconBackground}
          iconColor={iconColor}
          iconName="image-outline"
          layout="vertical"
          onPress={onGalleryPress}
          tone={tone}
          title={galleryTitle}
        />
      </View>
    </View>
  );
}
