import { View } from 'react-native';

import type { QueuedMutation } from '../../offline/types';
import { createThemedStyles } from '../../theme';
import { Card, Text } from '../../ui';
import { StatusPill } from './StatusPill';

interface PendingQueuedWriteRowProps {
  title: string;
  description?: string;
  status: QueuedMutation['status'];
  lastError?: string | null;
}

function formatQueuedWriteStatus(status: QueuedMutation['status']): string {
  switch (status) {
    case 'failed':
      return 'Failed';
    case 'in_flight':
      return 'Sending';
    case 'retrying':
      return 'Retrying';
    case 'pending':
    default:
      return 'Queued';
  }
}

function resolveQueuedWriteStatusTone(
  status: QueuedMutation['status'],
): 'info' | 'warning' | 'danger' {
  switch (status) {
    case 'failed':
      return 'danger';
    case 'retrying':
      return 'warning';
    case 'in_flight':
    case 'pending':
    default:
      return 'info';
  }
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
}));

export function PendingQueuedWriteRow({
  description,
  lastError,
  status,
  title,
}: PendingQueuedWriteRowProps) {
  const styles = useStyles();

  return (
    <Card tone={status === 'failed' ? 'danger' : 'info'}>
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
        {description ? (
          <Text tone="secondary" variant="bodySm">
            {description}
          </Text>
        ) : null}
        {lastError ? (
          <Text tone="danger" variant="bodySm">
            {lastError}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}
