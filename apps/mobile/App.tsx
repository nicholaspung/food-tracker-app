import 'react-native-gesture-handler';

import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { KeyboardDismissOverlay } from './src/components/shared/KeyboardDismissOverlay';
import { SyncStatusBanner } from './src/components/SyncStatusBanner';
import { RootNavigator } from './src/navigation/RootNavigator';
import { AppProviders } from './src/providers/AppProviders';
import { ThemeProvider, useTheme } from './src/theme';

function AppShell() {
  const theme = useTheme();

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
      <StatusBar style="dark" />
      <SyncStatusBanner />
      <View style={styles.navigatorContainer}>
        <RootNavigator />
      </View>
      <KeyboardDismissOverlay />
    </View>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AppProviders>
            <AppShell />
          </AppProviders>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
