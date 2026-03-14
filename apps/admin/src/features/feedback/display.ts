import type { AdminUser } from '@/features/auth/types';
import type { FeedbackThread } from '@/lib/types';

function isPocketBaseRecordId(value?: string | null) {
  return typeof value === 'string' && /^[a-z0-9]{15}$/.test(value.trim());
}

export function getFeedbackParticipantName(
  user?: Pick<AdminUser, 'email' | 'name'> | null,
  fallbackId?: string,
) {
  const trimmedName = user?.name?.trim();

  if (trimmedName) {
    return trimmedName;
  }

  const trimmedEmail = user?.email?.trim();

  if (trimmedEmail) {
    return trimmedEmail;
  }

  if (fallbackId && !isPocketBaseRecordId(fallbackId)) {
    return fallbackId;
  }

  return 'User';
}

export function getFeedbackParticipantSubtitle(
  user?: Pick<AdminUser, 'email' | 'name'> | null,
  fallbackId?: string,
) {
  const trimmedName = user?.name?.trim();
  const trimmedEmail = user?.email?.trim();

  if (trimmedName && trimmedEmail) {
    return trimmedEmail;
  }

  if (fallbackId && !isPocketBaseRecordId(fallbackId) && fallbackId !== getFeedbackParticipantName(user, fallbackId)) {
    return fallbackId;
  }

  return null;
}

function parseDate(value?: string | null) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function getFeedbackAssignmentState(
  thread: Pick<FeedbackThread, 'assigned_admin' | 'admin_reply_deadline_at' | 'expand'>,
  currentAdminId?: string,
) {
  const assignedAdminId = thread.assigned_admin?.trim() || '';
  const deadline = parseDate(thread.admin_reply_deadline_at);
  const hasExpiredDeadline = deadline !== null && deadline.getTime() <= Date.now();
  const isExpired = Boolean(assignedAdminId) && hasExpiredDeadline;
  const activeAssignedAdminId = isExpired ? '' : assignedAdminId;
  const ownerName = assignedAdminId
    ? getFeedbackParticipantName(thread.expand?.assigned_admin, assignedAdminId)
    : null;
  const ownerSubtitle = assignedAdminId
    ? getFeedbackParticipantSubtitle(thread.expand?.assigned_admin, assignedAdminId)
    : null;

  return {
    activeAssignedAdminId,
    deadline,
    isAvailable: !activeAssignedAdminId,
    isExpired,
    isOwnedByCurrentAdmin: Boolean(activeAssignedAdminId) && activeAssignedAdminId === currentAdminId,
    isOwnedByOtherAdmin: Boolean(activeAssignedAdminId) && activeAssignedAdminId !== currentAdminId,
    ownerName,
    ownerSubtitle,
    rawAssignedAdminId: assignedAdminId,
  };
}
