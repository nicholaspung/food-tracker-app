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

  it('renders signup password creation on the password field only', async () => {
    mockedUseAuth.mockReturnValue({
      signInWithPassword: jest.fn(),
    } as unknown as ReturnType<typeof useAuth>);

    let renderer: any;
    await act(async () => {
      renderer = create(<SignUpScreen navigation={navigation as never} route={route} />);
    });

    const emailInput = renderer.root.findByProps({ testID: 'signup-email-input' });

    expect(emailInput.props.autoComplete).toBe('username');
    expect(emailInput.props.textContentType).toBe('username');

    const passwordInput = renderer.root.findByProps({ testID: 'signup-password-input' });
    const confirmPasswordInput = renderer.root.findByProps({ testID: 'signup-confirm-password-input' });

    expect(passwordInput.props.secureTextEntry).toBe(true);
    expect(passwordInput.props.autoComplete).toBe('new-password');
    expect(passwordInput.props.importantForAutofill).not.toBe('no');
    expect(passwordInput.props.textContentType).toBe('newPassword');
    expect(passwordInput.props.passwordRules).toBe('minlength: 8;');

    expect(confirmPasswordInput.props.secureTextEntry).toBe(true);
    expect(confirmPasswordInput.props.autoComplete).toBe('off');
    expect(confirmPasswordInput.props.importantForAutofill).toBe('no');
    expect(confirmPasswordInput.props.textContentType).toBe('none');
    expect(confirmPasswordInput.props.passwordRules).toBeUndefined();
  });

  it('auto signs in immediately after successful signup', async () => {
    const signInWithPassword = jest.fn().mockResolvedValue(undefined);
    mockedUseAuth.mockReturnValue({
      signInWithPassword,
    } as unknown as ReturnType<typeof useAuth>);

    let renderer: any;
    await act(async () => {
      renderer = create(<SignUpScreen navigation={navigation as never} route={route} />);
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

  it('falls back to VerifyEmail when the post-signup sign-in fails', async () => {
    const signInWithPassword = jest.fn().mockRejectedValue(new Error('sign in failed'));
    mockedUseAuth.mockReturnValue({
      signInWithPassword,
    } as unknown as ReturnType<typeof useAuth>);

    let renderer: any;
    await act(async () => {
      renderer = create(<SignUpScreen navigation={navigation as never} route={route} />);
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

  it('keeps create account disabled without an invite code', async () => {
    const signInWithPassword = jest.fn().mockResolvedValue(undefined);
    mockedUseAuth.mockReturnValue({
      signInWithPassword,
    } as unknown as ReturnType<typeof useAuth>);

    let renderer: any;
    await act(async () => {
      renderer = create(<SignUpScreen navigation={navigation as never} route={route} />);
    });

    setInputValue(renderer, 'signup-name-input', 'Test User');
    setInputValue(renderer, 'signup-email-input', 'waitlist@example.com');
    setInputValue(renderer, 'signup-password-input', 'password123');
    setInputValue(renderer, 'signup-confirm-password-input', 'password123');

    expect(renderer.root.findByProps({ testID: 'signup-submit-button' }).props.disabled).toBe(true);
  });

  it('disables waitlist joining when an invite code is present', async () => {
    mockedUseAuth.mockReturnValue({
      signInWithPassword: jest.fn(),
    } as unknown as ReturnType<typeof useAuth>);

    let renderer: any;
    await act(async () => {
      renderer = create(<SignUpScreen navigation={navigation as never} route={route} />);
    });

    setInputValue(renderer, 'signup-email-input', 'user@example.com');
    expect(renderer.root.findByProps({ testID: 'signup-waitlist-submit-button' }).props.disabled).toBe(false);

    setInputValue(renderer, 'signup-invite-code-input', 'invite123');

    expect(renderer.root.findByProps({ testID: 'signup-waitlist-submit-button' }).props.disabled).toBe(true);
  });

  it('submits the waitlist form with consent fields', async () => {
    mockedUseAuth.mockReturnValue({
      signInWithPassword: jest.fn(),
    } as unknown as ReturnType<typeof useAuth>);

    let renderer: any;
    await act(async () => {
      renderer = create(<SignUpScreen navigation={navigation as never} route={route} />);
    });

    setInputValue(renderer, 'signup-email-input', ' USER@example.com ');

    await act(async () => {
      renderer.root.findByProps({ testID: 'signup-product-updates-checkbox' }).props.onPress();
    });

    await act(async () => {
      renderer.root.findByProps({ testID: 'signup-waitlist-submit-button' }).props.onPress();
    });

    expect(mockedSendApiRequest).toHaveBeenCalledWith('/api/waitlist', {
      method: 'POST',
      body: expect.objectContaining({
        email: 'user@example.com',
        marketingConsent: false,
        onboardingEmailsAcknowledged: true,
        productUpdatesConsent: true,
        source: 'mobile_signup',
      }),
    });
    expect(navigation.navigate).toHaveBeenCalledWith('WaitlistConfirmation', {
      email: 'user@example.com',
    });
    expect(mockedRecordAuthRateLimitSuccess).toHaveBeenCalledWith('waitlist', 'user@example.com');
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
      renderer = create(<SignUpScreen navigation={navigation as never} route={route} />);
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
    expect(renderer.root.findByProps({ testID: 'signup-submit-button' }).props.label).toBe('Create Account');

    await act(async () => {
      await waitlistButton.props.onPress();
    });

    expect(mockedSendApiRequest).not.toHaveBeenCalledWith('/api/waitlist', expect.anything());
    expect(renderer.root.findAllByType('PageErrorToast')[1].props.errorMessage).toBe(
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
      renderer = create(<SignUpScreen navigation={navigation as never} route={route} />);
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
