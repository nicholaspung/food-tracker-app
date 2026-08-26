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
  type FeatureWriteRequestOptions,
  getAuthenticatedUserId,
  mapPaginatedResult,
  resolveFeatureWriteHeaders,
  resolvePaginationInput,
  resolveExpandedUserName,
  trackFeatureMutation,
} from './featureStoreShared';
import type { CollectionUserExpand } from './pocketbaseRecordTypes';
import {
  listCollectionPage,
  sendApiRequest,
} from './pocketbaseGateway';

export type {
  CreateFeedbackInput,
  FeedbackCountSummary,
  FeedbackStatusFilter,
  ListFeedbackMessagesPageInput,
  ListFeedbackPageInput,
  SendFeedbackMessageInput,
} from './featureStore';

interface ReadRequestOptions {
  signal?: AbortSignal;
}

interface FeedbackCollectionRecord {
  id: string;
  user: string;
  user_name?: string;
  user_email?: string;
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
  user_name?: string;
  user_email?: string;
  message: string;
  is_admin_message?: boolean;
  created: string;
  expand?: {
    user?: CollectionUserExpand;
  };
}

interface FeedbackMessagesPageResponse {
  items: FeedbackMessageCollectionRecord[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
}

interface FeedbackDetailResponse {
  feedback: FeedbackCollectionRecord;
  messages: FeedbackMessagesPageResponse;
}

interface FeedbackReplyResponse {
  feedback: FeedbackCollectionRecord;
  message: FeedbackMessageCollectionRecord;
  success: boolean;
}

interface MarkFeedbackAsReadResponse {
  feedback: FeedbackCollectionRecord;
  markedRead?: boolean;
  success: boolean;
}

interface FeedbackMarkReadResult {
  feedback: FeedbackRecord;
  markedRead: boolean;
}

export interface FeedbackReplyResult {
  feedback: FeedbackRecord;
  message: FeedbackMessageRecord;
}

export interface FeedbackThreadDetailResult {
  feedback: FeedbackRecord;
  messages: PaginatedResult<FeedbackMessageRecord>;
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
    userName: record.user_name ?? resolveExpandedUserName(record.expand?.user),
    userEmail: record.user_email ?? record.expand?.user?.email,
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
    userName: record.user_name ?? resolveExpandedUserName(record.expand?.user),
    userEmail: record.user_email ?? record.expand?.user?.email,
    message: record.message,
    isAdminMessage: record.is_admin_message === true,
    createdAt: record.created,
  };
}

function mapFeedbackMessagesPageResponse(
  pageResult: FeedbackMessagesPageResponse,
): PaginatedResult<FeedbackMessageRecord> {
  return {
    items: pageResult.items.map(mapFeedbackMessageRecord),
    page: pageResult.page,
    pageSize: pageResult.pageSize,
    totalItems: pageResult.totalItems,
    totalPages: pageResult.totalPages,
    hasNextPage: pageResult.hasNextPage,
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
    signal: input?.signal,
  });

  return mapPaginatedResult(pageResult, pageResult.items.map(mapFeedbackRecord));
}

export async function getFeedbackCountSummary(options?: ReadRequestOptions): Promise<FeedbackCountSummary> {
  if (!pb.authStore.record?.id) {
    return {
      allCount: 0,
      activeCount: 0,
    };
  }

  return sendApiRequest<FeedbackCountSummary>('/api/feedback/summary', {
    method: 'GET',
    signal: options?.signal,
  });
}

export async function getFeedbackThreadDetail(
  feedbackId: string,
  options?: ReadRequestOptions,
): Promise<FeedbackThreadDetailResult> {
  const response = await sendApiRequest<FeedbackDetailResponse>(
    `/api/feedback/${encodeURIComponent(feedbackId)}`,
    {
      method: 'GET',
      signal: options?.signal,
    },
  );

  return {
    feedback: mapFeedbackRecord(response.feedback),
    messages: mapFeedbackMessagesPageResponse(response.messages),
  };
}

export async function createFeedback(
  input: CreateFeedbackInput,
  requestOptions?: FeatureWriteRequestOptions,
): Promise<FeedbackRecord> {
  return trackFeatureMutation(
    'feedback.create',
    async () => {
      const createdRecord = await sendApiRequest<FeedbackCollectionRecord>('/api/feedback', {
        method: 'POST',
        headers: resolveFeatureWriteHeaders(requestOptions),
        body: {
          title: input.title.trim(),
          description: input.description.trim(),
        },
        signal: requestOptions?.signal,
      });
      return mapFeedbackRecord(createdRecord);
    },
    {
      hasTitle: Boolean(input.title.trim()),
      descriptionLength: input.description.trim().length,
    },
  );
}

export async function listFeedbackMessagesPage(
  feedbackId: string,
  input?: ListFeedbackMessagesPageInput,
): Promise<PaginatedResult<FeedbackMessageRecord>> {
  const { page, pageSize } = resolvePaginationInput(input);
  const order = input?.order === 'asc' ? 'asc' : 'desc';

  const pageResult = await sendApiRequest<FeedbackMessagesPageResponse>(
    `/api/feedback/${encodeURIComponent(feedbackId)}/messages?page=${page}&pageSize=${pageSize}&order=${order}`,
    {
      method: 'GET',
      signal: input?.signal,
    },
  );

  return mapFeedbackMessagesPageResponse(pageResult);
}

export async function markFeedbackAsRead(feedbackId: string): Promise<FeedbackMarkReadResult> {
  return trackFeatureMutation('feedback.mark_read', async () => {
    const response = await sendApiRequest<MarkFeedbackAsReadResponse>(
      `/api/feedback/${encodeURIComponent(feedbackId)}/mark-read`,
      {
        method: 'POST',
      },
    );

    return {
      feedback: mapFeedbackRecord(response.feedback),
      markedRead: response.markedRead === true,
    };
  });
}

export async function sendFeedbackMessage(
  input: SendFeedbackMessageInput,
  requestOptions?: FeatureWriteRequestOptions,
): Promise<FeedbackReplyResult> {
  return trackFeatureMutation(
    'feedback.message.send',
    async () => {
      const trimmedMessage = input.message.trim();

      if (!trimmedMessage) {
        throw new Error('Message is required.');
      }

      const response = await sendApiRequest<FeedbackReplyResponse>(
        `/api/feedback/${encodeURIComponent(input.feedbackId)}/reply`,
        {
          method: 'POST',
          headers: resolveFeatureWriteHeaders(requestOptions),
          body: {
            message: trimmedMessage,
          },
          signal: requestOptions?.signal,
        },
      );

      return {
        feedback: mapFeedbackRecord(response.feedback),
        message: mapFeedbackMessageRecord(response.message),
      };
    },
    {
      messageLength: input.message.trim().length,
    },
  );
}
