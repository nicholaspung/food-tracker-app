import { useCallback, useMemo, useState } from 'react';
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

export function OtaUpdateCard({
  source,
  title = 'App update status',
  description,
}: OtaUpdateCardProps) {
  const theme = useTheme();
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isApplyingUpdate, setIsApplyingUpdate] = useState(false);
  const { availableUpdate, currentlyRunning, isChecking, isDownloading, isUpdatePending } =
    Updates.useUpdates();

  const currentOtaLabel = currentlyRunning.isEmbeddedLaunch
    ? 'Embedded build'
    : `OTA ${formatUpdateIdentifier(currentlyRunning.updateId)}`;
  const currentAppVersion = Application.nativeApplicationVersion ?? 'unknown';
  const currentBuildVersion = Application.nativeBuildVersion ?? 'unknown';
  const buttonLabel =
    isApplyingUpdate || isChecking || isDownloading
      ? 'Updating...'
      : isUpdatePending
        ? 'Restart Into Downloaded OTA'
        : 'Make App Latest OTA';
  const statusText = useMemo(() => {
    if (errorMessage) {
      return null;
    }

    return (
      actionMessage ??
      (isDownloading
        ? 'Downloading the latest OTA update...'
        : isChecking
          ? 'Checking for the latest OTA update...'
          : isUpdatePending
            ? 'A downloaded OTA is ready. Tap the button to restart into it.'
            : availableUpdate
              ? `New OTA available: ${formatUpdateIdentifier(availableUpdate.updateId)}`
              : 'Current OTA details are shown below.')
    );
  }, [actionMessage, availableUpdate, errorMessage, isChecking, isDownloading, isUpdatePending]);

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

  const styles = StyleSheet.create({
    card: {
      gap: theme.spacing.xs,
    },
    title: {
      fontWeight: '700',
    },
    description: {
      lineHeight: 20,
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
      fontWeight: '600',
      textTransform: 'uppercase',
    },
    metaValue: {
      fontWeight: '600',
      lineHeight: 19,
    },
    status: {
      lineHeight: 18,
    },
    error: {
      lineHeight: 18,
    },
  });

  return (
    <>
      <PageErrorToast errorMessage={errorMessage} title="App update failed" />
      <Card style={styles.card} tone="muted">
        <Text style={styles.title} variant="bodyLg">
          {title}
        </Text>
        {description ? (
          <Text style={styles.description} tone="secondary" variant="bodyMd">
            {description}
          </Text>
        ) : null}
        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel} tone="muted" variant="bodySm">
              App Version
            </Text>
            <Text style={styles.metaValue} variant="bodyMd">
              {currentAppVersion} ({currentBuildVersion})
            </Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel} tone="muted" variant="bodySm">
              Runtime
            </Text>
            <Text style={styles.metaValue} variant="bodyMd">
              {currentlyRunning.runtimeVersion ?? 'unknown'}
            </Text>
          </View>
        </View>
        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel} tone="muted" variant="bodySm">
              Current OTA
            </Text>
            <Text style={styles.metaValue} variant="bodyMd">
              {currentOtaLabel}
            </Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel} tone="muted" variant="bodySm">
              Published
            </Text>
            <Text style={styles.metaValue} variant="bodyMd">
              {formatUpdateTimestamp(currentlyRunning.createdAt)}
            </Text>
          </View>
        </View>
        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel} tone="muted" variant="bodySm">
              Channel
            </Text>
            <Text style={styles.metaValue} variant="bodyMd">
              {currentlyRunning.channel ?? 'unknown'}
            </Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel} tone="muted" variant="bodySm">
              Latest Available
            </Text>
            <Text style={styles.metaValue} variant="bodyMd">
              {availableUpdate ? formatUpdateIdentifier(availableUpdate.updateId) : 'None detected'}
            </Text>
          </View>
        </View>
        {availableUpdate ? (
          <Text style={styles.status} tone="secondary" variant="bodySm">
            Latest available was published {formatUpdateTimestamp(availableUpdate.createdAt)}.
          </Text>
        ) : null}
        {statusText ? (
          <Text style={styles.status} tone="secondary" variant="bodySm">
            {statusText}
          </Text>
        ) : null}
        {errorMessage ? (
          <Text style={styles.error} tone="danger" variant="bodySm">
            {errorMessage}
          </Text>
        ) : null}
        <Button
          disabled={isApplyingUpdate || isChecking || isDownloading}
          label={buttonLabel}
          loading={isApplyingUpdate || isChecking || isDownloading}
          onPress={() => {
            void handleApplyLatestOtaUpdate();
          }}
        />
      </Card>
    </>
  );
}
