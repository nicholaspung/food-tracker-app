import { escapeFilterValue, toErrorMessage } from '@/lib/formatters';
import { pb } from '@/lib/pocketbase';
import type { FeedbackMessage, FeedbackThread } from '@/lib/types';

export type FeedbackStatusFilter = 'active' | 'resolved' | 'closed' | 'all';
export interface SendAdminFeedbackMessageInput {
  message: string;
  threadId: string;
}

function requireAuthenticatedAdminId() {
  const userId = pb.authStore.record?.id;

  if (!userId) {
    throw new Error('You must be signed in as an admin to reply.');
  }

  return userId;
}

export async function listFeedbackThreads(statusFilter: FeedbackStatusFilter) {
  const filter =
    statusFilter === 'active'
      ? '(status = "open" || status = "in_progress")'
      : statusFilter === 'all'
        ? undefined
        : `status = "${statusFilter}"`;

  const response = await pb.collection('feedback').getList<FeedbackThread>(1, 50, {
    expand: 'user,assigned_admin',
    filter,
    sort: '-last_message_at,-updated',
  });

  return response.items;
}

export async function getFeedbackThread(threadId: string) {
  return pb.collection('feedback').getOne<FeedbackThread>(threadId, {
    expand: 'user,assigned_admin',
  });
}

export async function listFeedbackMessages(threadId: string) {
  const escapedThreadId = escapeFilterValue(threadId);

  return pb.collection('feedback_messages').getFullList<FeedbackMessage>({
    expand: 'user',
    filter: `feedback = "${escapedThreadId}"`,
    sort: 'created',
  });
}

export async function sendAdminFeedbackMessage(input: SendAdminFeedbackMessageInput) {
  const trimmedMessage = input.message.trim();

  if (!trimmedMessage) {
    throw new Error('Reply is required.');
  }

  requireAuthenticatedAdminId();

  try {
    await pb.send(`/api/admin/feedback/${encodeURIComponent(input.threadId)}/reply`, {
      method: 'POST',
      body: {
        message: trimmedMessage,
      },
    });
  } catch (error) {
    throw new Error(toErrorMessage(error, 'Could not send this reply.'));
  }
}

export async function claimFeedbackThread(threadId: string) {
  requireAuthenticatedAdminId();

  try {
    await pb.send(`/api/admin/feedback/${encodeURIComponent(threadId)}/claim`, {
      method: 'POST',
    });
  } catch (error) {
    throw new Error(toErrorMessage(error, 'Could not claim this feedback thread.'));
  }
}

export async function releaseFeedbackThread(threadId: string) {
  requireAuthenticatedAdminId();

  try {
    await pb.send(`/api/admin/feedback/${encodeURIComponent(threadId)}/release`, {
      method: 'POST',
    });
  } catch (error) {
    throw new Error(toErrorMessage(error, 'Could not release this feedback thread.'));
  }
}
