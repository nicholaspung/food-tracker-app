import { localPersistence } from '../localPersistence';

const PENDING_FRIEND_SUGGESTION_STORAGE_KEY = localPersistence.authHandoffs.keys.pendingFriendSuggestion;
export const PENDING_FRIEND_SUGGESTION_TTL_MS = 24 * 60 * 60 * 1000;

export interface PendingFriendSuggestion {
  inviterId: string;
  inviterDisplayName?: string;
  invitedUserId: string;
  createdAt: number;
  expiresAt: number;
}

function isPendingFriendSuggestion(value: unknown): value is PendingFriendSuggestion {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.inviterId === 'string' &&
    candidate.inviterId.trim().length > 0 &&
    typeof candidate.invitedUserId === 'string' &&
    candidate.invitedUserId.trim().length > 0 &&
    typeof candidate.createdAt === 'number' &&
    Number.isFinite(candidate.createdAt) &&
    typeof candidate.expiresAt === 'number' &&
    Number.isFinite(candidate.expiresAt) &&
    candidate.expiresAt > candidate.createdAt &&
    (candidate.inviterDisplayName === undefined || typeof candidate.inviterDisplayName === 'string')
  );
}

export function createPendingFriendSuggestion(input: {
  inviterId: string;
  inviterDisplayName?: string;
  invitedUserId: string;
  now?: number;
}): PendingFriendSuggestion {
  const createdAt = input.now ?? Date.now();
  return {
    inviterId: input.inviterId,
    inviterDisplayName: input.inviterDisplayName,
    invitedUserId: input.invitedUserId,
    createdAt,
    expiresAt: createdAt + PENDING_FRIEND_SUGGESTION_TTL_MS,
  };
}

export async function savePendingFriendSuggestion(
  input: Omit<PendingFriendSuggestion, 'createdAt' | 'expiresAt'> | PendingFriendSuggestion,
): Promise<void> {
  const suggestion =
    'createdAt' in input && 'expiresAt' in input
      ? input
      : createPendingFriendSuggestion(input);

  await localPersistence.authHandoffs.storage.setItem(PENDING_FRIEND_SUGGESTION_STORAGE_KEY, JSON.stringify(suggestion));
}

export async function getPendingFriendSuggestion(): Promise<PendingFriendSuggestion | null> {
  const raw = await localPersistence.authHandoffs.storage.getItem(PENDING_FRIEND_SUGGESTION_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isPendingFriendSuggestion(parsed)) {
      await localPersistence.authHandoffs.storage.removeItem(PENDING_FRIEND_SUGGESTION_STORAGE_KEY);
      return null;
    }

    if (parsed.expiresAt <= Date.now()) {
      await localPersistence.authHandoffs.storage.removeItem(PENDING_FRIEND_SUGGESTION_STORAGE_KEY);
      return null;
    }

    return parsed;
  } catch {
    await localPersistence.authHandoffs.storage.removeItem(PENDING_FRIEND_SUGGESTION_STORAGE_KEY);
    return null;
  }
}

export async function clearPendingFriendSuggestion(): Promise<void> {
  await localPersistence.authHandoffs.storage.removeItem(PENDING_FRIEND_SUGGESTION_STORAGE_KEY);
}
