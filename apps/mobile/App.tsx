import 'react-native-gesture-handler';

import { Component, useCallback, useEffect, useMemo, type ErrorInfo, type ReactNode } from 'react';
import * as NativeSplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { StartupErrorView } from './src/components/StartupErrorView';
import { SyncStatusBanner } from './src/components/SyncStatusBanner';
import { validateMobileEnv } from './src/config/env';
import { logger } from './src/lib/logger';
import { trackStartupMilestone } from './src/lib/startupDiagnostics';
import { RootNavigator } from './src/navigation/RootNavigator';
import { AppProviders } from './src/providers/AppProviders';
import { ThemeProvider, useTheme } from './src/theme';

trackStartupMilestone('APP_MODULE_EVALUATED');

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
      return <StartupErrorView error={this.state.error} />;
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
    trackStartupMilestone('APP_SHELL_LAYOUT');
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
  trackStartupMilestone('APP_RENDER_STARTED');
  const startupError = useMemo(resolveStartupError, []);
  const handleRootLayout = useCallback(() => {
    trackStartupMilestone('APP_ROOT_LAYOUT');
  }, []);

  if (startupError) {
    return <StartupErrorView error={startupError} />;
  }

  return (
    <AppErrorBoundary>
      <GestureHandlerRootView onLayout={handleRootLayout} style={styles.root}>
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

function resolveStartupError(): Error | null {
  try {
    validateMobileEnv();
    return null;
  } catch (error) {
    const startupError = error instanceof Error ? error : new Error(String(error));
    logger.error('[AppStartup] Startup validation failed:', startupError);
    void NativeSplashScreen.hideAsync();
    return startupError;
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
