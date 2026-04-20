import { pb } from '@/lib/pocketbase';
import type { AdminUser } from '@/features/auth/types';
import type {
  FeedbackThread,
  FoodItemSummary,
  MenuItemRecord,
  ModerationAction,
  ModerationAppealState,
  ModerationCase,
  ModerationFeedEntry,
  ModerationReasonCode,
  ModerationRestaurantList,
  NoteSummary,
  PhotoUpload,
  UserBillSummary,
  UserRestaurantRecord,
  VisitSummary,
} from '@/lib/types';

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
  recentRestaurants: UserRestaurantRecord[];
  recentMenuItems: MenuItemRecord[];
  recentBills: UserBillSummary[];
  feedEntries: ModerationFeedEntry[];
  restaurantLists: ModerationRestaurantList[];
  moderationCases: ModerationCase[];
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

export async function deleteModeratedUserContent(input: {
  userId: string;
  contentType: 'visit' | 'food-item' | 'food-product' | 'list' | 'list-item' | 'note' | 'photo';
  recordId: string;
}) {
  try {
    await pb.send(
      `/api/admin/users/${encodeURIComponent(input.userId)}/content/${encodeURIComponent(input.contentType)}/${encodeURIComponent(input.recordId)}`,
      {
        method: 'DELETE',
      },
    );
  } catch (error) {
    throw new Error(toErrorMessage(error, 'Could not moderate this content.'));
  }
}

export async function updateUserModeration(input: {
  userId: string;
  action?: ModerationAction | 'restore';
  moderationState?: AdminUser['moderationState'];
  contentModerationMode?: AdminUser['contentModerationMode'];
  moderationNotice?: string;
  moderationNotes?: string;
  postingSuspendedUntil?: string;
  photoSuspendedUntil?: string;
  warningCount?: number;
}) {
  try {
    return await pb.send<AdminUser>(`/api/admin/users/${encodeURIComponent(input.userId)}/moderation`, {
      method: 'PATCH',
      body: input,
    });
  } catch (error) {
    throw new Error(toErrorMessage(error, 'Could not update account moderation.'));
  }
}

export async function moderateUserContent(input: {
  userId: string;
  contentType: 'visit' | 'food-item' | 'food-product' | 'list' | 'list-item' | 'note' | 'photo';
  recordId: string;
  action: ModerationAction;
  reasonCode?: ModerationReasonCode;
  moderatorNote?: string;
  userNotice?: string;
  appealState?: ModerationAppealState;
}) {
  try {
    await pb.send(
      `/api/admin/users/${encodeURIComponent(input.userId)}/content/${encodeURIComponent(input.contentType)}/${encodeURIComponent(input.recordId)}/moderation`,
      {
        method: 'PATCH',
        body: input,
      },
    );
  } catch (error) {
    throw new Error(toErrorMessage(error, 'Could not update content moderation.'));
  }
}

export async function listModerationCases(filters?: {
  status?: string;
  userId?: string;
  assignment?: 'all' | 'mine' | 'unassigned';
}) {
  try {
    const response = await pb.send<AdminListResponse<ModerationCase>>('/api/admin/moderation/cases', {
      query: {
        assignment: filters?.assignment && filters.assignment !== 'all' ? filters.assignment : undefined,
        status: filters?.status && filters.status !== 'all' ? filters.status : undefined,
        userId: filters?.userId?.trim() || undefined,
      },
    });

    return response.items;
  } catch (error) {
    throw new Error(toErrorMessage(error, 'Could not load moderation cases.'));
  }
}

export async function claimModerationCase(caseId: string) {
  try {
    await pb.send(`/api/admin/moderation/cases/${encodeURIComponent(caseId)}/claim`, {
      method: 'POST',
    });
  } catch (error) {
    throw new Error(toErrorMessage(error, 'Could not claim this moderation case.'));
  }
}

export async function releaseModerationCase(caseId: string) {
  try {
    await pb.send(`/api/admin/moderation/cases/${encodeURIComponent(caseId)}/release`, {
      method: 'POST',
    });
  } catch (error) {
    throw new Error(toErrorMessage(error, 'Could not release this moderation case.'));
  }
}
