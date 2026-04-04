import AsyncStorage from '@react-native-async-storage/async-storage';

const PENDING_FRIEND_SUGGESTION_STORAGE_KEY = 'pending_friend_suggestion_v1';

export interface PendingFriendSuggestion {
  inviterId: string;
  inviterDisplayName?: string;
  newUserEmail: string;
}

function isPendingFriendSuggestion(value: unknown): value is PendingFriendSuggestion {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.inviterId === 'string' &&
    candidate.inviterId.trim().length > 0 &&
    typeof candidate.newUserEmail === 'string' &&
    candidate.newUserEmail.trim().length > 0 &&
    (candidate.inviterDisplayName === undefined || typeof candidate.inviterDisplayName === 'string')
  );
}

export async function savePendingFriendSuggestion(suggestion: PendingFriendSuggestion): Promise<void> {
  await AsyncStorage.setItem(PENDING_FRIEND_SUGGESTION_STORAGE_KEY, JSON.stringify(suggestion));
}

export async function getPendingFriendSuggestion(): Promise<PendingFriendSuggestion | null> {
  const raw = await AsyncStorage.getItem(PENDING_FRIEND_SUGGESTION_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isPendingFriendSuggestion(parsed)) {
      await AsyncStorage.removeItem(PENDING_FRIEND_SUGGESTION_STORAGE_KEY);
      return null;
    }

    return parsed;
  } catch {
    await AsyncStorage.removeItem(PENDING_FRIEND_SUGGESTION_STORAGE_KEY);
    return null;
  }
}

export async function clearPendingFriendSuggestion(): Promise<void> {
  await AsyncStorage.removeItem(PENDING_FRIEND_SUGGESTION_STORAGE_KEY);
}
