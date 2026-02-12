import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { env } from '../config/env';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { useSync } from '../providers/SyncProvider';

export function HomeScreen() {
  const { user, signOut } = useAuth();
  const { isOnline, connectionType } = useConnectivity();
  const { enqueueMutation, failedCount, isSyncing, queueDepth, replayNow } = useSync();

  const handleQueueTestWrite = async () => {
    await enqueueMutation({
      method: 'POST',
      // Use a guaranteed backend endpoint for offline queue validation.
      url: `${env.apiBaseUrl}/api/collections/users/auth-refresh`,
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>{user?.name ?? user?.email}</Text>

        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>API Base URL</Text>
          <Text style={styles.infoValue}>{env.apiBaseUrl}</Text>
          <Text style={styles.infoLabel}>PocketBase URL</Text>
          <Text style={styles.infoValue}>{env.pocketbaseUrl}</Text>
          <Text style={styles.infoLabel}>Connectivity</Text>
          <Text style={styles.infoValue}>{isOnline ? `Online (${connectionType})` : 'Offline'}</Text>
          <Text style={styles.infoLabel}>Sync Queue</Text>
          <Text style={styles.infoValue}>
            {queueDepth} queued / {failedCount} failed {isSyncing ? '(syncing)' : ''}
          </Text>
        </View>

        {__DEV__ ? (
          <View style={styles.debugCard}>
            <Text style={styles.debugTitle}>Offline Core Validation</Text>
            <Text style={styles.debugText}>
              Queue a test request to validate persistence + replay on reconnect.
            </Text>

            <View style={styles.debugActions}>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  void handleQueueTestWrite();
                }}
                style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
              >
                <Text style={styles.secondaryButtonLabel}>Queue Test Request</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                disabled={!isOnline || queueDepth === 0 || isSyncing}
                onPress={() => {
                  void replayNow();
                }}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  (!isOnline || queueDepth === 0 || isSyncing) && styles.secondaryButtonDisabled,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text style={styles.secondaryButtonLabel}>Replay Queue</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void signOut();
          }}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        >
          <Text style={styles.buttonLabel}>Sign Out</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  container: {
    flex: 1,
    padding: 24,
    gap: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111',
  },
  subtitle: {
    fontSize: 16,
    color: '#333',
  },
  infoCard: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    padding: 14,
    gap: 6,
    backgroundColor: '#fafafa',
  },
  infoLabel: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
  },
  infoValue: {
    fontSize: 13,
    color: '#111',
  },
  debugCard: {
    borderWidth: 1,
    borderColor: '#d7d7d7',
    borderRadius: 12,
    padding: 14,
    gap: 10,
    backgroundColor: '#f6f6f6',
  },
  debugTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111',
  },
  debugText: {
    fontSize: 12,
    color: '#444',
  },
  debugActions: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#555',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  secondaryButtonDisabled: {
    opacity: 0.5,
  },
  secondaryButtonLabel: {
    fontSize: 13,
    color: '#111',
    fontWeight: '600',
  },
  button: {
    backgroundColor: '#111',
    borderRadius: 10,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
