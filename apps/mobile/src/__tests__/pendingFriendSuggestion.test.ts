import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  clearPendingFriendSuggestion,
  createPendingFriendSuggestion,
  getPendingFriendSuggestion,
  PENDING_FRIEND_SUGGESTION_TTL_MS,
  savePendingFriendSuggestion,
} from '../lib/pendingFriendSuggestion';

const STORAGE_KEY = 'pending_friend_suggestion_v1';

describe('pendingFriendSuggestion', () => {
  beforeEach(async () => {
    jest.restoreAllMocks();
    await AsyncStorage.clear();
  });

  it('persists invited user id instead of the invited user email', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_000);

    await savePendingFriendSuggestion({
      inviterId: 'inviter-1',
      inviterDisplayName: 'Taylor',
      invitedUserId: 'user-1',
    });

    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(raw).not.toContain('user@example.com');
    expect(JSON.parse(raw ?? '{}')).toEqual({
      inviterId: 'inviter-1',
      inviterDisplayName: 'Taylor',
      invitedUserId: 'user-1',
      createdAt: 1_000,
      expiresAt: 1_000 + PENDING_FRIEND_SUGGESTION_TTL_MS,
    });
  });

  it('returns valid unexpired suggestions after restart', async () => {
    const suggestion = createPendingFriendSuggestion({
      inviterId: 'inviter-1',
      invitedUserId: 'user-1',
      now: 1_000,
    });
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(suggestion));
    jest.spyOn(Date, 'now').mockReturnValue(1_000 + PENDING_FRIEND_SUGGESTION_TTL_MS - 1);

    await expect(getPendingFriendSuggestion()).resolves.toEqual(suggestion);
  });

  it('clears expired suggestions on read', async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(
        createPendingFriendSuggestion({
          inviterId: 'inviter-1',
          invitedUserId: 'user-1',
          now: 1_000,
        }),
      ),
    );
    jest.spyOn(Date, 'now').mockReturnValue(1_000 + PENDING_FRIEND_SUGGESTION_TTL_MS);

    await expect(getPendingFriendSuggestion()).resolves.toBeNull();
    await expect(AsyncStorage.getItem(STORAGE_KEY)).resolves.toBeNull();
  });

  it('clears invalid or legacy email-bearing suggestions on read', async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        inviterId: 'inviter-1',
        newUserEmail: 'user@example.com',
      }),
    );

    await expect(getPendingFriendSuggestion()).resolves.toBeNull();
    await expect(AsyncStorage.getItem(STORAGE_KEY)).resolves.toBeNull();
  });

  it('clears consumed suggestions', async () => {
    await savePendingFriendSuggestion({
      inviterId: 'inviter-1',
      invitedUserId: 'user-1',
    });

    await clearPendingFriendSuggestion();

    await expect(AsyncStorage.getItem(STORAGE_KEY)).resolves.toBeNull();
  });
});
