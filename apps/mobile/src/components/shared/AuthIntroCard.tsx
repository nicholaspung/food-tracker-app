import { Ionicons } from '../../ui/AppIcon';
import type { ComponentProps } from 'react';
import { View } from 'react-native';

import { createThemedStyles, useTheme } from '../../theme';
import { Card, Text } from '../../ui';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

export interface AuthIntroCardProps {
  iconName: IoniconName;
  title: string;
  description: string;
}

const useStyles = createThemedStyles((theme) => ({
  card: {
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  visual: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 64,
  },
  iconFrame: {
    alignItems: 'center',
    backgroundColor: theme.colors.background.muted,
    borderColor: theme.colors.border.subtle,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    height: 60,
    justifyContent: 'center',
    width: 60,
  },
}));

export function AuthIntroCard({ iconName, title, description }: AuthIntroCardProps) {
  const theme = useTheme();
  const styles = useStyles();

  return (
    <Card style={styles.card} tone="muted">
      <View style={styles.visual}>
        <View style={styles.iconFrame}>
          <Ionicons color={theme.colors.text.brand} name={iconName} size={28} />
        </View>
      </View>
      <Text variant="titleMd">{title}</Text>
      <Text tone="secondary">{description}</Text>
    </Card>
  );
}
