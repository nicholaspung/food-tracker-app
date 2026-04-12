import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

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
  testID?: string;
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
  testID,
}: AddOptionCardProps) {
  const theme = useTheme();
  const styles = useStyles();

  return (
    <IconActionCard
      description={description}
      iconBackground={iconBackground}
      iconColor={iconColor}
      iconName={icon}
      onPress={onPress}
      testID={testID}
      title={title}
      trailing={<Ionicons color={theme.colors.text.muted} name="chevron-forward" size={18} style={styles.chevron} />}
    />
  );
}
