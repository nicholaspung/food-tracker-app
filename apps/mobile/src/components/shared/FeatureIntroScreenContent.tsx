import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Image, View, useWindowDimensions } from 'react-native';
import type { ImageSourcePropType } from 'react-native';

import type { RootStackParamList } from '../../navigation/RootNavigator';
import { createThemedStyles, useTheme } from '../../theme';
import { Button, Text } from '../../ui';
import { PageErrorToast } from './PageErrorToast';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

export type FeatureIntroIconTone = 'blue' | 'green' | 'orange' | 'brand' | 'muted';

export interface FeatureIntroConfig<Destination extends keyof RootStackParamList> {
  title: string;
  subtitle: string;
  description: string;
  imageSource: ImageSourcePropType;
  iconName: IoniconName;
  iconTone: FeatureIntroIconTone;
  destination: Destination;
  primaryLabel: string;
  analyticsFeature: string;
}

interface FeatureIntroScreenContentProps<Destination extends keyof RootStackParamList> {
  backLabel: string;
  backTestID: string;
  config: FeatureIntroConfig<Destination>;
  errorMessage: string | null;
  isSubmitting: boolean;
  layout?: 'standard' | 'profileReplay';
  onBackPress: () => void;
  onPrimaryPress: () => void;
  primaryTestID: string;
  showSecondaryAction?: boolean;
}

const useStyles = createThemedStyles((theme, mediaHeight: number) => ({
  body: {
    gap: theme.spacing.md,
  },
  profileReplayBody: {
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
  backLabel,
  backTestID,
  config,
  errorMessage,
  isSubmitting,
  layout = 'standard',
  onBackPress,
  onPrimaryPress,
  primaryTestID,
  showSecondaryAction = true,
}: FeatureIntroScreenContentProps<Destination>) {
  const { height: viewportHeight } = useWindowDimensions();
  const isProfileReplayLayout = layout === 'profileReplay';
  const mediaHeight = isProfileReplayLayout
    ? Math.min(Math.max(360, Math.round(viewportHeight * 0.48)), 500)
    : 188;
  const styles = useStyles(mediaHeight);
  const theme = useTheme();
  const iconColor = resolveIconColor(config.iconTone, theme.colors.text);
  const imageResizeMode = isProfileReplayLayout ? 'contain' : 'cover';

  return (
    <View style={[styles.body, isProfileReplayLayout ? styles.profileReplayBody : null]}>
      <View style={styles.imageFrame}>
        <Image resizeMode={imageResizeMode} source={config.imageSource} style={styles.image} />
      </View>
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
          {showSecondaryAction ? (
            <Button
              disabled={isSubmitting}
              label={backLabel}
              onPress={onBackPress}
              testID={backTestID}
              variant="secondary"
            />
          ) : null}
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
