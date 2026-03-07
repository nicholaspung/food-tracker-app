import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { QueuedMutation } from '../offline';
import { logger } from '../lib/logger';
import { trackObservabilityEvent } from '../observability';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { useSync } from '../providers/SyncProvider';
import { useTheme } from '../theme';
import { Modal, Text } from '../ui';
import { LoadingState } from './shared';

function formatQueuedMutationTitle(mutation: QueuedMutation): string {
  const operationName =
    mutation.headers['X-Mobile-Write-Operation'] ?? mutation.headers['x-mobile-write-operation'];

  if (operationName) {
    return operationName;
  }

  try {
    const parsedUrl = new URL(mutation.url);
    return `${mutation.method} ${parsedUrl.pathname}`;
  } catch {
    return `${mutation.method} ${mutation.url}`;
  }
}

function formatQueuedMutationStatus(status: QueuedMutation['status']): string {
  switch (status) {
    case 'failed':
      return 'Failed';
    case 'retrying':
      return 'Retrying';
    case 'in_flight':
      return 'Sending';
    case 'pending':
    default:
      return 'Pending';
  }
}

export function SyncStatusBanner() {
  const theme = useTheme();
  const { isOnline } = useConnectivity();
  const { failedCount, getQueuedMutations, isSyncing, queueDepth, replayNow, retryAllFailed } =
    useSync();
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [queuedMutations, setQueuedMutations] = useState<QueuedMutation[]>([]);
  const [isLoadingQueue, setIsLoadingQueue] = useState(false);
  const timestampFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        month: 'short',
        day: 'numeric',
      }),
    [],
  );

  const indicatorTone = !isOnline ? 'warning' : failedCount > 0 ? 'danger' : 'info';
  const indicatorLabel = !isOnline
    ? queueDepth > 0
      ? `Offline (${queueDepth})`
      : 'Offline'
    : failedCount > 0
      ? `${failedCount} failed`
      : isSyncing
        ? queueDepth > 0
          ? `Syncing ${queueDepth}`
          : 'Syncing'
        : `${queueDepth} queued`;

  const isVisible = !isOnline || isSyncing || queueDepth > 0 || failedCount > 0;

  const loadQueuedMutations = useCallback(async () => {
    setIsLoadingQueue(true);

    try {
      const queueSnapshot = await getQueuedMutations(25);
      setQueuedMutations(queueSnapshot);
    } catch (error) {
      logger.warn('[SyncStatusBanner] Failed to load queued mutations:', error);
      setQueuedMutations([]);
    } finally {
      setIsLoadingQueue(false);
    }
  }, [getQueuedMutations]);

  useEffect(() => {
    if (!isModalVisible) {
      return;
    }

    void loadQueuedMutations();
  }, [failedCount, isModalVisible, isOnline, isSyncing, loadQueuedMutations, queueDepth]);

  const openModal = useCallback(() => {
    trackObservabilityEvent('SYNC_STATUS_MODAL_OPENED', {
      source: 'SyncStatusBanner',
      isOnline,
      queueDepth,
      failedCount,
      isSyncing,
    });
    setIsModalVisible(true);
    void loadQueuedMutations();
  }, [failedCount, isOnline, isSyncing, loadQueuedMutations, queueDepth]);

  const closeModal = useCallback(() => {
    setIsModalVisible(false);
  }, []);

  const runSyncNow = useCallback(async () => {
    trackObservabilityEvent('SYNC_NOW_TAPPED', {
      source: 'SyncStatusBanner',
      queueDepth,
      failedCount,
      isOnline,
    });
    await replayNow();
    await loadQueuedMutations();
  }, [failedCount, isOnline, loadQueuedMutations, queueDepth, replayNow]);

  const runRetryFailed = useCallback(async () => {
    trackObservabilityEvent('SYNC_RETRY_FAILED_TAPPED', {
      source: 'SyncStatusBanner',
      failedCount,
      queueDepth,
      isOnline,
    });
    await retryAllFailed();
    await loadQueuedMutations();
  }, [failedCount, isOnline, loadQueuedMutations, queueDepth, retryAllFailed]);

  const styles = StyleSheet.create({
    safeAreaContainer: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 40,
    },
    indicatorContainer: {
      alignItems: 'flex-end',
      marginHorizontal: theme.spacing.sm,
      marginTop: theme.spacing.xs,
    },
    indicatorButton: {
      minHeight: 30,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      borderColor:
        indicatorTone === 'warning'
          ? theme.colors.status.warningBorder
          : indicatorTone === 'danger'
            ? theme.colors.status.dangerBorder
            : theme.colors.status.infoBorder,
      backgroundColor:
        indicatorTone === 'warning'
          ? theme.colors.status.warningBg
          : indicatorTone === 'danger'
            ? theme.colors.status.dangerBg
            : theme.colors.status.infoBg,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: theme.spacing.sm,
      gap: theme.spacing.xs,
    },
    indicatorButtonPressed: {
      opacity: 0.82,
    },
    queueModalList: {
      maxHeight: 320,
    },
    queueModalListContent: {
      gap: theme.spacing.sm,
      paddingBottom: theme.spacing.xs,
    },
    queueItem: {
      borderRadius: theme.radii.md,
      borderWidth: 1,
      borderColor: theme.colors.border.subtle,
      backgroundColor: theme.colors.background.muted,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: theme.spacing.sm,
      gap: theme.spacing.xxs,
    },
    queueMeta: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      columnGap: theme.spacing.sm,
      rowGap: theme.spacing.xxs,
    },
  });

  if (!isVisible && !isModalVisible) {
    return null;
  }

  return (
    <>
      {isVisible ? (
        <SafeAreaView edges={['top']} pointerEvents="box-none" style={styles.safeAreaContainer}>
          <View pointerEvents="box-none" style={styles.indicatorContainer}>
            <Pressable
              accessibilityLabel="Sync status"
              accessibilityRole="button"
              onPress={openModal}
              style={({ pressed }) => [styles.indicatorButton, pressed && styles.indicatorButtonPressed]}
            >
              {isSyncing ? (
                <ActivityIndicator
                  color={
                    indicatorTone === 'warning'
                      ? theme.colors.status.warningText
                      : indicatorTone === 'danger'
                        ? theme.colors.status.dangerText
                        : theme.colors.status.infoText
                  }
                  size="small"
                />
              ) : null}
              <Text
                tone={indicatorTone === 'warning' ? 'warning' : indicatorTone === 'danger' ? 'danger' : 'info'}
                variant="label"
              >
                {indicatorLabel}
              </Text>
            </Pressable>
          </View>
        </SafeAreaView>
      ) : null}

      <Modal
        description={
          !isOnline
            ? 'You are offline. Writes are queued locally and will replay when the connection is restored.'
            : failedCount > 0
              ? 'Some queued writes failed. Retry them after confirming your auth and network state.'
              : isSyncing
                ? 'Queued writes are currently being synced.'
                : 'Pending writes are queued for sync.'
        }
        onRequestClose={closeModal}
        primaryAction={
          failedCount > 0
            ? {
                label: 'Retry failed',
                disabled: !isOnline,
                onPress: () => {
                  void runRetryFailed();
                },
              }
            : queueDepth > 0
              ? {
                  label: isSyncing ? 'Syncing...' : 'Sync now',
                  disabled: !isOnline || isSyncing,
                  onPress: () => {
                    void runSyncNow();
                  },
                }
              : undefined
        }
        secondaryAction={{
          label: 'Close',
          onPress: closeModal,
        }}
        title="Sync Queue"
        visible={isModalVisible}
      >
        {isLoadingQueue ? <LoadingState label="Loading queued writes..." /> : null}
        {!isLoadingQueue && queuedMutations.length === 0 ? (
          <Text tone="secondary">No queued writes right now.</Text>
        ) : null}
        {!isLoadingQueue && queuedMutations.length > 0 ? (
          <ScrollView contentContainerStyle={styles.queueModalListContent} style={styles.queueModalList}>
            {queuedMutations.map((mutation) => (
              <View key={mutation.id} style={styles.queueItem}>
                <Text variant="label">{formatQueuedMutationTitle(mutation)}</Text>
                <View style={styles.queueMeta}>
                  <Text tone={mutation.status === 'failed' ? 'danger' : 'secondary'} variant="bodySm">
                    {formatQueuedMutationStatus(mutation.status)}
                  </Text>
                  <Text tone="muted" variant="bodySm">
                    {timestampFormatter.format(new Date(mutation.createdAt))}
                  </Text>
                </View>
                {mutation.lastError ? (
                  <Text tone="danger" variant="bodySm">
                    {mutation.lastError}
                  </Text>
                ) : null}
              </View>
            ))}
          </ScrollView>
        ) : null}
      </Modal>
    </>
  );
}
