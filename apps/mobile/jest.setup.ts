import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock';
import { timeoutManager } from '@tanstack/query-core';

type TimerId = ReturnType<typeof setTimeout>;

function unrefTimer(timerId: TimerId): void {
  const maybeTimer = timerId as unknown;
  if (typeof maybeTimer === 'object' && maybeTimer !== null) {
    const unref = (maybeTimer as { unref?: unknown }).unref;
    if (typeof unref === 'function') {
      unref.call(maybeTimer);
    }
  }
}

timeoutManager.setTimeoutProvider({
  clearInterval: (intervalId) => {
    clearInterval(intervalId as TimerId | undefined);
  },
  clearTimeout: (timeoutId) => {
    clearTimeout(timeoutId as TimerId | undefined);
  },
  setInterval: (callback, delay) => {
    const intervalId = setInterval(callback, delay);
    unrefTimer(intervalId);
    return intervalId;
  },
  setTimeout: (callback, delay) => {
    const timeoutId = setTimeout(callback, delay);
    unrefTimer(timeoutId);
    return timeoutId;
  },
});

jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage);

jest.mock('./src/features/store/useQueuedFeatureWrites', () => ({
  useQueuedFeatureWrites: () => ({
    queuedWrites: [],
    refreshQueuedWrites: jest.fn(),
  }),
}));

const mockSecureStoreState = new Map<string, string>();

jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
  deleteItemAsync: jest.fn(async (key: string) => {
    mockSecureStoreState.delete(key);
  }),
  getItemAsync: jest.fn(async (key: string) => mockSecureStoreState.get(key) ?? null),
  isAvailableAsync: jest.fn(async () => true),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockSecureStoreState.set(key, value);
  }),
}));
