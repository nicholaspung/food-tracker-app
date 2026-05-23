import { useCallback } from 'react';
import { ActivityIndicator, Image, View } from 'react-native';
import * as NativeSplashScreen from 'expo-splash-screen';

import { APP_NAME, BRAND_LOGO } from '../lib/branding';
import { createThemedStyles, useTheme } from '../theme';
import { Screen, Text } from '../ui';

const useStyles = createThemedStyles((theme) => ({
  container: {
    alignItems: 'center',
    flex: 1,
    gap: theme.spacing.md,
    justifyContent: 'center',
  },
  logo: {
    height: 96,
    width: 112,
  },
  copy: {
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  loadingRow: {
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.xs,
  },
}));

export function SplashScreen() {
  const theme = useTheme();
  const styles = useStyles();
  const handleLayout = useCallback(() => {
    void NativeSplashScreen.hideAsync();
  }, []);

  return (
    <Screen background="surface" onLayout={handleLayout} padded={false} testID="splash-screen">
      <View style={styles.container}>
        <Image
          accessibilityIgnoresInvertColors
          accessibilityLabel={`${APP_NAME} logo`}
          resizeMode="contain"
          source={BRAND_LOGO}
          style={styles.logo}
          testID="splash-logo"
        />
        <View style={styles.copy}>
          <Text testID="splash-title" variant="titleMd">
            {APP_NAME}
          </Text>
          <Text tone="secondary">Getting things ready...</Text>
        </View>
        <View style={styles.loadingRow}>
          <ActivityIndicator color={theme.colors.button.primaryBg} size="large" />
        </View>
      </View>
    </Screen>
  );
}
