import { Ionicons } from '../../ui/AppIcon';
import { View } from 'react-native';

import type { RestaurantRecord } from '../../features';
import { createThemedStyles, useTheme } from '../../theme';

interface RestaurantVisibilityIcon {
  name: keyof typeof Ionicons.glyphMap;
  tone: 'secondary' | 'info' | 'success';
}

interface VisitRestaurantOptionTrailingProps {
  restaurant: RestaurantRecord;
  selected: boolean;
}

const useStyles = createThemedStyles((theme) => ({
  container: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
}));

function getRestaurantVisibilityIcon(restaurant: RestaurantRecord): RestaurantVisibilityIcon | null {
  const visibility =
    restaurant.visibility ?? (restaurant.isGooglePlace ? 'public' : undefined);
  if (visibility === 'private') {
    return { name: 'lock-closed-outline', tone: 'secondary' };
  }

  if (visibility === 'friends') {
    return { name: 'people-outline', tone: 'info' };
  }

  return null;
}

export function VisitRestaurantOptionTrailing({
  restaurant,
  selected,
}: VisitRestaurantOptionTrailingProps) {
  const theme = useTheme();
  const visibilityIcon = getRestaurantVisibilityIcon(restaurant);
  const styles = useStyles();

  const resolveVisibilityIconColor = (tone: RestaurantVisibilityIcon['tone']): string => {
    if (tone === 'info') {
      return theme.colors.text.info;
    }

    if (tone === 'success') {
      return theme.colors.text.success;
    }

    return theme.colors.text.secondary;
  };

  if (!visibilityIcon && !selected) {
    return null;
  }

  return (
    <View style={styles.container}>
      {visibilityIcon ? (
        <Ionicons
          color={resolveVisibilityIconColor(visibilityIcon.tone)}
          name={visibilityIcon.name}
          size={16}
        />
      ) : null}
      {selected ? (
        <Ionicons
          color={theme.colors.text.success}
          name="checkmark-circle"
          size={18}
        />
      ) : null}
    </View>
  );
}
