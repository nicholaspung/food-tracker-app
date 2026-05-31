import { pb } from '@/lib/pocketbase';

interface AdminMonthlyFriendsActivityTestResponse {
  friendCount: number;
  month: string;
  status: string;
  userId: string;
  visitCount: number;
}

function toErrorMessage(error: unknown, fallbackMessage: string) {
  if (typeof error === 'object' && error !== null) {
    const responseData = (error as { response?: { message?: string } }).response;
    if (typeof responseData?.message === 'string' && responseData.message.trim()) {
      return responseData.message;
    }

    const errorMessage = (error as { message?: string }).message;
    if (typeof errorMessage === 'string' && errorMessage.trim()) {
      return errorMessage;
    }
  }

  return fallbackMessage;
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
