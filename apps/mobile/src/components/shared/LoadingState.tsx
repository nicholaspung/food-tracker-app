import { ActivityIndicator, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { createThemedStyles, useTheme } from '../../theme';
import { Text } from '../../ui';

interface LoadingStateProps {
  label?: string;
  style?: StyleProp<ViewStyle>;
}

const useStyles = createThemedStyles((theme) => ({
  container: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
}));

export function LoadingState({ label = 'Loading...', style }: LoadingStateProps) {
  const theme = useTheme();
  const styles = useStyles();

  return (
    <View accessibilityRole="progressbar" style={[styles.container, style]}>
      <ActivityIndicator color={theme.colors.button.primaryBg} size="small" />
      <Text tone="secondary">{label}</Text>
    </View>
  );
}
