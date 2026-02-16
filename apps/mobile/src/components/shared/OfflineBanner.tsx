import { StyleSheet, View } from 'react-native';

import { useTheme } from '../../theme';
import { Button, Card, Text } from '../../ui';

export interface OfflineBannerProps {
  isOnline: boolean;
  pendingWrites?: number;
  failedWrites?: number;
  onRetryFailed?: () => void;
  onSyncNow?: () => void;
  isSyncing?: boolean;
}

export function OfflineBanner({
  isOnline,
  pendingWrites = 0,
  failedWrites = 0,
  onRetryFailed,
  onSyncNow,
  isSyncing = false,
}: OfflineBannerProps) {
  const theme = useTheme();
  const hasQueue = pendingWrites > 0 || failedWrites > 0;

  if (isOnline && !hasQueue) {
    return null;
  }

  const tone = !isOnline ? 'warning' : failedWrites > 0 ? 'danger' : 'info';
  const headline = !isOnline
    ? `Offline mode: ${pendingWrites} queued write${pendingWrites === 1 ? '' : 's'}`
    : failedWrites > 0
      ? `${failedWrites} failed write${failedWrites === 1 ? '' : 's'} need retry`
      : isSyncing
        ? `Syncing ${pendingWrites} queued write${pendingWrites === 1 ? '' : 's'}...`
        : `${pendingWrites} queued write${pendingWrites === 1 ? '' : 's'} pending sync`;

  const detail = !isOnline
    ? 'Changes are queued locally and will replay once connection returns.'
    : failedWrites > 0
      ? 'Retry failed writes after confirming network and auth state.'
      : 'You can trigger sync now to flush the queue immediately.';

  const styles = StyleSheet.create({
    actions: {
      flexDirection: 'row',
      gap: theme.spacing.sm,
      marginTop: theme.spacing.xs,
    },
    action: {
      flex: 1,
    },
    container: {
      gap: theme.spacing.xs,
    },
  });

  return (
    <Card tone={tone}>
      <View style={styles.container}>
        <Text variant="label" tone={tone === 'warning' ? 'warning' : tone === 'danger' ? 'danger' : 'info'}>
          {headline}
        </Text>
        <Text tone={tone === 'warning' ? 'warning' : tone === 'danger' ? 'danger' : 'info'}>{detail}</Text>
      </View>
      {onRetryFailed || onSyncNow ? (
        <View style={styles.actions}>
          {failedWrites > 0 && onRetryFailed ? (
            <Button
              disabled={!isOnline}
              label="Retry failed"
              onPress={onRetryFailed}
              style={styles.action}
              variant="secondary"
            />
          ) : null}
          {pendingWrites > 0 && onSyncNow ? (
            <Button
              disabled={!isOnline || isSyncing}
              label={isSyncing ? 'Syncing...' : 'Sync now'}
              onPress={onSyncNow}
              style={styles.action}
              variant="secondary"
            />
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}
