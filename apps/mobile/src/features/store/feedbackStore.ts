import { pb } from '../../lib/pocketbase';
import type { FeedbackMessageRecord, FeedbackRecord } from '../models';
import type {
  CreateFeedbackInput,
  FeedbackCountSummary,
  ListFeedbackMessagesPageInput,
  ListFeedbackPageInput,
  PaginatedResult,
  SendFeedbackMessageInput,
} from './featureStore';
import {
  createEmptyPaginatedResult,
  escapeFilterValue,
  getAuthenticatedUserId,
  isCurrentUserAdmin,
  mapPaginatedResult,
  nowIso,
  resolvePaginationInput,
  resolveExpandedUserName,
  trackFeatureMutation,
} from './featureStoreShared';
import type { CollectionUserExpand } from './pocketbaseRecordTypes';
import { listCollectionPage, sendApiRequest } from './pocketbaseGateway';

export type {
  CreateFeedbackInput,
  FeedbackCountSummary,
  FeedbackStatusFilter,
  ListFeedbackMessagesPageInput,
  ListFeedbackPageInput,
  SendFeedbackMessageInput,
} from './featureStore';

interface FeedbackCollectionRecord {
  id: string;
  user: string;
  assigned_admin?: string;
  admin_reply_deadline_at?: string;
  title: string;
  description: string;
  status: string;
  admin_unread_count?: number;
  user_unread_count?: number;
  last_message_at?: string;
  created: string;
  updated: string;
  expand?: {
    user?: CollectionUserExpand;
  };
}

interface FeedbackMessageCollectionRecord {
  id: string;
  feedback: string;
  user: string;
  message: string;
  is_admin_message?: boolean;
  created: string;
  expand?: {
    user?: CollectionUserExpand;
  };
}

function normalizeFeedbackStatus(status: unknown): FeedbackRecord['status'] {
  if (status === 'open' || status === 'in_progress' || status === 'resolved' || status === 'closed') {
    return status;
  }

  return 'open';
}

function parseCount(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0;
  }

  return Math.max(0, Math.floor(value));
}

function mapFeedbackRecord(record: FeedbackCollectionRecord): FeedbackRecord {
  return {
    id: record.id,
    userId: record.user,
    userName: resolveExpandedUserName(record.expand?.user),
    userEmail: record.expand?.user?.email,
    assignedAdminId: record.assigned_admin,
    adminReplyDeadlineAt: record.admin_reply_deadline_at,
    title: record.title,
    description: record.description,
    status: normalizeFeedbackStatus(record.status),
    adminUnreadCount: parseCount(record.admin_unread_count),
    userUnreadCount: parseCount(record.user_unread_count),
    lastMessageAt: record.last_message_at,
    createdAt: record.created,
    updatedAt: record.updated,
  };
}

function mapFeedbackMessageRecord(record: FeedbackMessageCollectionRecord): FeedbackMessageRecord {
  return {
    id: record.id,
    feedbackId: record.feedback,
    userId: record.user,
    userName: resolveExpandedUserName(record.expand?.user),
    userEmail: record.expand?.user?.email,
    message: record.message,
    isAdminMessage: record.is_admin_message === true,
    createdAt: record.created,
  };
}

export async function listFeedbackPage(input?: ListFeedbackPageInput): Promise<PaginatedResult<FeedbackRecord>> {
  if (!pb.authStore.record?.id) {
    return createEmptyPaginatedResult(input);
  }

  const { page, pageSize } = resolvePaginationInput(input);
  const currentUserId = getAuthenticatedUserId();
  const escapedCurrentUserId = escapeFilterValue(currentUserId);
  const statusFilter = input?.status ?? 'all';
  const statusClause =
    statusFilter === 'active'
      ? '(status = "open" || status = "in_progress")'
      : statusFilter === 'all'
        ? undefined
        : `status = "${statusFilter}"`;
  const filter = statusClause
    ? `user = "${escapedCurrentUserId}" && ${statusClause}`
    : `user = "${escapedCurrentUserId}"`;

  const pageResult = await listCollectionPage<FeedbackCollectionRecord>('feedback', {
    page,
    pageSize,
    filter,
    sort: '-last_message_at,-created',
    expand: 'user',
  });

  return mapPaginatedResult(pageResult, pageResult.items.map(mapFeedbackRecord));
}

export async function getFeedbackCountSummary(): Promise<FeedbackCountSummary> {
  if (!pb.authStore.record?.id) {
    return {
      allCount: 0,
      activeCount: 0,
    };
  }

  return sendApiRequest<FeedbackCountSummary>('/api/feedback/summary', {
    method: 'GET',
  });
}

export async function getFeedbackById(feedbackId: string): Promise<FeedbackRecord> {
  const currentUserId = getAuthenticatedUserId();

  const record = await pb.collection('feedback').getOne<FeedbackCollectionRecord>(feedbackId, {
    expand: 'user',
  });

  const feedback = mapFeedbackRecord(record);
  if (feedback.userId !== currentUserId) {
    throw new Error('This feedback thread could not be found.');
  }

  return feedback;
}

export async function createFeedback(input: CreateFeedbackInput): Promise<FeedbackRecord> {
  return trackFeatureMutation(
    'feedback.create',
    async () => {
      const userId = getAuthenticatedUserId();

      const createdRecord = await pb.collection('feedback').create<FeedbackCollectionRecord>(
        {
          user: userId,
          title: input.title.trim(),
          description: input.description.trim(),
          status: 'open',
          admin_unread_count: 1,
          user_unread_count: 0,
          last_message_at: nowIso(),
        },
        {
          expand: 'user',
        },
      );

      return mapFeedbackRecord(createdRecord);
    },
    {
      hasTitle: Boolean(input.title.trim()),
      descriptionLength: input.description.trim().length,
    },
  );
}

export async function updateFeedbackStatus(
  feedbackId: string,
  status: FeedbackRecord['status'],
): Promise<FeedbackRecord> {
  return trackFeatureMutation(
    'feedback.status.update',
    async () => {
      if (!isCurrentUserAdmin()) {
        throw new Error('Only admins can update feedback status.');
      }

      const updated = await pb.collection('feedback').update<FeedbackCollectionRecord>(
        feedbackId,
        {
          status,
        },
        {
          expand: 'user',
        },
      );

      return mapFeedbackRecord(updated);
    },
    {
      status,
    },
  );
}

export async function listFeedbackMessagesPage(
  feedbackId: string,
  input?: ListFeedbackMessagesPageInput,
): Promise<PaginatedResult<FeedbackMessageRecord>> {
  const { page, pageSize } = resolvePaginationInput(input);
  const order = input?.order === 'asc' ? 'asc' : 'desc';
  const pageResult = await listCollectionPage<FeedbackMessageCollectionRecord>('feedback_messages', {
    page,
    pageSize,
    filter: `feedback = "${escapeFilterValue(feedbackId)}"`,
    sort: order === 'asc' ? 'created' : '-created',
    expand: 'user',
  });

  return mapPaginatedResult(pageResult, pageResult.items.map(mapFeedbackMessageRecord));
}

export async function markFeedbackAsRead(feedbackId: string): Promise<boolean> {
  return trackFeatureMutation('feedback.mark_read', async () => {
    const feedback = await getFeedbackById(feedbackId);
    if (feedback.userUnreadCount > 0) {
      await pb.collection('feedback').update(feedbackId, {
        user_unread_count: 0,
      });
      return true;
    }

    return false;
  });
}

export async function sendFeedbackMessage(input: SendFeedbackMessageInput): Promise<void> {
  return trackFeatureMutation(
    'feedback.message.send',
    async () => {
      const userId = getAuthenticatedUserId();
      const trimmedMessage = input.message.trim();

      if (!trimmedMessage) {
        throw new Error('Message is required.');
      }

      const feedback = await getFeedbackById(input.feedbackId);

      await pb.collection('feedback_messages').create({
        feedback: input.feedbackId,
        user: userId,
        message: trimmedMessage,
        is_admin_message: false,
      });

      const feedbackUpdate: Record<string, string | number> = {
        last_message_at: nowIso(),
        admin_unread_count: feedback.adminUnreadCount + 1,
      };

      const hasActiveAssignedAdmin =
        Boolean(feedback.assignedAdminId) &&
        (!feedback.adminReplyDeadlineAt || new Date(feedback.adminReplyDeadlineAt).getTime() > Date.now());

      if (hasActiveAssignedAdmin) {
        feedbackUpdate.admin_reply_deadline_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      }

      await pb.collection('feedback').update(input.feedbackId, feedbackUpdate);
    },
    {
      messageLength: input.message.trim().length,
    },
  );
}
