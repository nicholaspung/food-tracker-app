import 'react-native-gesture-handler';

import { Component, useCallback, useEffect, type ErrorInfo, type ReactNode } from 'react';
import * as NativeSplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SyncStatusBanner } from './src/components/SyncStatusBanner';
import { logger } from './src/lib/logger';
import { RootNavigator } from './src/navigation/RootNavigator';
import { AppProviders } from './src/providers/AppProviders';
import { ThemeProvider, useTheme } from './src/theme';
import { defaultThemeName, paletteTokens, spacingTokens, typographyTokens } from './src/theme/tokens';

const fallbackPalette = paletteTokens[defaultThemeName].light;

interface AppErrorBoundaryState {
  error: Error | null;
}

class AppErrorBoundary extends Component<{ children: ReactNode }, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error('[AppErrorBoundary] Unhandled render error:', error, errorInfo.componentStack);
    void NativeSplashScreen.hideAsync();
  }

  render() {
    if (this.state.error) {
      return (
        <View style={fallbackStyles.container}>
          <Text style={fallbackStyles.title}>Yummy Recs could not start</Text>
          <Text style={fallbackStyles.body}>
            Close and reopen the app. If this keeps happening, send the startup log from this build.
          </Text>
          <Text selectable style={fallbackStyles.errorText}>
            {this.state.error.message}
          </Text>
        </View>
      );
    }

    return this.props.children;
  }
}

void NativeSplashScreen.preventAutoHideAsync();
NativeSplashScreen.setOptions({
  duration: 250,
  fade: true,
});

function AppShell() {
  const theme = useTheme();
  const handleLayout = useCallback(() => {
    void NativeSplashScreen.hideAsync();
  }, []);

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(theme.colors.background.app);
  }, [theme.colors.background.app]);

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background.app,
    },
    navigatorContainer: {
      flex: 1,
    },
  });

  return (
    <View onLayout={handleLayout} style={styles.container}>
      <StatusBar style={theme.colorScheme === 'dark' ? 'light' : 'dark'} />
      <SyncStatusBanner />
      <View style={styles.navigatorContainer}>
        <RootNavigator />
      </View>
    </View>
  );
}

export default function App() {
  return (
    <AppErrorBoundary>
      <GestureHandlerRootView style={styles.root}>
        <SafeAreaProvider>
          <KeyboardProvider>
            <ThemeProvider>
              <AppProviders>
                <AppShell />
              </AppProviders>
            </ThemeProvider>
          </KeyboardProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </AppErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});

const fallbackStyles = StyleSheet.create({
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
