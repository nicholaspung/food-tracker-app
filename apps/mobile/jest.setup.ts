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

const mockLocalStorageState = new Map<string, string>();

const mockLocalStorage = {
  clear: jest.fn(() => {
    mockLocalStorageState.clear();
  }),
  getItem: jest.fn((key: string) => mockLocalStorageState.get(key) ?? null),
  key: jest.fn((index: number) => Array.from(mockLocalStorageState.keys())[index] ?? null),
  removeItem: jest.fn((key: string) => {
    mockLocalStorageState.delete(key);
  }),
  setItem: jest.fn((key: string, value: string) => {
    mockLocalStorageState.set(key, String(value));
  }),
  get length() {
    return mockLocalStorageState.size;
  },
};

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: mockLocalStorage,
  writable: true,
});

jest.mock('expo-sqlite/localStorage/install', () => ({}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: {
        eas: {
          projectId: 'project_1',
        },
      },
      version: 'test',
    },
    nativeAppVersion: 'test',
    nativeBuildVersion: 'test',
  },
}));

jest.mock('expo-device', () => ({
  isDevice: true,
}));

jest.mock('expo-media-library', () => ({
  Asset: jest.fn().mockImplementation(() => ({
    getCreationTime: jest.fn(async () => null),
  })),
}));

jest.mock('./src/ui/AppIcon', () => {
  const react = jest.requireActual<typeof import('react')>('react');

  return {
    Ionicons: (props: Record<string, unknown>) => react.createElement('Ionicons', props),
  };
});

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

jest.mock('expo-crypto', () => ({
  getRandomBytesAsync: jest.fn(async (length: number) => new Uint8Array(length).fill(1)),
}));
