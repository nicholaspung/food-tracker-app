import type { FeedbackRecord } from '../../features';
import type { StatusPillTone } from './StatusPill';

export type FeedbackStatus = FeedbackRecord['status'];

export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  closed: 'Closed',
};

export const FEEDBACK_STATUS_OPTIONS: readonly FeedbackStatus[] = [
  'open',
  'in_progress',
  'resolved',
  'closed',
] as const;

export function resolveFeedbackStatusTone(status: FeedbackStatus): StatusPillTone {
  if (status === 'in_progress') {
    return 'warning';
  }

  if (status === 'resolved') {
    return 'success';
  }

  if (status === 'closed') {
    return 'muted';
  }

  return 'info';
}
