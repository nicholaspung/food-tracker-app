import { Ionicons } from '../../ui/AppIcon';
import { Pressable } from 'react-native';

import { createThemedStyles, useTheme } from '../../theme';
import { Text } from '../../ui';

interface VisitRestaurantSearchHeaderToggleProps {
  expanded: boolean;
  onPress: () => void;
  testID?: string;
}

const useStyles = createThemedStyles((theme) => ({
  button: {
    alignItems: 'center',
    borderColor: theme.colors.border.default,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    flexShrink: 0,
    gap: theme.spacing.xxs,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: theme.spacing.xs,
  },
}));

export function VisitRestaurantSearchHeaderToggle({
  expanded,
  onPress,
  testID,
}: VisitRestaurantSearchHeaderToggleProps) {
  const theme = useTheme();
  const styles = useStyles();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      onPress={onPress}
      style={styles.button}
      testID={testID}
    >
      <Text tone="secondary" variant="bodySm">
        {expanded ? 'Collapse' : 'Expand'}
      </Text>
      <Ionicons
        color={theme.colors.text.secondary}
        name={expanded ? 'chevron-up-outline' : 'chevron-down-outline'}
        size={14}
      />
    </Pressable>
  );
}
