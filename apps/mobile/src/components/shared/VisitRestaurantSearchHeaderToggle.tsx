import { Ionicons } from '@expo/vector-icons';
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
    gap: theme.spacing.xxs,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: theme.spacing.xxs,
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
