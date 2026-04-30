import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Image, View } from 'react-native';
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
  onBackPress: () => void;
  onPrimaryPress: () => void;
  primaryTestID: string;
}

const useStyles = createThemedStyles((theme) => ({
  body: {
    gap: theme.spacing.md,
  },
  imageFrame: {
    alignItems: 'center',
    backgroundColor: theme.colors.background.muted,
    borderColor: theme.colors.border.subtle,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    height: 188,
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
  description: {
    color: theme.colors.text.secondary,
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
  onBackPress,
  onPrimaryPress,
  primaryTestID,
}: FeatureIntroScreenContentProps<Destination>) {
  const styles = useStyles();
  const theme = useTheme();
  const iconColor = resolveIconColor(config.iconTone, theme.colors.text);

  return (
    <View style={styles.body}>
      <View style={styles.imageFrame}>
        <Image resizeMode="cover" source={config.imageSource} style={styles.image} />
      </View>
      <View style={styles.titleRow}>
        <Ionicons color={iconColor} name={config.iconName} size={22} />
        <Text variant="titleMd">{config.title}</Text>
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
        <Button
          disabled={isSubmitting}
          label={backLabel}
          onPress={onBackPress}
          testID={backTestID}
          variant="secondary"
        />
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
