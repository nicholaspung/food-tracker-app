import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OfflineBanner } from './shared';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { useSync } from '../providers/SyncProvider';
import { useTheme } from '../theme';

export function SyncStatusBanner() {
  const theme = useTheme();
  const { isOnline } = useConnectivity();
  const { failedCount, isSyncing, queueDepth, replayNow, retryAllFailed } = useSync();

  const isVisible = !isOnline || queueDepth > 0 || failedCount > 0;
  if (!isVisible) {
    return null;
  }

  const styles = StyleSheet.create({
    safeAreaContainer: {
      backgroundColor: 'transparent',
    },
    bannerContainer: {
      marginHorizontal: theme.spacing.sm,
      marginTop: theme.spacing.xs,
      marginBottom: theme.spacing.xxs,
    },
  });

  return (
    <SafeAreaView edges={['top']} style={styles.safeAreaContainer}>
      <View style={styles.bannerContainer}>
        <OfflineBanner
          failedWrites={failedCount}
          isOnline={isOnline}
          isSyncing={isSyncing}
          onRetryFailed={() => {
            void retryAllFailed();
          }}
          onSyncNow={() => {
            void replayNow();
          }}
          pendingWrites={queueDepth}
        />
      </View>
    </SafeAreaView>
  );
}
