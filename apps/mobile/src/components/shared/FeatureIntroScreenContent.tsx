import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { View, useWindowDimensions } from 'react-native';
import type { ImageSourcePropType } from 'react-native';

import type { RootStackParamList } from '../../navigation/RootNavigator';
import { createThemedStyles, useTheme } from '../../theme';
import { Button, Text } from '../../ui';
import { PageErrorToast } from './PageErrorToast';
import { TutorialMedia } from './TutorialMedia';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

export type FeatureIntroIconTone = 'blue' | 'green' | 'orange' | 'brand' | 'muted';

export interface FeatureIntroConfig<Destination extends keyof RootStackParamList> {
  title: string;
  subtitle: string;
  description: string;
  imageSource?: ImageSourcePropType;
  iconName: IoniconName;
  iconTone: FeatureIntroIconTone;
  destination: Destination;
  primaryLabel: string;
  analyticsFeature: string;
}

interface FeatureIntroScreenContentProps<Destination extends keyof RootStackParamList> {
  config: FeatureIntroConfig<Destination>;
  errorMessage: string | null;
  isMediaActive?: boolean;
  isSubmitting: boolean;
  layout?: 'compact' | 'immersive';
  mediaPlaybackKey?: string;
  onPrimaryPress: () => void;
  primaryTestID: string;
}

const useStyles = createThemedStyles((theme, mediaHeight: number) => ({
  body: {
    gap: theme.spacing.md,
  },
  immersiveBody: {
    flexGrow: 1,
    gap: theme.spacing.lg,
    justifyContent: 'space-between',
  },
  imageFrame: {
    alignItems: 'center',
    backgroundColor: theme.colors.background.muted,
    borderColor: theme.colors.border.subtle,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    height: mediaHeight,
    justifyContent: 'center',
    overflow: 'hidden',
    width: '100%',
  },
  image: {
    height: '100%',
    width: '100%',
  },
  iconFrame: {
    alignItems: 'center',
    backgroundColor: theme.colors.background.surface,
    borderColor: theme.colors.border.subtle,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    height: 96,
    justifyContent: 'center',
    width: 96,
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  titleText: {
    flex: 1,
  },
  description: {
    color: theme.colors.text.secondary,
  },
  copyCluster: {
    gap: theme.spacing.md,
  },
  actions: {
    gap: theme.spacing.xs,
  },
}));

export function FeatureIntroScreenContent<Destination extends keyof RootStackParamList>({
  config,
  errorMessage,
  isMediaActive = true,
  isSubmitting,
  layout = 'compact',
  mediaPlaybackKey = config.analyticsFeature,
  onPrimaryPress,
  primaryTestID,
}: FeatureIntroScreenContentProps<Destination>) {
  const { height: viewportHeight } = useWindowDimensions();
  const isImmersiveLayout = layout === 'immersive';
  const mediaHeight = isImmersiveLayout
    ? Math.min(Math.max(360, Math.round(viewportHeight * 0.48)), 500)
    : 188;
  const styles = useStyles(mediaHeight);
  const theme = useTheme();
  const iconColor = resolveIconColor(config.iconTone, theme.colors.text);
  const imageResizeMode = isImmersiveLayout ? 'contain' : 'cover';

  return (
    <View style={[styles.body, isImmersiveLayout ? styles.immersiveBody : null]}>
      <TutorialMedia
        iconColor={iconColor}
        iconName={config.iconName}
        imageResizeMode={imageResizeMode}
        imageSource={config.imageSource}
        isActive={isMediaActive}
        playbackKey={mediaPlaybackKey}
        styles={{
          frame: styles.imageFrame,
          iconFrame: styles.iconFrame,
          image: styles.image,
        }}
      />
      <View style={styles.copyCluster}>
        <View style={styles.titleRow}>
          <Ionicons color={iconColor} name={config.iconName} size={22} />
          <Text style={styles.titleText} variant="titleMd">
            {config.title}
          </Text>
        </View>
        <Text style={styles.description} variant="bodyMd">
          {config.description}
        </Text>
        <PageErrorToast errorMessage={errorMessage} title="Onboarding update failed" />
        <View style={styles.actions}>
          <Button
            disabled={isSubmitting}
            label={config.primaryLabel}
            loading={isSubmitting}
            onPress={onPrimaryPress}
            testID={primaryTestID}
          />
        </View>
      </View>
    </View>
  );
}

function resolveIconColor(
  tone: FeatureIntroIconTone,
  textColors: ReturnType<typeof useTheme>['colors']['text'],
): string {
  switch (tone) {
    case 'green':
      return textColors.success;
    case 'orange':
      return textColors.warning;
    case 'brand':
      return textColors.brand;
    case 'muted':
      return textColors.secondary;
    case 'blue':
    default:
      return textColors.info;
  }
}
