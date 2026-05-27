import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { View } from 'react-native';

import { createThemedStyles } from '../../theme';
import { Card, type CardTone, Text } from '../../ui';
import { PhotoSourceActionCards } from './PhotoSourceActionCards';

interface PhotoSourcePickerProps {
  onCameraPress: () => void;
  onGalleryPress: () => void;
  title?: string;
  description?: string;
  isSelecting?: boolean;
  selectingLabel?: string;
  disabled?: boolean;
  hideSourceActions?: boolean;
  tone?: 'default' | 'muted';
  cameraTitle?: string;
  cameraSubtitle?: string;
  galleryTitle?: string;
  gallerySubtitle?: string;
  footer?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

interface PhotoSourcePickerCardProps extends PhotoSourcePickerProps {
  cardTone?: CardTone;
  cardStyle?: StyleProp<ViewStyle>;
}

const useStyles = createThemedStyles((theme) => ({
  content: {
    gap: theme.spacing.sm,
  },
}));

export function PhotoSourcePicker({
  onCameraPress,
  onGalleryPress,
  title = 'Choose Photo Source',
  description,
  isSelecting = false,
  selectingLabel = 'Opening source picker...',
  disabled = false,
  hideSourceActions = false,
  tone = 'default',
  cameraTitle = 'Take Photo',
  cameraSubtitle = 'Camera',
  galleryTitle = 'Upload Image',
  gallerySubtitle = 'Photo Library',
  footer,
  style,
}: PhotoSourcePickerProps) {
  const styles = useStyles();

  return (
    <View style={[styles.content, style]}>
      {title ? <Text variant="label">{title}</Text> : null}
      {description ? <Text tone="secondary">{description}</Text> : null}
      {isSelecting ? (
        <Text tone="secondary" variant="bodySm">
          {selectingLabel}
        </Text>
      ) : null}
      {!hideSourceActions ? (
        <PhotoSourceActionCards
          cameraSubtitle={cameraSubtitle}
          cameraTitle={cameraTitle}
          disabled={disabled || isSelecting}
          gallerySubtitle={gallerySubtitle}
          galleryTitle={galleryTitle}
          onCameraPress={onCameraPress}
          onGalleryPress={onGalleryPress}
          tone={tone}
        />
      ) : null}
      {footer ?? null}
    </View>
  );
}

export function PhotoSourcePickerCard({
  cardTone = 'default',
  cardStyle,
  ...pickerProps
}: PhotoSourcePickerCardProps) {
  return (
    <Card style={cardStyle} tone={cardTone}>
      <PhotoSourcePicker {...pickerProps} />
    </Card>
  );
}
