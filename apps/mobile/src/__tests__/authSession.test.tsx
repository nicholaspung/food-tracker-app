import React from 'react';
import { act, create } from 'react-test-renderer';

import { useAuthSession } from '../providers/auth/authSession';

const mockAuthRefresh = jest.fn();
const mockAuthWithPassword = jest.fn();
const mockClear = jest.fn();
const mockOnChange = jest.fn();
const mockRefreshFileToken = jest.fn();
const mockWaitUntilReady = jest.fn();

let authChangeListener: (() => void) | null = null;
const authStoreState = {
  token: 'token_1',
  record: {
    id: 'user_1',
    email: 'user@example.com',
    verified: true,
    created: '2026-04-18T12:00:00.000Z',
  } as Record<string, unknown> | null,
  isValid: true,
};

jest.mock('../config/env', () => ({ env: { environment: 'local' } }));

jest.mock('../lib/pocketbase', () => ({
  clearPocketBaseFileAccessToken: jest.fn(),
  refreshPocketBaseFileAccessToken: (...args: unknown[]) => mockRefreshFileToken(...args),
  pb: {
    authStore: {
      get token() {
        return authStoreState.token;
      },
      get record() {
        return authStoreState.record;
      },
      get isValid() {
        return authStoreState.isValid;
      },
      clear: (...args: unknown[]) => mockClear(...args),
      onChange: (...args: unknown[]) => mockOnChange(...args),
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

jest.mock('../lib/logger', () => ({ logger: { warn: jest.fn() } }));
jest.mock('../observability', () => ({
  captureObservabilityError: jest.fn(),
  trackObservabilityEvent: jest.fn(),
}));
jest.mock('../providers/authErrorMessages', () => ({
  buildAuthErrorObservabilityProperties: jest.fn(() => ({})),
  formatAuthErrorMessage: jest.fn(() => 'Authentication failed.'),
}));

function SessionConsumer({
  onInvalidRestoredSession,
  prepareForRestore,
}: {
  onInvalidRestoredSession: () => Promise<void>;
  prepareForRestore: () => Promise<void>;
}) {
  const session = useAuthSession({ onInvalidRestoredSession, prepareForRestore });
  return React.createElement('AuthSessionState', session);
}

describe('auth session', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    authStoreState.token = 'token_1';
    authStoreState.record = {
      id: 'user_1',
      email: 'user@example.com',
      verified: true,
      created: '2026-04-18T12:00:00.000Z',
    };
    authStoreState.isValid = true;
    authChangeListener = null;
    mockAuthRefresh.mockReset().mockResolvedValue(undefined);
    mockAuthWithPassword.mockReset();
    mockClear.mockReset().mockImplementation(() => {
      authStoreState.token = '';
      authStoreState.record = null;
      authStoreState.isValid = false;
      authChangeListener?.();
    });
    mockOnChange.mockReset().mockImplementation((listener: () => void) => {
      authChangeListener = listener;
      return () => {
        authChangeListener = null;
      };
    });
    mockRefreshFileToken.mockReset().mockResolvedValue('file-token');
    mockWaitUntilReady.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('restores and signs out a session using only session dependencies', async () => {
    const prepareForRestore = jest.fn().mockResolvedValue(undefined);
    const onInvalidRestoredSession = jest.fn().mockResolvedValue(undefined);
    let renderer: any;

    await act(async () => {
      renderer = create(
        <SessionConsumer
          onInvalidRestoredSession={onInvalidRestoredSession}
          prepareForRestore={prepareForRestore}
        />,
      );
      await Promise.resolve();
    });

    expect(renderer.root.findByType('AuthSessionState').props.status).toBe('authenticated');
    expect(prepareForRestore).toHaveBeenCalledTimes(1);
    expect(onInvalidRestoredSession).not.toHaveBeenCalled();

    act(() => {
      renderer.root.findByType('AuthSessionState').props.signOutSession();
    });

    expect(mockClear).toHaveBeenCalledTimes(1);
    expect(renderer.root.findByType('AuthSessionState').props.status).toBe('unauthenticated');
  });
});
