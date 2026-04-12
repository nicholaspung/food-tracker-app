import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { View } from 'react-native';

import { createThemedStyles } from '../../theme';
import { Card, Text } from '../../ui';

type IoniconName = ComponentProps<typeof Ionicons>['name'];
type FriendListItemTone = 'info' | 'warning' | 'muted';

export interface FriendListItemCardProps {
  name: string;
  meta: string;
  iconName: IoniconName;
  iconColor: string;
  tone?: FriendListItemTone;
  rightContent?: ReactNode;
}

const useStyles = createThemedStyles((theme) => ({
  card: {
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  identity: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  avatar: {
    alignItems: 'center',
    borderRadius: theme.radii.pill,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  avatarInfo: {
    backgroundColor: theme.colors.status.infoBg,
  },
  avatarWarning: {
    backgroundColor: theme.colors.status.warningBg,
  },
  avatarMuted: {
    backgroundColor: theme.colors.background.muted,
  },
  metaWrap: {
    flex: 1,
    gap: 2,
  },
  name: {
    color: theme.colors.text.primary,
    ...theme.typography.cardTitle,
  },
  meta: {
    color: theme.colors.text.muted,
    ...theme.typography.meta,
  },
}));

export function FriendListItemCard({
  name,
  meta,
  iconName,
  iconColor,
  tone = 'info',
  rightContent,
}: FriendListItemCardProps) {
  const styles = useStyles();

  const avatarToneStyle =
    tone === 'warning' ? styles.avatarWarning : tone === 'muted' ? styles.avatarMuted : styles.avatarInfo;

  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <View style={styles.identity}>
          <View style={[styles.avatar, avatarToneStyle]}>
            <Ionicons color={iconColor} name={iconName} size={18} />
          </View>
          <View style={styles.metaWrap}>
            <Text style={styles.name}>{name}</Text>
            <Text style={styles.meta}>{meta}</Text>
          </View>
        </View>
        {rightContent}
      </View>
    </Card>
  );
}
