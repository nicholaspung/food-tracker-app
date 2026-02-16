import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useTheme } from '../theme';
import { Screen, Text } from '../ui';
import { Skeleton } from '../components/shared';

export function SplashScreen() {
  const theme = useTheme();

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: theme.spacing.sm,
    },
    skeleton: {
      marginTop: theme.spacing.xxs,
    },
  });

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
