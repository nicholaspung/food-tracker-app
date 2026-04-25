import React from 'react';
import { act, create } from 'react-test-renderer';
import { useQueryClient } from '@tanstack/react-query';

import { AuthProvider, useAuth } from '../providers/AuthProvider';
import { useSync } from '../providers/SyncProvider';

const mockAuthRefresh = jest.fn();
const mockAuthWithPassword = jest.fn();
const mockOnChange = jest.fn();
const mockClear = jest.fn();
const mockClearPersistedQueryCache = jest.fn();
const mockDiscardQueuedMutations = jest.fn();
const mockQueryClientClear = jest.fn();
const mockSave = jest.fn();
const mockWaitUntilReady = jest.fn();
const mockLoadRolePreviewSettings = jest.fn();

let authChangeListener: (() => void) | null = null;
const mockAuthStoreState = {
  token: 'token_1',
  record: {
    id: 'user_1',
    email: 'user@example.com',
    verified: false,
    created: '2026-04-18T12:00:01.000Z',
  } as Record<string, unknown> | null,
  isValid: true,
};

jest.mock('../config/env', () => ({
  env: {
    environment: 'local',
  },
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: jest.fn(),
}));

jest.mock('react-native', () => ({
  AppState: {
    currentState: 'active',
    addEventListener: jest.fn(() => ({
      remove: jest.fn(),
    })),
  },
}));

jest.mock('../lib/pocketbase', () => ({
  pb: {
    authStore: {
      get token() {
        return mockAuthStoreState.token;
      },
      get record() {
        return mockAuthStoreState.record;
      },
      get isValid() {
        return mockAuthStoreState.isValid;
      },
      clear: (...args: unknown[]) => mockClear(...args),
      onChange: (...args: unknown[]) => mockOnChange(...args),
      save: (...args: unknown[]) => mockSave(...args),
    },
    collection: () => ({
      authRefresh: mockAuthRefresh,
      authWithPassword: mockAuthWithPassword,
    }),
  },
}));

jest.mock('../lib/pocketbaseAuthStore', () => ({
  authStore: {
    waitUntilReady: (...args: unknown[]) => mockWaitUntilReady(...args),
  },
}));

jest.mock('../providers/queryPersistence', () => ({
  clearPersistedQueryCache: (...args: unknown[]) => mockClearPersistedQueryCache(...args),
}));

jest.mock('../providers/SyncProvider', () => ({
  useSync: jest.fn(),
}));

jest.mock('../lib/logger', () => ({
  logger: {
    warn: jest.fn(),
  },
}));

jest.mock('../lib/rolePreview', () => ({
  clearPersistedRolePreviewSettings: jest.fn().mockResolvedValue(undefined),
  DEFAULT_ROLE_PREVIEW_SETTINGS: {
    viewAsNonAdmin: false,
    viewAsNonSubscriber: false,
  },
  getEffectiveAuthUser: (user: unknown) => user,
  loadRolePreviewSettings: (...args: unknown[]) => mockLoadRolePreviewSettings(...args),
  persistRolePreviewSettings: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../observability', () => ({
  captureObservabilityError: jest.fn(),
  resetObservabilityIdentity: jest.fn(),
  setObservabilityContext: jest.fn(),
  trackObservabilityEvent: jest.fn(),
}));

jest.mock('../providers/authErrorMessages', () => ({
  buildAuthErrorObservabilityProperties: jest.fn(() => ({})),
  formatAuthErrorMessage: jest.fn(() => 'Authentication failed.'),
}));

function AuthConsumer() {
  const { signInWithPassword, signOut, status, verificationStatus } = useAuth();

  return React.createElement('AuthState', {
    signInWithPassword,
    signOut,
    status,
    verificationStatus,
  });
}

const mockedUseQueryClient = useQueryClient as jest.MockedFunction<typeof useQueryClient>;
const mockedUseSync = useSync as jest.MockedFunction<typeof useSync>;

describe('AuthProvider', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-21T12:00:00.000Z'));

    mockAuthStoreState.token = 'token_1';
    mockAuthStoreState.record = {
      id: 'user_1',
      email: 'user@example.com',
      verified: false,
      created: '2026-04-18T12:00:01.000Z',
    };
    mockAuthStoreState.isValid = true;

    authChangeListener = null;
    mockAuthRefresh.mockReset();
    mockAuthWithPassword.mockReset();
    mockOnChange.mockReset();
    mockClear.mockReset();
    mockClearPersistedQueryCache.mockReset();
    mockDiscardQueuedMutations.mockReset();
    mockQueryClientClear.mockReset();
    mockSave.mockReset();
    mockWaitUntilReady.mockReset();
    mockLoadRolePreviewSettings.mockReset();

    mockedUseQueryClient.mockReturnValue({
      clear: mockQueryClientClear,
    } as unknown as ReturnType<typeof useQueryClient>);
    mockedUseSync.mockReturnValue({
      discardQueuedMutations: mockDiscardQueuedMutations,
    } as unknown as ReturnType<typeof useSync>);
    mockAuthRefresh.mockResolvedValue(undefined);
    mockOnChange.mockImplementation((listener: () => void) => {
      authChangeListener = listener;
      return () => {
        authChangeListener = null;
      };
    });
    mockClear.mockImplementation(() => {
      mockAuthStoreState.token = '';
      mockAuthStoreState.record = null;
      mockAuthStoreState.isValid = false;
      authChangeListener?.();
    });
    mockSave.mockImplementation((token: string, record: unknown) => {
      mockAuthStoreState.token = token;
      mockAuthStoreState.record = record as typeof mockAuthStoreState.record;
      mockAuthStoreState.isValid = true;
      authChangeListener?.();
    });
    mockAuthWithPassword.mockImplementation(async (email: string) => {
      const record = {
        id: 'user_2',
        email,
        verified: true,
        created: '2026-04-21T12:00:00.000Z',
      };

      mockSave('token_2', record);

      return {
        record,
      };
    });
    mockClearPersistedQueryCache.mockResolvedValue(undefined);
    mockDiscardQueuedMutations.mockResolvedValue(0);
    mockWaitUntilReady.mockResolvedValue(undefined);
    mockLoadRolePreviewSettings.mockResolvedValue({
      viewAsNonAdmin: false,
      viewAsNonSubscriber: false,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('switches from authenticated grace period access to verification_required when the deadline passes', async () => {
    let renderer: any;
    await act(async () => {
      renderer = create(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>,
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    const initialState = renderer.root.findByType('AuthState').props;
    expect(initialState.status).toBe('authenticated');
    expect(initialState.verificationStatus).toBe('grace_period');

    act(() => {
      jest.advanceTimersByTime(1_500);
    });

    const expiredState = renderer.root.findByType('AuthState').props;
    expect(expiredState.status).toBe('verification_required');
    expect(expiredState.verificationStatus).toBe('grace_expired');
  });

  it('polls auth refresh while verification is still pending', async () => {
    mockAuthStoreState.record = {
      id: 'user_1',
      email: 'user@example.com',
      verified: false,
      created: '2026-04-20T12:00:00.000Z',
    };

    let renderer: any;
    await act(async () => {
      renderer = create(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>,
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    mockAuthRefresh.mockClear();

    await act(async () => {
      jest.advanceTimersByTime(15_000);
      await Promise.resolve();
    });

    expect(renderer.root.findByType('AuthState').props.verificationStatus).toBe('grace_period');
    expect(mockAuthRefresh).toHaveBeenCalledTimes(1);
  });

  it('clears auth, query cache, persisted cache, and queued mutations on explicit sign-out', async () => {
    let renderer: any;
    await act(async () => {
      renderer = create(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>,
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await renderer.root.findByType('AuthState').props.signOut();
    });

    expect(mockQueryClientClear).toHaveBeenCalledTimes(1);
    expect(mockClearPersistedQueryCache).toHaveBeenCalledTimes(1);
    expect(mockDiscardQueuedMutations).toHaveBeenCalledWith('logout');
    expect(mockClear).toHaveBeenCalledTimes(1);
    expect(mockClear.mock.invocationCallOrder[0]).toBeLessThan(
      mockDiscardQueuedMutations.mock.invocationCallOrder[0],
    );
    expect(renderer.root.findByType('AuthState').props.status).toBe('unauthenticated');
  });

  it('clears authenticated local state when the active auth session disappears', async () => {
    let renderer: any;
    await act(async () => {
      renderer = create(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>,
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    mockQueryClientClear.mockClear();
    mockClearPersistedQueryCache.mockClear();
    mockDiscardQueuedMutations.mockClear();

    await act(async () => {
      mockAuthStoreState.token = '';
      mockAuthStoreState.record = null;
      mockAuthStoreState.isValid = false;
      authChangeListener?.();
      await Promise.resolve();
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockQueryClientClear).toHaveBeenCalledTimes(1);
    expect(mockClearPersistedQueryCache).toHaveBeenCalledTimes(1);
    expect(mockDiscardQueuedMutations).toHaveBeenCalledWith('auth_change');
    expect(renderer.root.findByType('AuthState').props.status).toBe('unauthenticated');
  });

  it('clears authenticated local state when bootstrap auth refresh falls back to unauthenticated', async () => {
    mockAuthRefresh.mockRejectedValue(new Error('Unauthorized'));

    let renderer: any;
    await act(async () => {
      renderer = create(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>,
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockQueryClientClear).toHaveBeenCalledTimes(1);
    expect(mockClearPersistedQueryCache).toHaveBeenCalledTimes(1);
    expect(mockDiscardQueuedMutations).toHaveBeenCalledWith('auth_change');
    expect(mockClear).toHaveBeenCalledTimes(1);
    expect(renderer.root.findByType('AuthState').props.status).toBe('unauthenticated');
  });

  it('clears authenticated local state when signing in after bootstrapping unauthenticated', async () => {
    mockAuthStoreState.token = '';
    mockAuthStoreState.record = null;
    mockAuthStoreState.isValid = false;

    let renderer: any;
    await act(async () => {
      renderer = create(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>,
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    mockQueryClientClear.mockClear();
    mockClearPersistedQueryCache.mockClear();
    mockDiscardQueuedMutations.mockClear();

    await act(async () => {
      await renderer.root.findByType('AuthState').props.signInWithPassword('next@example.com', 'password');
      await Promise.resolve();
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockQueryClientClear).toHaveBeenCalledTimes(1);
    expect(mockClearPersistedQueryCache).toHaveBeenCalledTimes(1);
    expect(mockDiscardQueuedMutations).toHaveBeenCalledWith('auth_change');
    expect(renderer.root.findByType('AuthState').props.status).toBe('authenticated');
  });
});
