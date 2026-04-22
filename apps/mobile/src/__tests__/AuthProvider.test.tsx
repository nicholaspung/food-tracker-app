import React from 'react';
import { act, create } from 'react-test-renderer';

import { AuthProvider, useAuth } from '../providers/AuthProvider';

const mockAuthRefresh = jest.fn();
const mockOnChange = jest.fn();
const mockClear = jest.fn();
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
    isScreenshotReviewMode: false,
  },
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
    }),
  },
}));

jest.mock('../lib/pocketbaseAuthStore', () => ({
  authStore: {
    waitUntilReady: (...args: unknown[]) => mockWaitUntilReady(...args),
  },
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
  const { status, verificationStatus } = useAuth();

  return React.createElement('AuthState', {
    status,
    verificationStatus,
  });
}

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
    mockOnChange.mockReset();
    mockClear.mockReset();
    mockSave.mockReset();
    mockWaitUntilReady.mockReset();
    mockLoadRolePreviewSettings.mockReset();

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
});
