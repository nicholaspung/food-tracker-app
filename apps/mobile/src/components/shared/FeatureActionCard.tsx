import { Ionicons } from '../../ui/AppIcon';
import type { ComponentProps, ReactNode } from 'react';

import { createThemedStyles, useTheme } from '../../theme';
import { IconActionCard, type IconActionCardProps } from './IconActionCard';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

export interface FeatureActionCardProps {
  title: string;
  description?: string;
  iconName: IoniconName;
  iconColor: string;
  iconBackground: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
  titleAccessory?: ReactNode;
  layout?: IconActionCardProps['layout'];
  showTrailing?: boolean;
  tone?: IconActionCardProps['tone'];
}

const useStyles = createThemedStyles(() => ({
  trailingIcon: {
    marginTop: 0,
  },
}));

export function FeatureActionCard({
  title,
  description,
  iconName,
  iconColor,
  iconBackground,
  onPress,
  disabled = false,
  testID,
  titleAccessory,
  layout = 'horizontal',
  showTrailing = true,
  tone = 'default',
}: FeatureActionCardProps) {
  const theme = useTheme();
  const styles = useStyles();

  return (
    <IconActionCard
      description={description}
      disabled={disabled}
      iconBackground={iconBackground}
      iconColor={iconColor}
      iconName={iconName}
      layout={layout}
      onPress={onPress}
      testID={testID}
      title={title}
      titleAccessory={titleAccessory}
      tone={tone}
      trailing={
        disabled
          ? (
              <Ionicons
                color={theme.colors.text.muted}
                name="lock-closed-outline"
                size={18}
                style={styles.trailingIcon}
              />
            )
          : showTrailing
            ? (
                <Ionicons
                  color={theme.colors.text.muted}
                  name="chevron-forward"
                  size={18}
                  style={styles.trailingIcon}
                />
              )
            : undefined
      }
    />
  );
}
