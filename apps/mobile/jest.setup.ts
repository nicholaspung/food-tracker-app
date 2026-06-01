import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock';
import { timeoutManager } from '@tanstack/react-query';

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
  clearInterval: (intervalId: TimerId | undefined) => {
    clearInterval(intervalId as TimerId | undefined);
  },
  clearTimeout: (timeoutId: TimerId | undefined) => {
    clearTimeout(timeoutId as TimerId | undefined);
  },
  setInterval: (callback: () => void, delay: number | undefined) => {
    const intervalId = setInterval(callback, delay);
    unrefTimer(intervalId);
    return intervalId;
  },
  setTimeout: (callback: () => void, delay: number | undefined) => {
    const timeoutId = setTimeout(callback, delay);
    unrefTimer(timeoutId);
    return timeoutId;
  },
});

jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage);

Object.defineProperty(globalThis, 'fetch', {
  configurable: true,
  value: jest.fn(),
  writable: true,
});

jest.mock('@gorhom/bottom-sheet', () => {
  const react = jest.requireActual<typeof import('react')>('react');

  const BottomSheet = react.forwardRef(function MockBottomSheet(
    { children, ...props }: Record<string, unknown> & { children?: React.ReactNode },
    ref: React.ForwardedRef<{ snapToIndex: jest.Mock }>,
  ) {
    react.useImperativeHandle(ref, () => ({
      snapToIndex: jest.fn(),
    }));

    return react.createElement('BottomSheet', props, children);
  });

  return {
    __esModule: true,
    default: BottomSheet,
    BottomSheetFlatList: (
      { children, ...props }: Record<string, unknown> & { children?: React.ReactNode },
    ) => react.createElement('BottomSheetFlatList', props, children),
    BottomSheetScrollView: (
      { children, ...props }: Record<string, unknown> & { children?: React.ReactNode },
    ) => react.createElement('BottomSheetScrollView', props, children),
    BottomSheetView: (
      { children, ...props }: Record<string, unknown> & { children?: React.ReactNode },
    ) => react.createElement('BottomSheetView', props, children),
  };
});

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
