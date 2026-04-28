import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  clearRememberedLoginEmail,
  loadRememberedLoginEmail,
  saveRememberedLoginEmail,
} from '../lib/rememberedLoginEmail';
import { logger } from '../lib/logger';

jest.mock('../config/env', () => ({
  env: {
    environment: 'test',
  },
}));

jest.mock('../lib/logger', () => ({
  logger: {
    warn: jest.fn(),
  },
}));

const STORAGE_KEY = 'food_tracker_remembered_login_email_v1.test';
const mockedAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;
const mockedLogger = logger as jest.Mocked<typeof logger>;

describe('rememberedLoginEmail', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  it('normalizes saved email addresses', async () => {
    await saveRememberedLoginEmail(' USER@example.COM ');

    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBe('user@example.com');
    expect(await loadRememberedLoginEmail()).toBe('user@example.com');
  });

  it('returns an empty string when no email is saved', async () => {
    await expect(loadRememberedLoginEmail()).resolves.toBe('');
  });

  it('clears saved email addresses', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, 'user@example.com');

    await clearRememberedLoginEmail();

    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('handles storage errors without throwing', async () => {
    mockedAsyncStorage.getItem.mockRejectedValueOnce(new Error('storage unavailable'));

    await expect(loadRememberedLoginEmail()).resolves.toBe('');

    expect(mockedLogger.warn).toHaveBeenCalledWith(
      '[RememberedLoginEmail] Failed to load remembered login email:',
      expect.any(Error),
    );
  });
});
