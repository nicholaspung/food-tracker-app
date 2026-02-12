import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useConnectivity } from '../providers/ConnectivityProvider';
import { useSync } from '../providers/SyncProvider';

export function SyncStatusBanner() {
  const { isOnline } = useConnectivity();
  const { failedCount, isSyncing, lastError, queueDepth, replayNow, retryAllFailed } = useSync();

  const isVisible = !isOnline || queueDepth > 0 || failedCount > 0 || Boolean(lastError);
  if (!isVisible) {
    return null;
  }

  const statusText = resolveStatusText({
    isOnline,
    queueDepth,
    failedCount,
    isSyncing,
  });

  return (
    <SafeAreaView edges={['top']} style={styles.safeAreaContainer}>
      <View style={[styles.container, !isOnline ? styles.offline : failedCount > 0 ? styles.failed : null]}>
        <Text style={styles.statusText}>{statusText}</Text>
        {lastError ? (
          <Text numberOfLines={2} style={styles.errorText}>
            {lastError}
          </Text>
        ) : null}

        <View style={styles.actionsRow}>
          {failedCount > 0 ? (
            <ActionButton
              disabled={!isOnline}
              label="Retry all"
              onPress={() => {
                void retryAllFailed();
              }}
            />
          ) : null}

          {queueDepth > 0 ? (
            <ActionButton
              disabled={!isOnline || isSyncing}
              label={isSyncing ? 'Syncing...' : 'Sync now'}
              onPress={() => {
                void replayNow();
              }}
            />
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  );
}

function ActionButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        disabled && styles.actionButtonDisabled,
        pressed && !disabled && styles.actionButtonPressed,
      ]}
    >
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

function resolveStatusText({
  isOnline,
  queueDepth,
  failedCount,
  isSyncing,
}: {
  isOnline: boolean;
  queueDepth: number;
  failedCount: number;
  isSyncing: boolean;
}): string {
  if (!isOnline) {
    return `${queueDepth} pending write${queueDepth === 1 ? '' : 's'} (offline)`;
  }

  if (failedCount > 0) {
    return `${failedCount} failed write${failedCount === 1 ? '' : 's'} need attention`;
  }

  if (isSyncing) {
    return `Syncing ${queueDepth} queued write${queueDepth === 1 ? '' : 's'}...`;
  }

  return `${queueDepth} queued write${queueDepth === 1 ? '' : 's'} pending sync`;
}

const styles = StyleSheet.create({
  safeAreaContainer: {
    backgroundColor: 'transparent',
  },
  container: {
    marginHorizontal: 12,
    marginTop: 6,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: '#c9d7ff',
    borderRadius: 12,
    backgroundColor: '#edf2ff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  offline: {
    borderColor: '#d98f00',
    backgroundColor: '#fff6db',
  },
  failed: {
    borderColor: '#d25555',
    backgroundColor: '#ffe9e9',
  },
  statusText: {
    color: '#1f2933',
    fontSize: 13,
    fontWeight: '600',
  },
  errorText: {
    color: '#8f1f1f',
    fontSize: 12,
    lineHeight: 17,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2f4ea5',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  actionButtonDisabled: {
    opacity: 0.45,
  },
  actionButtonPressed: {
    opacity: 0.8,
  },
  actionLabel: {
    color: '#18327d',
    fontSize: 12,
    fontWeight: '600',
  },
});
