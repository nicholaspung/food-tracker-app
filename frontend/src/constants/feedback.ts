/**
 * Feedback status constants
 * Used for displaying feedback/bug report statuses
 */

export const FEEDBACK_STATUS_COLORS = {
  open: 'bg-blue-500',
  in_progress: 'bg-yellow-500',
  resolved: 'bg-green-500',
  closed: 'bg-gray-500',
} as const;

export const FEEDBACK_STATUS_LABELS = {
  open: 'Open',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  closed: 'Closed',
} as const;

export type FeedbackStatus = keyof typeof FEEDBACK_STATUS_COLORS;
