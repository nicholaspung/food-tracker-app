import React from 'react';
import { act, create } from 'react-test-renderer';

import { createCollectionRecord, sendApiRequest } from '../features';
import { useAuthRateLimit } from '../hooks/useAuthRateLimit';
import {
  recordAuthRateLimitFailure,
  recordAuthRateLimitSuccess,
  recordServerAuthRateLimit,
} from '../lib/authRateLimiter';
import { savePendingFriendSuggestion } from '../lib/pendingFriendSuggestion';
import { trackObservabilityEvent } from '../observability';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { SignUpScreen } from '../screens/SignUpScreen';

const mockReact = React;

jest.mock('../features', () => ({
  createCollectionRecord: jest.fn(),
  sendApiRequest: jest.fn(),
}));

jest.mock('../lib/pendingFriendSuggestion', () => ({
  savePendingFriendSuggestion: jest.fn(),
}));

jest.mock('../hooks/useAuthRateLimit', () => ({
  useAuthRateLimit: jest.fn(),
}));

jest.mock('../lib/authRateLimiter', () => ({
  isAuthRateLimitError: jest.fn((error: unknown) =>
    error instanceof Error ? /rate|too many|try again later|already requested/i.test(error.message) : false,
  ),
  recordAuthRateLimitFailure: jest.fn(),
  recordAuthRateLimitSuccess: jest.fn(),
  recordServerAuthRateLimit: jest.fn(),
}));

jest.mock('../observability', () => ({
  trackObservabilityEvent: jest.fn(),
}));

jest.mock('../providers/AuthProvider', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../providers/ConnectivityProvider', () => ({
  useConnectivity: jest.fn(),
}));

jest.mock('../theme', () => ({
  createThemedStyles: () => () => ({}),
}));

jest.mock('../ui', () => ({
  Button: (props: Record<string, unknown>) => mockReact.createElement('Button', props),
  Card: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Card', props, children),
  Input: (props: Record<string, unknown>) => mockReact.createElement('Input', props),
  Screen: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Screen', props, children),
  Text: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Text', props, children),
}));

jest.mock('../components/shared', () => ({
  AuthIntroCard: (props: Record<string, unknown>) => mockReact.createElement('AuthIntroCard', props),
  AuthTopBar: (props: Record<string, unknown>) => mockReact.createElement('AuthTopBar', props),
  FormScaffold: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('FormScaffold', props, children),
  LoadingOverlay: (props: Record<string, unknown>) => mockReact.createElement('LoadingOverlay', props),
  SegmentedControl: (props: Record<string, unknown>) => mockReact.createElement('SegmentedControl', props),
}));

jest.mock('../components/shared/PageErrorToast', () => ({
  PageErrorToast: (props: Record<string, unknown>) => mockReact.createElement('PageErrorToast', props),
}));

const mockedCreateCollectionRecord = createCollectionRecord as jest.MockedFunction<typeof createCollectionRecord>;
const mockedSendApiRequest = sendApiRequest as jest.MockedFunction<typeof sendApiRequest>;
const mockedSavePendingFriendSuggestion =
  savePendingFriendSuggestion as jest.MockedFunction<typeof savePendingFriendSuggestion>;
const mockedUseAuthRateLimit = useAuthRateLimit as jest.MockedFunction<typeof useAuthRateLimit>;
const mockedRecordAuthRateLimitFailure = recordAuthRateLimitFailure as jest.MockedFunction<
  typeof recordAuthRateLimitFailure
>;
const mockedRecordAuthRateLimitSuccess = recordAuthRateLimitSuccess as jest.MockedFunction<
  typeof recordAuthRateLimitSuccess
>;
const mockedRecordServerAuthRateLimit = recordServerAuthRateLimit as jest.MockedFunction<
  typeof recordServerAuthRateLimit
>;
const mockedTrackObservabilityEvent =
  trackObservabilityEvent as jest.MockedFunction<typeof trackObservabilityEvent>;
const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockedUseConnectivity = useConnectivity as jest.MockedFunction<typeof useConnectivity>;

function setInputValue(renderer: any, testID: string, value: string) {
  const input = renderer.root.findByProps({ testID });
  act(() => {
    input.props.onChangeText(value);
  });
}

function allowedRateLimit() {
  return {
    decision: {
      allowed: true,
      failedAttempts: 0,
      message: null,
      remainingMs: 0,
    },
    refresh: jest.fn().mockResolvedValue({
      allowed: true,
      failedAttempts: 0,
      message: null,
      remainingMs: 0,
    }),
    setDecision: jest.fn(),
  };
}

describe('SignUpScreen', () => {
  const navigation = {
    navigate: jest.fn(),
  };

  const route = {
    key: 'SignUp-test',
    name: 'SignUp' as const,
    params: undefined,
  };
  const waitlistApprovedRoute = {
    ...route,
    params: {
      mode: 'waitlist_approved' as const,
    },
  };
  const inviteCodeRoute = {
    ...route,
    params: {
      mode: 'invite_code' as const,
    },
  };

  beforeEach(() => {
    navigation.navigate.mockReset();
    mockedCreateCollectionRecord.mockReset();
    mockedSendApiRequest.mockReset();
    mockedSavePendingFriendSuggestion.mockReset();
    mockedUseAuthRateLimit.mockReset();
    mockedTrackObservabilityEvent.mockReset();
    mockedRecordAuthRateLimitFailure.mockReset();
    mockedRecordAuthRateLimitFailure.mockResolvedValue({
      allowed: true,
      failedAttempts: 1,
      message: null,
      remainingMs: 0,
    });
    mockedRecordAuthRateLimitSuccess.mockReset();
    mockedRecordAuthRateLimitSuccess.mockResolvedValue(undefined);
    mockedRecordServerAuthRateLimit.mockReset();
    mockedRecordServerAuthRateLimit.mockResolvedValue({
      allowed: false,
      failedAttempts: 6,
      message: 'Too many attempts.',
      remainingMs: 900_000,
    });
    mockedUseAuth.mockReset();
    mockedUseConnectivity.mockReset();

    mockedSendApiRequest.mockResolvedValue({});
    mockedCreateCollectionRecord.mockResolvedValue({ id: 'user_1' } as never);
    mockedSavePendingFriendSuggestion.mockResolvedValue();
    mockedUseAuthRateLimit.mockImplementation(() => allowedRateLimit());
    mockedUseConnectivity.mockReturnValue({ isOnline: true } as ReturnType<typeof useConnectivity>);
  });

  it('renders the three signup access modes', async () => {
    mockedUseAuth.mockReturnValue({
      signInWithPassword: jest.fn(),
    } as unknown as ReturnType<typeof useAuth>);

    let renderer: any;
    await act(async () => {
      renderer = create(<SignUpScreen navigation={navigation as never} route={route} />);
    });

    const modeControl = renderer.root.findByType('SegmentedControl');

    expect(modeControl.props.value).toBe('join_waitlist');
    expect(modeControl.props.options).toEqual([
      { label: 'Got off waitlist', value: 'waitlist_approved' },
      { label: 'Have invite code', value: 'invite_code' },
      { label: 'Join waitlist', value: 'join_waitlist' },
    ]);
  });

  it('renders signup password creation on the password field only', async () => {
    mockedUseAuth.mockReturnValue({
      signInWithPassword: jest.fn(),
    } as unknown as ReturnType<typeof useAuth>);

    let renderer: any;
    await act(async () => {
      renderer = create(<SignUpScreen navigation={navigation as never} route={waitlistApprovedRoute} />);
    });

    const emailInput = renderer.root.findByProps({ testID: 'signup-email-input' });

    expect(emailInput.props.autoComplete).toBe('username');
    expect(emailInput.props.textContentType).toBe('username');

    const passwordInput = renderer.root.findByProps({ testID: 'signup-password-input' });
    const confirmPasswordInput = renderer.root.findByProps({ testID: 'signup-confirm-password-input' });

    expect(passwordInput.props.passwordMode).toBe('new');
    expect(passwordInput.props.autoComplete).toBeUndefined();
    expect(passwordInput.props.importantForAutofill).toBeUndefined();
    expect(passwordInput.props.textContentType).toBeUndefined();
    expect(passwordInput.props.passwordRules).toBeUndefined();
    expect(passwordInput.props.secureTextEntry).toBeUndefined();

    expect(confirmPasswordInput.props.passwordMode).toBe('confirm');
    expect(confirmPasswordInput.props.autoComplete).toBeUndefined();
    expect(confirmPasswordInput.props.importantForAutofill).toBeUndefined();
    expect(confirmPasswordInput.props.textContentType).toBeUndefined();
    expect(confirmPasswordInput.props.passwordRules).toBeUndefined();
    expect(confirmPasswordInput.props.secureTextEntry).toBeUndefined();
  });

  it('auto signs in immediately after successful signup', async () => {
    const signInWithPassword = jest.fn().mockResolvedValue(undefined);
    mockedUseAuth.mockReturnValue({
      signInWithPassword,
    } as unknown as ReturnType<typeof useAuth>);

    let renderer: any;
    await act(async () => {
      renderer = create(<SignUpScreen navigation={navigation as never} route={inviteCodeRoute} />);
    });

    setInputValue(renderer, 'signup-name-input', 'Test User');
    setInputValue(renderer, 'signup-email-input', 'USER@example.com');
    setInputValue(renderer, 'signup-invite-code-input', 'invite123');
    setInputValue(renderer, 'signup-password-input', 'password123');
    setInputValue(renderer, 'signup-confirm-password-input', 'password123');

    await act(async () => {
      renderer.root.findByProps({ testID: 'signup-submit-button' }).props.onPress();
    });

    expect(mockedCreateCollectionRecord).toHaveBeenCalledWith('users', expect.objectContaining({
      email: 'user@example.com',
      inviteCode: 'invite123',
      marketingConsent: false,
      onboardingEmailsAcknowledged: true,
      productUpdatesConsent: false,
    }));
    expect(mockedRecordAuthRateLimitSuccess).toHaveBeenCalledWith('signup', 'user@example.com');
    expect(signInWithPassword).toHaveBeenCalledWith('user@example.com', 'password123');
    expect(navigation.navigate).not.toHaveBeenCalledWith(
      'VerifyEmail',
      expect.anything(),
    );
  });

  it('saves pending friend suggestions without persisting the invited email', async () => {
    const signInWithPassword = jest.fn().mockResolvedValue(undefined);
    mockedUseAuth.mockReturnValue({
      signInWithPassword,
    } as unknown as ReturnType<typeof useAuth>);
    mockedSendApiRequest.mockResolvedValueOnce({
      hasInviter: true,
      inviter: {
        displayName: 'Taylor',
        id: 'inviter-1',
      },
    });

    let renderer: any;
    await act(async () => {
      renderer = create(<SignUpScreen navigation={navigation as never} route={inviteCodeRoute} />);
    });

    setInputValue(renderer, 'signup-name-input', 'Test User');
    setInputValue(renderer, 'signup-email-input', 'USER@example.com');
    setInputValue(renderer, 'signup-invite-code-input', 'invite123');
    setInputValue(renderer, 'signup-password-input', 'password123');
    setInputValue(renderer, 'signup-confirm-password-input', 'password123');

    await act(async () => {
      renderer.root.findByProps({ testID: 'signup-submit-button' }).props.onPress();
    });

    expect(mockedSavePendingFriendSuggestion).toHaveBeenCalledWith({
      inviterId: 'inviter-1',
      inviterDisplayName: 'Taylor',
      invitedUserId: 'user_1',
    });
    expect(mockedSavePendingFriendSuggestion).not.toHaveBeenCalledWith(
      expect.objectContaining({
        newUserEmail: expect.any(String),
      }),
    );
  });

  it('falls back to VerifyEmail when the post-signup sign-in fails', async () => {
    const signInWithPassword = jest.fn().mockRejectedValue(new Error('sign in failed'));
    mockedUseAuth.mockReturnValue({
      signInWithPassword,
    } as unknown as ReturnType<typeof useAuth>);

    let renderer: any;
    await act(async () => {
      renderer = create(<SignUpScreen navigation={navigation as never} route={inviteCodeRoute} />);
    });

    setInputValue(renderer, 'signup-name-input', 'Test User');
    setInputValue(renderer, 'signup-email-input', 'user@example.com');
    setInputValue(renderer, 'signup-invite-code-input', 'invite123');
    setInputValue(renderer, 'signup-password-input', 'password123');
    setInputValue(renderer, 'signup-confirm-password-input', 'password123');

    await act(async () => {
      renderer.root.findByProps({ testID: 'signup-submit-button' }).props.onPress();
    });

    expect(signInWithPassword).toHaveBeenCalledWith('user@example.com', 'password123');
    expect(navigation.navigate).toHaveBeenCalledWith('VerifyEmail', {
      email: 'user@example.com',
      password: 'password123',
      source: 'sign_up',
    });
  });

  it('keeps invite-code account creation disabled without an invite code', async () => {
    const signInWithPassword = jest.fn().mockResolvedValue(undefined);
    mockedUseAuth.mockReturnValue({
      signInWithPassword,
    } as unknown as ReturnType<typeof useAuth>);

    let renderer: any;
    await act(async () => {
      renderer = create(<SignUpScreen navigation={navigation as never} route={inviteCodeRoute} />);
    });

    setInputValue(renderer, 'signup-name-input', 'Test User');
    setInputValue(renderer, 'signup-email-input', 'waitlist@example.com');
    setInputValue(renderer, 'signup-password-input', 'password123');
    setInputValue(renderer, 'signup-confirm-password-input', 'password123');

    expect(renderer.root.findByProps({ testID: 'signup-submit-button' }).props.disabled).toBe(true);
  });

  it('prefills copied invite-code links and hides waitlist joining', async () => {
    mockedUseAuth.mockReturnValue({
      signInWithPassword: jest.fn(),
    } as unknown as ReturnType<typeof useAuth>);

    let renderer: any;
    await act(async () => {
      renderer = create(
        <SignUpScreen
          navigation={navigation as never}
          route={{ ...route, params: { code: 'INVITE123' } }}
        />,
      );
    });

    expect(renderer.root.findByType('SegmentedControl').props.value).toBe('invite_code');
    expect(renderer.root.findByProps({ testID: 'signup-invite-code-input' }).props.value).toBe('INVITE123');
    expect(renderer.root.findAllByProps({ testID: 'signup-waitlist-submit-button' })).toHaveLength(0);
  });

  it('prefills inviteCode route params', async () => {
    mockedUseAuth.mockReturnValue({
      signInWithPassword: jest.fn(),
    } as unknown as ReturnType<typeof useAuth>);

    let renderer: any;
    await act(async () => {
      renderer = create(
        <SignUpScreen
          navigation={navigation as never}
          route={{ ...route, params: { inviteCode: 'INVITE456' } }}
        />,
      );
    });

    expect(renderer.root.findByType('SegmentedControl').props.value).toBe('invite_code');
    expect(renderer.root.findByProps({ testID: 'signup-invite-code-input' }).props.value).toBe('INVITE456');
  });

  it('uses email-only links for got-off-waitlist mode and hides invite code', async () => {
    mockedUseAuth.mockReturnValue({
      signInWithPassword: jest.fn(),
    } as unknown as ReturnType<typeof useAuth>);

    let renderer: any;
    await act(async () => {
      renderer = create(
        <SignUpScreen
          navigation={navigation as never}
          route={{ ...route, params: { email: 'APPROVED@example.com' } }}
        />,
      );
    });

    expect(renderer.root.findByType('SegmentedControl').props.value).toBe('waitlist_approved');
    expect(renderer.root.findByProps({ testID: 'signup-email-input' }).props.value).toBe('approved@example.com');
    expect(renderer.root.findAllByProps({ testID: 'signup-invite-code-input' })).toHaveLength(0);
  });

  it('creates a got-off-waitlist account without an invite code', async () => {
    const signInWithPassword = jest.fn().mockResolvedValue(undefined);
    mockedUseAuth.mockReturnValue({
      signInWithPassword,
    } as unknown as ReturnType<typeof useAuth>);

    let renderer: any;
    await act(async () => {
      renderer = create(<SignUpScreen navigation={navigation as never} route={waitlistApprovedRoute} />);
    });

    setInputValue(renderer, 'signup-name-input', 'Test User');
    setInputValue(renderer, 'signup-email-input', 'approved@example.com');
    setInputValue(renderer, 'signup-password-input', 'password123');
    setInputValue(renderer, 'signup-confirm-password-input', 'password123');

    const submitButton = renderer.root.findByProps({ testID: 'signup-submit-button' });
    expect(submitButton.props.disabled).toBe(false);

    await act(async () => {
      submitButton.props.onPress();
    });

    expect(mockedCreateCollectionRecord).toHaveBeenCalledWith(
      'users',
      expect.not.objectContaining({
        inviteCode: expect.anything(),
      }),
    );
    expect(mockedCreateCollectionRecord).toHaveBeenCalledWith('users', expect.objectContaining({
      email: 'approved@example.com',
      marketingConsent: false,
      onboardingEmailsAcknowledged: true,
      productUpdatesConsent: false,
    }));
  });

  it('submits the lightweight waitlist form without consent fields', async () => {
    mockedUseAuth.mockReturnValue({
      signInWithPassword: jest.fn(),
    } as unknown as ReturnType<typeof useAuth>);

    let renderer: any;
    await act(async () => {
      renderer = create(<SignUpScreen navigation={navigation as never} route={route} />);
    });

    setInputValue(renderer, 'signup-email-input', ' USER@example.com ');

    await act(async () => {
      renderer.root.findByProps({ testID: 'signup-waitlist-submit-button' }).props.onPress();
    });

    expect(mockedSendApiRequest).toHaveBeenCalledWith('/api/waitlist', {
      method: 'POST',
      body: {
        email: 'user@example.com',
        source: 'mobile_signup',
      },
    });
    expect(navigation.navigate).toHaveBeenCalledWith('WaitlistConfirmation', {
      email: 'user@example.com',
    });
    expect(mockedRecordAuthRateLimitSuccess).toHaveBeenCalledWith('waitlist', 'user@example.com');
    expect(renderer.root.findAllByProps({ testID: 'signup-name-input' })).toHaveLength(0);
    expect(renderer.root.findAllByProps({ testID: 'signup-password-input' })).toHaveLength(0);
    expect(renderer.root.findAllByProps({ testID: 'signup-invite-code-input' })).toHaveLength(0);
  });

  it('blocks create account when the signup limiter is active', async () => {
    mockedUseAuth.mockReturnValue({
      signInWithPassword: jest.fn(),
    } as unknown as ReturnType<typeof useAuth>);
    mockedUseAuthRateLimit.mockImplementation((flow) =>
      flow === 'signup'
        ? {
            decision: {
              allowed: false,
              failedAttempts: 3,
              message: 'Too many attempts.',
              remainingMs: 30_000,
            },
            refresh: jest.fn().mockResolvedValue({
              allowed: false,
              failedAttempts: 3,
              message: 'Too many attempts.',
              remainingMs: 30_000,
            }),
            setDecision: jest.fn(),
          }
        : allowedRateLimit(),
    );

    let renderer: any;
    await act(async () => {
      renderer = create(<SignUpScreen navigation={navigation as never} route={inviteCodeRoute} />);
    });

    setInputValue(renderer, 'signup-name-input', 'Test User');
    setInputValue(renderer, 'signup-email-input', 'user@example.com');
    setInputValue(renderer, 'signup-invite-code-input', 'invite123');
    setInputValue(renderer, 'signup-password-input', 'password123');
    setInputValue(renderer, 'signup-confirm-password-input', 'password123');

    const submitButton = renderer.root.findByProps({ testID: 'signup-submit-button' });
    expect(submitButton.props.disabled).toBe(true);
    expect(submitButton.props.label).toBe('Try Again in 30s');

    await act(async () => {
      await submitButton.props.onPress();
    });

    expect(mockedCreateCollectionRecord).not.toHaveBeenCalled();
    expect(renderer.root.findAllByType('PageErrorToast')[0].props.errorMessage).toBe(
      'Too many attempts to create account. Try again in 30 seconds.',
    );
  });

  it('blocks waitlist independently from signup', async () => {
    mockedUseAuth.mockReturnValue({
      signInWithPassword: jest.fn(),
    } as unknown as ReturnType<typeof useAuth>);
    mockedUseAuthRateLimit.mockImplementation((flow) =>
      flow === 'waitlist'
        ? {
            decision: {
              allowed: false,
              failedAttempts: 3,
              message: 'Too many attempts.',
              remainingMs: 30_000,
            },
            refresh: jest.fn().mockResolvedValue({
              allowed: false,
              failedAttempts: 3,
              message: 'Too many attempts.',
              remainingMs: 30_000,
            }),
            setDecision: jest.fn(),
          }
        : allowedRateLimit(),
    );

    let renderer: any;
    await act(async () => {
      renderer = create(<SignUpScreen navigation={navigation as never} route={route} />);
    });

    setInputValue(renderer, 'signup-email-input', 'user@example.com');

    const waitlistButton = renderer.root.findByProps({ testID: 'signup-waitlist-submit-button' });
    expect(waitlistButton.props.disabled).toBe(true);
    expect(waitlistButton.props.label).toBe('Try Again in 30s');
    expect(renderer.root.findAllByProps({ testID: 'signup-submit-button' })).toHaveLength(0);

    await act(async () => {
      await waitlistButton.props.onPress();
    });

    expect(mockedSendApiRequest).not.toHaveBeenCalledWith('/api/waitlist', expect.anything());
    expect(renderer.root.findAllByType('PageErrorToast')[0].props.errorMessage).toBe(
      'Too many attempts to join waitlist. Try again in 30 seconds.',
    );
  });

  it('records server rate-limit state for too many signup attempts', async () => {
    mockedCreateCollectionRecord.mockRejectedValue(new Error('Too many failed attempts. Try again later.'));
    mockedUseAuth.mockReturnValue({
      signInWithPassword: jest.fn(),
    } as unknown as ReturnType<typeof useAuth>);

    let renderer: any;
    await act(async () => {
      renderer = create(<SignUpScreen navigation={navigation as never} route={inviteCodeRoute} />);
    });

    setInputValue(renderer, 'signup-name-input', 'Test User');
    setInputValue(renderer, 'signup-email-input', 'user@example.com');
    setInputValue(renderer, 'signup-invite-code-input', 'invite123');
    setInputValue(renderer, 'signup-password-input', 'password123');
    setInputValue(renderer, 'signup-confirm-password-input', 'password123');

    await act(async () => {
      await renderer.root.findByProps({ testID: 'signup-submit-button' }).props.onPress();
    });

    expect(mockedRecordServerAuthRateLimit).toHaveBeenCalledWith('signup', 'user@example.com');
    expect(renderer.root.findAllByType('PageErrorToast')[0].props.errorMessage).toBe(
      'Too many attempts to create account. Try again in 900 seconds.',
    );
  });
});
