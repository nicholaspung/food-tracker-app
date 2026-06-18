import React from 'react';
import { act, create } from 'react-test-renderer';

import { useAuth } from '../providers/AuthProvider';
import {
  clearRememberedLoginEmail,
  loadRememberedLoginEmail,
  saveRememberedLoginEmail,
} from '../lib/rememberedLoginEmail';
import { useAuthRateLimit } from '../hooks/useAuthRateLimit';
import {
  recordAuthRateLimitFailure,
  recordAuthRateLimitSuccess,
  recordServerAuthRateLimit,
} from '../lib/authRateLimiter';
import { LoginScreen } from '../screens/LoginScreen';

const mockReact = React;

jest.mock('../observability', () => ({
  trackObservabilityEvent: jest.fn(),
}));

jest.mock('../providers/AuthProvider', () => ({
  AUTH_EMAIL_VERIFICATION_REQUIRED_MESSAGE: 'Please verify your email to continue.',
  useAuth: jest.fn(),
}));

jest.mock('../lib/rememberedLoginEmail', () => ({
  clearRememberedLoginEmail: jest.fn(),
  loadRememberedLoginEmail: jest.fn(),
  saveRememberedLoginEmail: jest.fn(),
}));

jest.mock('../hooks/useAuthRateLimit', () => ({
  useAuthRateLimit: jest.fn(),
}));

jest.mock('../lib/authRateLimiter', () => {
  const actual = jest.requireActual('../lib/authRateLimiter');

  return {
    ...actual,
    isAuthRateLimitError: jest.fn((error: unknown) =>
      error instanceof Error ? /rate|too many|try again later|already requested/i.test(error.message) : false,
    ),
    recordAuthRateLimitFailure: jest.fn(),
    recordAuthRateLimitSuccess: jest.fn(),
    recordServerAuthRateLimit: jest.fn(),
  };
});

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

const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockedClearRememberedLoginEmail = clearRememberedLoginEmail as jest.MockedFunction<
  typeof clearRememberedLoginEmail
>;
const mockedLoadRememberedLoginEmail = loadRememberedLoginEmail as jest.MockedFunction<
  typeof loadRememberedLoginEmail
>;
const mockedSaveRememberedLoginEmail = saveRememberedLoginEmail as jest.MockedFunction<
  typeof saveRememberedLoginEmail
>;
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

function setInputValue(renderer: any, testID: string, value: string) {
  act(() => {
    renderer.root.findByProps({ testID }).props.onChangeText(value);
  });
}

describe('LoginScreen', () => {
  const navigation = {
    navigate: jest.fn(),
  };

  const route = {
    key: 'Login-test',
    name: 'Login' as const,
    params: undefined,
  };

  beforeEach(() => {
    navigation.navigate.mockReset();
    mockedUseAuth.mockReset();
    mockedClearRememberedLoginEmail.mockReset();
    mockedClearRememberedLoginEmail.mockResolvedValue(undefined);
    mockedLoadRememberedLoginEmail.mockReset();
    mockedLoadRememberedLoginEmail.mockResolvedValue('');
    mockedSaveRememberedLoginEmail.mockReset();
    mockedSaveRememberedLoginEmail.mockResolvedValue(undefined);
    mockedUseAuthRateLimit.mockReset();
    mockedUseAuthRateLimit.mockReturnValue({
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
    });
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
    mockedUseAuth.mockReturnValue({
      authError: null,
      isSubmitting: false,
      signInWithPassword: jest.fn(),
    } as unknown as ReturnType<typeof useAuth>);
  });

  it('renders credential fields with saved-password autofill support', async () => {
    let renderer: any;
    await act(async () => {
      renderer = create(<LoginScreen navigation={navigation as never} route={route} />);
    });

    const emailInput = renderer.root.findByProps({ testID: 'login-email-input' });
    const input = renderer.root.findByProps({ testID: 'login-password-input' });

    expect(emailInput.props.autoComplete).toBe('username');
    expect(emailInput.props.textContentType).toBe('username');
    expect(input.props.passwordMode).toBe('current');
    expect(input.props.secureTextEntry).toBeUndefined();
    expect(input.props.autoComplete).toBeUndefined();
    expect(input.props.importantForAutofill).toBeUndefined();
    expect(input.props.textContentType).toBeUndefined();
    expect(input.props.passwordRules).toBeUndefined();
  });

  it('loads a remembered email and pre-fills the email field', async () => {
    mockedLoadRememberedLoginEmail.mockResolvedValue('remembered@example.com');

    let renderer: any;
    await act(async () => {
      renderer = create(<LoginScreen navigation={navigation as never} route={route} />);
    });

    expect(renderer.root.findByProps({ testID: 'login-email-input' }).props.value).toBe(
      'remembered@example.com',
    );
    expect(
      renderer.root.findByProps({ testID: 'login-remember-email-checkbox' }).props.accessibilityState,
    ).toEqual({ checked: true });
  });

  it('prefers the route email over the remembered email', async () => {
    mockedLoadRememberedLoginEmail.mockResolvedValue('remembered@example.com');

    let renderer: any;
    await act(async () => {
      renderer = create(
        <LoginScreen
          navigation={navigation as never}
          route={{ ...route, params: { email: 'ROUTE@example.com' } }}
        />,
      );
    });

    expect(renderer.root.findByProps({ testID: 'login-email-input' }).props.value).toBe(
      'route@example.com',
    );
    expect(renderer.root.findByProps({ testID: 'login-password-input' }).props.value).toBe('');
  });

  it('saves the normalized email after a successful login when remember email is checked', async () => {
    const signInWithPassword = jest.fn().mockResolvedValue(undefined);
    mockedUseAuth.mockReturnValue({
      authError: null,
      isSubmitting: false,
      signInWithPassword,
    } as unknown as ReturnType<typeof useAuth>);

    let renderer: any;
    await act(async () => {
      renderer = create(<LoginScreen navigation={navigation as never} route={route} />);
    });

    setInputValue(renderer, 'login-email-input', ' USER@example.COM ');
    setInputValue(renderer, 'login-password-input', 'password');

    await act(async () => {
      renderer.root.findByProps({ testID: 'login-remember-email-checkbox' }).props.onPress();
    });

    await act(async () => {
      await renderer.root.findByProps({ testID: 'login-submit-button' }).props.onPress();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(signInWithPassword).toHaveBeenCalledWith('user@example.com', 'password');
    expect(mockedRecordAuthRateLimitSuccess).toHaveBeenCalledWith('login', 'user@example.com');
    expect(mockedSaveRememberedLoginEmail).toHaveBeenCalledWith('user@example.com');
    expect(mockedClearRememberedLoginEmail).not.toHaveBeenCalled();
  });

  it('clears the remembered email after a successful login when remember email is unchecked', async () => {
    const signInWithPassword = jest.fn().mockResolvedValue(undefined);
    mockedUseAuth.mockReturnValue({
      authError: null,
      isSubmitting: false,
      signInWithPassword,
    } as unknown as ReturnType<typeof useAuth>);

    let renderer: any;
    await act(async () => {
      renderer = create(<LoginScreen navigation={navigation as never} route={route} />);
    });

    setInputValue(renderer, 'login-email-input', 'user@example.com');
    setInputValue(renderer, 'login-password-input', 'password');

    await act(async () => {
      await renderer.root.findByProps({ testID: 'login-submit-button' }).props.onPress();
      await Promise.resolve();
    });

    expect(mockedSaveRememberedLoginEmail).not.toHaveBeenCalled();
    expect(mockedClearRememberedLoginEmail).toHaveBeenCalledTimes(1);
  });

  it('does not update remembered email storage after a failed login', async () => {
    const signInWithPassword = jest.fn().mockRejectedValue(new Error('Nope'));
    mockedUseAuth.mockReturnValue({
      authError: null,
      isSubmitting: false,
      signInWithPassword,
    } as unknown as ReturnType<typeof useAuth>);

    let renderer: any;
    await act(async () => {
      renderer = create(<LoginScreen navigation={navigation as never} route={route} />);
    });

    setInputValue(renderer, 'login-email-input', 'user@example.com');
    setInputValue(renderer, 'login-password-input', 'password');

    await act(async () => {
      await renderer.root.findByProps({ testID: 'login-submit-button' }).props.onPress();
    });

    expect(mockedSaveRememberedLoginEmail).not.toHaveBeenCalled();
    expect(mockedClearRememberedLoginEmail).not.toHaveBeenCalled();
    expect(mockedRecordAuthRateLimitFailure).toHaveBeenCalledWith('login', 'user@example.com');
  });

  it('toggles the remember email checkbox state', async () => {
    let renderer: any;
    await act(async () => {
      renderer = create(<LoginScreen navigation={navigation as never} route={route} />);
    });

    expect(
      renderer.root.findByProps({ testID: 'login-remember-email-checkbox' }).props.accessibilityState,
    ).toEqual({ checked: false });

    await act(async () => {
      renderer.root.findByProps({ testID: 'login-remember-email-checkbox' }).props.onPress();
    });

    expect(
      renderer.root.findByProps({ testID: 'login-remember-email-checkbox' }).props.accessibilityState,
    ).toEqual({ checked: true });
  });

  it('blocks sign-in when the login limiter is active', async () => {
    const signInWithPassword = jest.fn();
    const refresh = jest.fn().mockResolvedValue({
      allowed: false,
      failedAttempts: 3,
      message: 'Too many attempts.',
      remainingMs: 30_000,
    });
    mockedUseAuth.mockReturnValue({
      authError: null,
      isSubmitting: false,
      signInWithPassword,
    } as unknown as ReturnType<typeof useAuth>);
    mockedUseAuthRateLimit.mockReturnValue({
      decision: {
        allowed: false,
        failedAttempts: 3,
        message: 'Too many attempts.',
        remainingMs: 30_000,
      },
      refresh,
      setDecision: jest.fn(),
    });

    let renderer: any;
    await act(async () => {
      renderer = create(<LoginScreen navigation={navigation as never} route={route} />);
    });

    setInputValue(renderer, 'login-email-input', 'user@example.com');
    setInputValue(renderer, 'login-password-input', 'password');

    const submitButton = renderer.root.findByProps({ testID: 'login-submit-button' });
    expect(submitButton.props.disabled).toBe(true);
    expect(submitButton.props.label).toBe('Try Again in 30s');

    await act(async () => {
      await submitButton.props.onPress();
    });

    expect(signInWithPassword).not.toHaveBeenCalled();
    expect(renderer.root.findByType('PageErrorToast').props.errorMessage).toBe(
      'Too many sign-in attempts. Try again in 30 seconds.',
    );
  });

  it('uses server rate-limit cooldowns after rate-limit login errors', async () => {
    const signInWithPassword = jest.fn().mockRejectedValue(new Error('Too many attempts'));
    mockedUseAuth.mockReturnValue({
      authError: null,
      isSubmitting: false,
      signInWithPassword,
    } as unknown as ReturnType<typeof useAuth>);

    let renderer: any;
    await act(async () => {
      renderer = create(<LoginScreen navigation={navigation as never} route={route} />);
    });

    setInputValue(renderer, 'login-email-input', 'user@example.com');
    setInputValue(renderer, 'login-password-input', 'password');

    await act(async () => {
      await renderer.root.findByProps({ testID: 'login-submit-button' }).props.onPress();
      await Promise.resolve();
    });

    expect(mockedRecordServerAuthRateLimit).toHaveBeenCalledWith('login', 'user@example.com');
    expect(renderer.root.findByType('PageErrorToast').props.errorMessage).toBe(
      'Too many sign-in attempts. Try again in 15 minutes.',
    );
  });
});
