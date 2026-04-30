import type { QueuedMutation } from '../../offline/types';

export function formatQueuedWriteStatus(status: QueuedMutation['status']): string {
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

export function resolveQueuedWriteStatusTone(
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

export function formatQueuedWriteTimestamp(createdAt: number): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    day: 'numeric',
  }).format(new Date(createdAt));
}

export function formatQueuedWriteError(lastError?: string | null): string | null {
  const trimmedError = lastError?.trim();
  return trimmedError ? trimmedError : null;
}

export function getQueuedWriteHelperText(status: QueuedMutation['status']): string {
  switch (status) {
    case 'failed':
      return 'Retry failed writes from the sync banner.';
    case 'retrying':
      return 'Waiting for the next sync attempt.';
    case 'in_flight':
      return 'Sending this write now.';
    case 'pending':
    default:
      return 'Will sync when your connection is available.';
  }
}
