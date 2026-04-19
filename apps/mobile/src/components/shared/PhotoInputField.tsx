import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { View } from 'react-native';

import { createThemedStyles, useTheme } from '../../theme';
import { Text } from '../../ui';
import { PhotoAttachmentRow } from './PhotoAttachmentRow';
import { PhotoSourceActionCards } from './PhotoSourceActionCards';

export interface PhotoInputFieldAttachment {
  id: string;
  name: string;
  uri: string;
  accessibilityLabel?: string;
  onPress?: () => void;
  onRemove: () => void;
}

interface PhotoInputFieldProps {
  label: string;
  iconName?: ComponentProps<typeof Ionicons>['name'];
  iconColor?: string;
  countLabel?: string | null;
  cameraTitle?: string;
  cameraSubtitle?: string;
  galleryTitle?: string;
  gallerySubtitle?: string;
  disabled?: boolean;
  onCameraPress: () => void;
  onGalleryPress: () => void;
  attachments?: PhotoInputFieldAttachment[];
  footerAction?: ReactNode;
}

const useStyles = createThemedStyles((theme) => ({
  container: {
    gap: theme.spacing.sm,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  headerLabel: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  attachmentList: {
    gap: theme.spacing.xs,
  },
}));

export function PhotoInputField({
  label,
  iconName,
  iconColor,
  countLabel = null,
  cameraTitle = 'Take Photo',
  cameraSubtitle = 'Camera',
  galleryTitle = 'Upload Image',
  gallerySubtitle = 'Photo Library',
  disabled = false,
  onCameraPress,
  onGalleryPress,
  attachments = [],
  footerAction,
}: PhotoInputFieldProps) {
  const theme = useTheme();
  const styles = useStyles();
  const hasAttachments = attachments.length > 0;
  const attachmentList = hasAttachments ? (
    <View style={styles.attachmentList}>
      {attachments.map((attachment) => (
        <PhotoAttachmentRow
          accessibilityLabel={attachment.accessibilityLabel}
          key={attachment.id}
          name={attachment.name}
          onPress={attachment.onPress}
          onRemove={attachment.onRemove}
          uri={attachment.uri}
        />
      ))}
    </View>
  ) : null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLabel}>
          {iconName ? (
            <Ionicons
              color={iconColor ?? theme.colors.text.secondary}
              name={iconName}
              size={16}
            />
          ) : null}
          <Text variant="label">{label}</Text>
        </View>

        {countLabel ? (
          <Text tone="muted" variant="bodySm">
            {countLabel}
          </Text>
        ) : null}
      </View>

      {hasAttachments ? attachmentList : null}

      <PhotoSourceActionCards
        cameraSubtitle={cameraSubtitle}
        cameraTitle={cameraTitle}
        disabled={disabled}
        gallerySubtitle={gallerySubtitle}
        galleryTitle={galleryTitle}
        onCameraPress={onCameraPress}
        onGalleryPress={onGalleryPress}
        tone={hasAttachments ? 'muted' : 'default'}
      />

      {!hasAttachments ? attachmentList : null}

      {footerAction ?? null}
    </View>
  );
}
