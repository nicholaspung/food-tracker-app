import { Ionicons } from '../../ui/AppIcon';
import { View } from 'react-native';

import type { RestaurantRecord } from '../../features';
import { buildVisitRestaurantDescription } from '../../lib/visitRestaurantSearch';
import { createThemedStyles, useTheme } from '../../theme';
import { Text } from '../../ui';

export interface VisitRestaurantSearchStats {
  userVisitCount: number;
  friendCount: number;
}

interface VisitRestaurantSearchOptionDescriptionProps {
  restaurant: RestaurantRecord;
  distance: number | null;
  stats?: VisitRestaurantSearchStats;
}

const useStyles = createThemedStyles((theme) => ({
  descriptionContainer: {
    gap: theme.spacing.xxs,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  statPill: {
    alignItems: 'center',
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.xxs,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 2,
  },
  userStatPill: {
    backgroundColor: theme.colors.status.successBg,
    borderColor: theme.colors.status.successBorder,
  },
  friendStatPill: {
    backgroundColor: theme.colors.status.infoBg,
    borderColor: theme.colors.status.infoBorder,
  },
}));

function formatVisitCount(count: number): string {
  return `${count} ${count === 1 ? 'visit' : 'visits'}`;
}

function formatFriendCount(count: number): string {
  return `${count} ${count === 1 ? 'friend' : 'friends'}`;
}

export function VisitRestaurantSearchOptionDescription({
  restaurant,
  distance,
  stats,
}: VisitRestaurantSearchOptionDescriptionProps) {
  const theme = useTheme();
  const styles = useStyles();
  const resolvedStats = {
    userVisitCount: stats?.userVisitCount ?? restaurant.userVisitCount ?? 0,
    friendCount: stats?.friendCount ?? restaurant.friendCount ?? 0,
  };

  return (
    <View style={styles.descriptionContainer}>
      <Text tone="secondary">{buildVisitRestaurantDescription(restaurant, distance)}</Text>
      {resolvedStats.userVisitCount > 0 || resolvedStats.friendCount > 0 ? (
        <View style={styles.statsRow}>
          {resolvedStats.userVisitCount > 0 ? (
            <View style={[styles.statPill, styles.userStatPill]}>
              <Ionicons
                color={theme.colors.text.success}
                name="calendar-outline"
                size={12}
              />
              <Text tone="success" variant="bodySm">
                {`You: ${formatVisitCount(resolvedStats.userVisitCount)}`}
              </Text>
            </View>
          ) : null}
          {resolvedStats.friendCount > 0 ? (
            <View style={[styles.statPill, styles.friendStatPill]}>
              <Ionicons
                color={theme.colors.text.info}
                name="people-outline"
                size={12}
              />
              <Text tone="info" variant="bodySm">
                {`Friends: ${formatFriendCount(resolvedStats.friendCount)}`}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
