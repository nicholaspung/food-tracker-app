import { ActivityIndicator, View } from 'react-native';

import { createThemedStyles, useTheme } from '../theme';
import { Screen, Text } from '../ui';
import { Skeleton } from '../components/shared';

const useStyles = createThemedStyles((theme) => ({
  container: {
    alignItems: 'center',
    flex: 1,
    gap: theme.spacing.sm,
    justifyContent: 'center',
  },
  skeleton: {
    marginTop: theme.spacing.xxs,
  },
}));

export function SplashScreen() {
  const theme = useTheme();
  const styles = useStyles();

  return (
    <Screen background="surface" padded={false}>
      <View style={styles.container}>
        <ActivityIndicator color={theme.colors.button.primaryBg} size="large" />
        <Text>Restoring session...</Text>
        <Skeleton height={theme.spacing.xxs} style={styles.skeleton} width={160} />
      </View>
    </Screen>
  );
}
