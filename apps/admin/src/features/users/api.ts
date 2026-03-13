import { pb } from '@/lib/pocketbase';
import type { AdminUser } from '@/features/auth/types';
import type { FeedbackThread, FoodItemSummary, NoteSummary, PhotoUpload, VisitSummary } from '@/lib/types';

interface AdminListResponse<T> {
  items: T[];
}

function toErrorMessage(error: unknown, fallbackMessage: string) {
  if (typeof error === 'object' && error !== null) {
    const responseData = (error as { response?: { message?: string } }).response;
    if (typeof responseData?.message === 'string' && responseData.message.trim()) {
      return responseData.message;
    }

    if (typeof (error as { message?: string }).message === 'string' && (error as { message?: string }).message?.trim()) {
      return (error as { message: string }).message;
    }
  }

  return fallbackMessage;
}

export async function searchUsers(searchTerm: string) {
  try {
    const response = await pb.send<AdminListResponse<AdminUser>>('/api/admin/users', {
      query: {
        search: searchTerm.trim(),
      },
    });

    return response.items;
  } catch (error) {
    throw new Error(toErrorMessage(error, 'Could not load users.'));
  }
}

export async function findUserByEmail(email: string) {
  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail) {
    throw new Error('Email is required.');
  }

  try {
    return await pb.send<AdminUser>('/api/admin/users/lookup', {
      query: {
        email: normalizedEmail,
      },
    });
  } catch (error) {
    throw new Error(toErrorMessage(error, 'No user was found for that email address.'));
  }
}

export async function updateUserAccessFlags(input: {
  userId: string;
  isSubscriber: boolean;
  isBetaUser: boolean;
}) {
  try {
    return await pb.send<AdminUser>(`/api/admin/users/${encodeURIComponent(input.userId)}/access`, {
      method: 'PATCH',
      body: {
        isSubscriber: input.isSubscriber,
        isBetaUser: input.isBetaUser,
      },
    });
  } catch (error) {
    throw new Error(toErrorMessage(error, 'Could not update user access.'));
  }
}

export interface UserModerationProfile {
  user: AdminUser;
  recentVisits: VisitSummary[];
  recentFoodItems: FoodItemSummary[];
  recentNotes: NoteSummary[];
  recentFeedback: FeedbackThread[];
  recentPhotos: PhotoUpload[];
}

export async function getUserModerationProfile(userId: string): Promise<UserModerationProfile> {
  try {
    return await pb.send<UserModerationProfile>(
      `/api/admin/users/${encodeURIComponent(userId)}/profile`,
      {},
    );
  } catch (error) {
    throw new Error(toErrorMessage(error, 'Could not load this user.'));
  }
}
