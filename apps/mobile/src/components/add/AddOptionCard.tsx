import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';

import { createThemedStyles, useTheme } from '../../theme';
import { IconActionCard } from '../shared';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

interface AddOptionCardProps {
  title: string;
  description: string;
  icon: IoniconName;
  iconColor: string;
  iconBackground: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
  titleAccessory?: ReactNode;
}

const useStyles = createThemedStyles(() => ({
  chevron: {
    marginTop: 0,
  },
}));

export function AddOptionCard({
  title,
  description,
  icon,
  iconColor,
  iconBackground,
  onPress,
  disabled = false,
  testID,
  titleAccessory,
}: AddOptionCardProps) {
  const theme = useTheme();
  const styles = useStyles();

  return (
    <IconActionCard
      description={description}
      iconBackground={iconBackground}
      iconColor={iconColor}
      iconName={icon}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      title={title}
      titleAccessory={titleAccessory}
      trailing={
        disabled
          ? <Ionicons color={theme.colors.text.muted} name="lock-closed-outline" size={18} style={styles.chevron} />
          : <Ionicons color={theme.colors.text.muted} name="chevron-forward" size={18} style={styles.chevron} />
      }
    />
  );
}
