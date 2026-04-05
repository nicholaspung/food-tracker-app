import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import * as Application from 'expo-application';
import * as Updates from 'expo-updates';

import { trackObservabilityEvent } from '../../observability';
import { useTheme } from '../../theme';
import { Button, Card, Text } from '../../ui';
import { PageErrorToast } from './PageErrorToast';

export interface OtaUpdateCardProps {
  source: string;
  title?: string;
  description?: string;
}

export interface OtaUpdateStatusState {
  currentAppVersion: string;
  currentBuildVersion: string;
  currentOtaLabel: string;
  currentChannel: string;
  currentRuntimeVersion: string;
  currentPublishedAt: string;
  latestAvailableLabel: string;
  statusText: string | null;
  buttonLabel: string;
  errorMessage: string | null;
  isChecking: boolean;
  isDownloading: boolean;
  isApplyingUpdate: boolean;
  isUpdatePending: boolean;
  hasAvailableUpdate: boolean;
  shouldAutoExpand: boolean;
  handleApplyLatestOtaUpdate: () => Promise<void>;
}

function formatUpdateTimestamp(value: Date | undefined): string {
  if (!value) {
    return 'Unknown';
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value);
}

function formatUpdateIdentifier(value: string | undefined): string {
  if (!value) {
    return 'Embedded';
  }

  return value.slice(0, 8);
}

function extractManifestUpdateId(manifest: unknown): string | undefined {
  if (!manifest || typeof manifest !== 'object' || !('id' in manifest)) {
    return undefined;
  }

  const { id } = manifest;
  return typeof id === 'string' ? id : undefined;
}

function formatAvailableUpdateLabel(updateId: string | undefined, isRollBackToEmbedded = false): string {
  if (isRollBackToEmbedded) {
    return 'Embedded rollback';
  }

  if (!updateId) {
    return 'None detected';
  }

  return formatUpdateIdentifier(updateId);
}

export function useOtaUpdateStatus(source: string): OtaUpdateStatusState {
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isApplyingUpdate, setIsApplyingUpdate] = useState(false);
  const [checkedUpdateId, setCheckedUpdateId] = useState<string | undefined>();
  const [isRollbackAvailable, setIsRollbackAvailable] = useState(false);
  const [isRefreshingAvailability, setIsRefreshingAvailability] = useState(false);
  const { availableUpdate, currentlyRunning, isChecking, isDownloading, isUpdatePending } =
    Updates.useUpdates();

  const currentOtaLabel = currentlyRunning.isEmbeddedLaunch
    ? 'Embedded build'
    : `OTA ${formatUpdateIdentifier(currentlyRunning.updateId)}`;
  const currentAppVersion = Application.nativeApplicationVersion ?? 'unknown';
  const currentBuildVersion = Application.nativeBuildVersion ?? 'unknown';
  const hasAvailableUpdate = Boolean(availableUpdate) || Boolean(checkedUpdateId) || isRollbackAvailable || isUpdatePending;
  const buttonLabel =
    isApplyingUpdate || isChecking || isDownloading
      ? 'Updating...'
      : isUpdatePending
        ? 'Restart Into Downloaded OTA'
        : 'Make App Latest OTA';

  useEffect(() => {
    let isActive = true;

    async function refreshAvailability() {
      if (!Updates.isEnabled || __DEV__) {
        return;
      }

      setIsRefreshingAvailability(true);

      try {
        const checkResult = await Updates.checkForUpdateAsync();
        if (!isActive) {
          return;
        }

        if (checkResult.isRollBackToEmbedded) {
          setCheckedUpdateId(undefined);
          setIsRollbackAvailable(true);
          return;
        }

        if (checkResult.isAvailable) {
          setCheckedUpdateId(extractManifestUpdateId(checkResult.manifest));
          setIsRollbackAvailable(false);
          return;
        }

        setCheckedUpdateId(undefined);
        setIsRollbackAvailable(false);
      } catch {
        if (!isActive) {
          return;
        }

        setCheckedUpdateId(undefined);
        setIsRollbackAvailable(false);
      } finally {
        if (isActive) {
          setIsRefreshingAvailability(false);
        }
      }
    }

    void refreshAvailability();

    return () => {
      isActive = false;
    };
  }, []);

  const statusText = useMemo(() => {
    if (errorMessage) {
      return null;
    }

    return (
      actionMessage ??
      (isDownloading
        ? 'Downloading the latest OTA update...'
        : isChecking || isRefreshingAvailability
          ? 'Checking for the latest OTA update...'
          : isUpdatePending
            ? 'A downloaded OTA is ready. Tap the button to restart into it.'
            : hasAvailableUpdate
              ? `New OTA available: ${formatAvailableUpdateLabel(
                  availableUpdate?.updateId ?? checkedUpdateId,
                  isRollbackAvailable,
                )}`
              : 'Current OTA details are shown below.')
    );
  }, [
    actionMessage,
    availableUpdate?.updateId,
    checkedUpdateId,
    errorMessage,
    hasAvailableUpdate,
    isChecking,
    isDownloading,
    isRefreshingAvailability,
    isRollbackAvailable,
    isUpdatePending,
  ]);

  const handleApplyLatestOtaUpdate = useCallback(async () => {
    setActionMessage(null);
    setErrorMessage(null);

    if (!Updates.isEnabled) {
      setErrorMessage('OTA updates are not enabled in this build.');
      return;
    }

    setIsApplyingUpdate(true);
    trackObservabilityEvent('OTA_UPDATE_APPLY_STARTED', {
      source,
      currentChannel: currentlyRunning.channel ?? 'unknown',
      currentUpdateId: currentlyRunning.updateId ?? 'embedded',
      runtimeVersion: currentlyRunning.runtimeVersion ?? 'unknown',
    });

    try {
      if (isUpdatePending) {
        setActionMessage('Downloaded OTA found. Restarting now to apply it...');
        await Updates.reloadAsync();
        return;
      }

      setActionMessage('Checking for the latest OTA update...');
      const checkResult = await Updates.checkForUpdateAsync();

      if (!checkResult.isAvailable && !checkResult.isRollBackToEmbedded) {
        setCheckedUpdateId(undefined);
        setIsRollbackAvailable(false);
        setActionMessage('This app is already on the latest OTA update for this channel.');
        trackObservabilityEvent('OTA_UPDATE_ALREADY_CURRENT', {
          source,
          currentChannel: currentlyRunning.channel ?? 'unknown',
          currentUpdateId: currentlyRunning.updateId ?? 'embedded',
        });
        return;
      }

      setActionMessage(
        checkResult.isRollBackToEmbedded
          ? 'A rollback to the embedded build is available. Downloading it now...'
          : 'New OTA update found. Downloading it now...',
      );
      setCheckedUpdateId(extractManifestUpdateId(checkResult.manifest));
      setIsRollbackAvailable(checkResult.isRollBackToEmbedded);

      const fetchResult = await Updates.fetchUpdateAsync();

      if (fetchResult.isRollBackToEmbedded) {
        setActionMessage('Rollback downloaded. Restarting now...');
        await Updates.reloadAsync();
        return;
      }

      if (!fetchResult.isNew) {
        setActionMessage('No newer OTA package was downloaded.');
        return;
      }

      setActionMessage('Latest OTA downloaded. Restarting now...');
      trackObservabilityEvent('OTA_UPDATE_DOWNLOAD_SUCCEEDED', {
        source,
        downloadedUpdateId:
          fetchResult.manifest && 'id' in fetchResult.manifest && typeof fetchResult.manifest.id === 'string'
            ? fetchResult.manifest.id
            : null,
      });
      await Updates.reloadAsync();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not update the app to the latest OTA.';
      setErrorMessage(message);
      setActionMessage(null);
      trackObservabilityEvent('OTA_UPDATE_APPLY_FAILED', {
        source,
        errorMessage: message,
      });
    } finally {
      setIsApplyingUpdate(false);
    }
  }, [
    currentlyRunning.channel,
    currentlyRunning.runtimeVersion,
    currentlyRunning.updateId,
    isUpdatePending,
    source,
  ]);

  return {
    buttonLabel,
    currentAppVersion,
    currentBuildVersion,
    currentChannel: currentlyRunning.channel ?? 'unknown',
    currentOtaLabel,
    currentPublishedAt: formatUpdateTimestamp(currentlyRunning.createdAt),
    currentRuntimeVersion: currentlyRunning.runtimeVersion ?? 'unknown',
    errorMessage,
    handleApplyLatestOtaUpdate,
    hasAvailableUpdate,
    isApplyingUpdate,
    isChecking: isChecking || isRefreshingAvailability,
    isDownloading,
    isUpdatePending,
    latestAvailableLabel: formatAvailableUpdateLabel(
      availableUpdate?.updateId ?? checkedUpdateId,
      isRollbackAvailable,
    ),
    shouldAutoExpand:
      hasAvailableUpdate || isDownloading || isApplyingUpdate || Boolean(actionMessage) || Boolean(errorMessage),
    statusText,
  };
}

export function OtaUpdateStatusDetails({ state }: { state: OtaUpdateStatusState }) {
  const theme = useTheme();

  const styles = StyleSheet.create({
    body: {
      gap: theme.spacing.sm,
    },
    metaRow: {
      flexDirection: 'row',
      gap: theme.spacing.sm,
      justifyContent: 'space-between',
    },
    metaItem: {
      flex: 1,
      gap: 2,
    },
    metaLabel: {
      textTransform: 'uppercase',
    },
    metaValue: {},
  });

  return (
    <>
      <PageErrorToast errorMessage={state.errorMessage} title="App update failed" />
      <View style={styles.body}>
        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel} tone="muted" variant="bodySmSemiBold">
              Runtime
            </Text>
            <Text style={styles.metaValue} variant="bodyMdSemiBold">
              {state.currentRuntimeVersion}
            </Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel} tone="muted" variant="bodySmSemiBold">
              Published
            </Text>
            <Text style={styles.metaValue} variant="bodyMdSemiBold">
              {state.currentPublishedAt}
            </Text>
          </View>
        </View>
        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel} tone="muted" variant="bodySmSemiBold">
              Current OTA
            </Text>
            <Text style={styles.metaValue} variant="bodyMdSemiBold">
              {state.currentOtaLabel}
            </Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel} tone="muted" variant="bodySmSemiBold">
              Latest Available
            </Text>
            <Text style={styles.metaValue} variant="bodyMdSemiBold">
              {state.latestAvailableLabel}
            </Text>
          </View>
        </View>
        <View style={styles.metaItem}>
          <Text style={styles.metaLabel} tone="muted" variant="bodySmSemiBold">
            Channel
          </Text>
          <Text style={styles.metaValue} variant="bodyMdSemiBold">
            {state.currentChannel}
          </Text>
        </View>
        {state.statusText ? (
          <View style={styles.metaItem}>
            <Text
              tone={state.errorMessage ? 'danger' : 'secondary'}
              variant="bodySm"
            >
              {state.statusText}
            </Text>
          </View>
        ) : null}
        <Button
          disabled={state.isApplyingUpdate || state.isChecking || state.isDownloading}
          label={state.buttonLabel}
          loading={state.isApplyingUpdate}
          onPress={() => {
            void state.handleApplyLatestOtaUpdate();
          }}
        />
      </View>
    </>
  );
}

export function OtaUpdateCard({
  source,
  title = 'App update status',
  description,
}: OtaUpdateCardProps) {
  const theme = useTheme();
  const state = useOtaUpdateStatus(source);

  const styles = StyleSheet.create({
    card: {
      gap: theme.spacing.xs,
    },
  });

  return (
    <Card style={styles.card} tone="muted">
      <Text variant="bodyLgBold">
        {title}
      </Text>
      {description ? (
        <Text tone="secondary" variant="bodyMd">
          {description}
        </Text>
      ) : null}
      <OtaUpdateStatusDetails state={state} />
    </Card>
  );
}
