import { View } from 'react-native';

import type { QueuedMutation } from '../../offline/types';
import { createThemedStyles } from '../../theme';
import { Card, Text } from '../../ui';
import { StatusPill } from './StatusPill';
import {
  formatQueuedWriteError,
  formatQueuedWriteStatus,
  formatQueuedWriteTimestamp,
  getQueuedWriteHelperText,
  resolveQueuedWriteStatusTone,
} from './queuedWriteDisplay';

interface PendingQueuedWriteDetail {
  label: string;
  value: string;
}

interface PendingQueuedWriteRowProps {
  title: string;
  description?: string;
  status: QueuedMutation['status'];
  lastError?: string | null;
  createdAt?: number;
  idempotencyKey?: string;
  details?: readonly PendingQueuedWriteDetail[];
  testID?: string;
}

const useStyles = createThemedStyles((theme) => ({
  row: {
    gap: theme.spacing.xxs,
  },
  headingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  title: {
    flex: 1,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  details: {
    gap: theme.spacing.xxs,
  },
}));

export function PendingQueuedWriteRow({
  createdAt,
  description,
  details,
  idempotencyKey,
  lastError,
  status,
  testID,
  title,
}: PendingQueuedWriteRowProps) {
  const styles = useStyles();
  const formattedError = formatQueuedWriteError(lastError);
  const visibleDetails = [
    ...(details ?? []),
    ...(idempotencyKey ? [{ label: 'Request', value: idempotencyKey }] : []),
  ].filter((detail) => detail.value.trim().length > 0);

  return (
    <Card testID={testID} tone={status === 'failed' ? 'danger' : 'info'}>
      <View style={styles.row}>
        <View style={styles.headingRow}>
          <Text style={styles.title} variant="label">
            {title}
          </Text>
          <StatusPill
            label={formatQueuedWriteStatus(status)}
            tone={resolveQueuedWriteStatusTone(status)}
          />
        </View>
        {createdAt ? (
          <View style={styles.metaRow}>
            <Text tone="muted" variant="bodySm">
              Queued {formatQueuedWriteTimestamp(createdAt)}
            </Text>
          </View>
        ) : null}
        {description ? (
          <Text tone="secondary" variant="bodySm">
            {description}
          </Text>
        ) : null}
        {visibleDetails.length > 0 ? (
          <View style={styles.details}>
            {visibleDetails.map((detail) => (
              <Text key={`${detail.label}:${detail.value}`} tone="muted" variant="bodySm">
                {detail.label}: {detail.value}
              </Text>
            ))}
          </View>
        ) : null}
        {formattedError ? (
          <Text tone="danger" variant="bodySm">
            {formattedError}
          </Text>
        ) : null}
        <Text tone={status === 'failed' ? 'danger' : 'secondary'} variant="bodySm">
          {getQueuedWriteHelperText(status)}
        </Text>
      </View>
    </Card>
  );
}
