import { Alert } from 'react-native';

import { trackObservabilityEvent } from '../observability';

const DEFAULT_QUEUED_OFFLINE_TITLE = 'Saved Offline';
const DEFAULT_SUBJECT = 'Changes';
const QUEUED_OFFLINE_SUFFIX = 'queued and will sync when you reconnect.';

export interface QueuedOfflineAlertOptions {
  title?: string;
  subject?: string;
  message?: string;
  analyticsSource?: string;
}

function buildQueuedOfflineMessage(subject: string): string {
  const trimmedSubject = subject.trim().replace(/\.+$/, '');
  const resolvedSubject = trimmedSubject.length > 0 ? trimmedSubject : DEFAULT_SUBJECT;
  return `${resolvedSubject} ${QUEUED_OFFLINE_SUFFIX}`;
}

export function showQueuedOfflineAlert(options: QueuedOfflineAlertOptions | string): void {
  const resolvedOptions = typeof options === 'string' ? { subject: options } : options;
  const message =
    resolvedOptions.message ?? buildQueuedOfflineMessage(resolvedOptions.subject ?? DEFAULT_SUBJECT);

  trackObservabilityEvent('QUEUED_OFFLINE_ALERT_SHOWN', {
    analyticsSource: resolvedOptions.analyticsSource ?? null,
    hasCustomMessage: Boolean(resolvedOptions.message),
    hasCustomTitle: Boolean(resolvedOptions.title),
    messageLength: message.length,
    source: 'offlineAlerts',
    subjectLength: (resolvedOptions.subject ?? DEFAULT_SUBJECT).trim().length,
  });

  Alert.alert(resolvedOptions.title ?? DEFAULT_QUEUED_OFFLINE_TITLE, message);
}
