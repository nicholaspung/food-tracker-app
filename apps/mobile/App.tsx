import 'react-native-gesture-handler';

import { useCallback, useEffect } from 'react';
import * as NativeSplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SyncStatusBanner } from './src/components/SyncStatusBanner';
import { RootNavigator } from './src/navigation/RootNavigator';
import { AppProviders } from './src/providers/AppProviders';
import { ThemeProvider, useTheme } from './src/theme';

void NativeSplashScreen.preventAutoHideAsync();
NativeSplashScreen.setOptions({
  duration: 250,
  fade: true,
});

function AppShell() {
  const theme = useTheme();

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
    <View style={styles.container}>
      <StatusBar style={theme.colorScheme === 'dark' ? 'light' : 'dark'} />
      <SyncStatusBanner />
      <View style={styles.navigatorContainer}>
        <RootNavigator />
      </View>
    </View>
  );
}

export default function App() {
  const handleRootLayout = useCallback(() => {
    void NativeSplashScreen.hideAsync();
  }, []);

  return (
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
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
