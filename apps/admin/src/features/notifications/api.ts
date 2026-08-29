import { toErrorMessage } from '@/lib/formatters';
import { pb } from '@/lib/pocketbase';

interface AdminMonthlyFriendsActivityTestResponse {
  diagnostics?: {
    acceptedFriendCount: number;
    acceptedFriendVisitCountInMonth: number;
    friendVisibleCreatedCountInMonth: number;
    friendVisibleVisitCountAllTime: number;
    friendVisibleVisitDateCountInMonth: number;
    privateAcceptedFriendCountInMonth: number;
    targetUserExists: boolean;
  };
  friendCount?: number;
  month: string;
  status: string;
  userId: string;
  visitCount?: number;
}

export interface AdminNotificationTestRecipientResult {
  status: string;
  userId: string;
}

export interface AdminBillOwedNotificationTestResponse {
  billId: string;
  recipients: AdminNotificationTestRecipientResult[];
  status: string;
}

export interface AdminTastingInviteNotificationTestResponse {
  sessionId: string;
  status: string;
  userId: string;
}

export async function sendMonthlyFriendsActivityTestNotification(input: {
  force: boolean;
  month?: string;
  userId: string;
}): Promise<AdminMonthlyFriendsActivityTestResponse> {
  try {
    return await pb.send<AdminMonthlyFriendsActivityTestResponse>(
      '/api/admin/notifications/monthly-friends-activity/test',
      {
        body: {
          force: input.force,
          month: input.month?.trim() || undefined,
          userId: input.userId.trim(),
        },
        method: 'POST',
      },
    );
  } catch (error) {
    throw new Error(toErrorMessage(error, 'Could not send monthly friends activity test notification.'));
  }
}

export async function sendBillOwedTestNotification(input: {
  actorUserId?: string;
  billId?: string;
  userIds: string[];
}): Promise<AdminBillOwedNotificationTestResponse> {
  try {
    return await pb.send<AdminBillOwedNotificationTestResponse>(
      '/api/admin/notifications/bill-owed/test',
      {
        body: {
          actorUserId: input.actorUserId?.trim() || undefined,
          billId: input.billId?.trim() || undefined,
          userIds: input.userIds.map((userId) => userId.trim()).filter(Boolean),
        },
        method: 'POST',
      },
    );
  } catch (error) {
    throw new Error(toErrorMessage(error, 'Could not send bill owed test notification.'));
  }
}

export async function sendTastingInviteTestNotification(input: {
  actorUserId?: string;
  sessionId?: string;
  userId: string;
}): Promise<AdminTastingInviteNotificationTestResponse> {
  try {
    return await pb.send<AdminTastingInviteNotificationTestResponse>(
      '/api/admin/notifications/tasting-invite/test',
      {
        body: {
          actorUserId: input.actorUserId?.trim() || undefined,
          sessionId: input.sessionId?.trim() || undefined,
          userId: input.userId.trim(),
        },
        method: 'POST',
      },
    );
  } catch (error) {
    throw new Error(toErrorMessage(error, 'Could not send tasting invite test notification.'));
  }
}
