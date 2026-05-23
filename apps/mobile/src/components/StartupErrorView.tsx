import { useCallback } from 'react';
import * as NativeSplashScreen from 'expo-splash-screen';
import { StyleSheet, Text, View } from 'react-native';

import { defaultThemeName, paletteTokens, spacingTokens, typographyTokens } from '../theme/tokens';

const fallbackPalette = paletteTokens[defaultThemeName].light;

export function StartupErrorView({ error }: { error: Error }) {
  const handleLayout = useCallback(() => {
    void NativeSplashScreen.hideAsync();
  }, []);

  return (
    <View onLayout={handleLayout} style={styles.container} testID="startup-error-screen">
      <Text style={styles.title}>Yummy Recs could not start</Text>
      <Text style={styles.body}>
        Close and reopen the app. If this keeps happening, send the startup log from this build.
      </Text>
      <Text selectable style={styles.errorText}>
        {error.message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'flex-start',
    backgroundColor: fallbackPalette.backgroundSurface,
    flex: 1,
    gap: spacingTokens.sm,
    justifyContent: 'center',
    padding: spacingTokens.lg,
  },
  title: {
    color: fallbackPalette.textPrimary,
    fontSize: typographyTokens.titleMd.fontSize,
    fontWeight: typographyTokens.titleMd.fontWeight,
    lineHeight: typographyTokens.titleMd.lineHeight,
  },
  body: {
    color: fallbackPalette.textSecondary,
    fontSize: typographyTokens.bodyMd.fontSize,
    fontWeight: typographyTokens.bodyMd.fontWeight,
    lineHeight: typographyTokens.bodyMd.lineHeight,
  },
  errorText: {
    color: fallbackPalette.dangerText,
    fontSize: typographyTokens.bodySm.fontSize,
    fontWeight: typographyTokens.bodySm.fontWeight,
    lineHeight: typographyTokens.bodySm.lineHeight,
  },
});
