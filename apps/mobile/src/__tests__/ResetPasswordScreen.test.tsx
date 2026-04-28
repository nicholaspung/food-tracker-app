import React from 'react';
import { act, create } from 'react-test-renderer';

import { confirmUserPasswordReset, requestUserPasswordReset } from '../features';
import { useAuthRateLimit } from '../hooks/useAuthRateLimit';
import {
  recordAuthRateLimitFailure,
  recordAuthRateLimitSuccess,
} from '../lib/authRateLimiter';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { ResetPasswordScreen } from '../screens/ResetPasswordScreen';

const mockReact = React;

jest.mock('../features', () => ({
  confirmUserPasswordReset: jest.fn(),
  requestUserPasswordReset: jest.fn(),
}));

jest.mock('../hooks/useAuthRateLimit', () => ({
  useAuthRateLimit: jest.fn(),
}));

jest.mock('../lib/authRateLimiter', () => ({
  isAuthRateLimitError: jest.fn(() => false),
  recordAuthRateLimitFailure: jest.fn(),
  recordAuthRateLimitSuccess: jest.fn(),
  recordServerAuthRateLimit: jest.fn(),
}));

jest.mock('../observability', () => ({
  trackObservabilityEvent: jest.fn(),
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
  FormResultBanner: (props: Record<string, unknown>) => mockReact.createElement('FormResultBanner', props),
  FormScaffold: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('FormScaffold', props, children),
  LoadingOverlay: (props: Record<string, unknown>) => mockReact.createElement('LoadingOverlay', props),
}));

jest.mock('../components/shared/PageErrorToast', () => ({
  PageErrorToast: (props: Record<string, unknown>) => mockReact.createElement('PageErrorToast', props),
}));

const mockedRequestUserPasswordReset =
  requestUserPasswordReset as jest.MockedFunction<typeof requestUserPasswordReset>;
const mockedConfirmUserPasswordReset =
  confirmUserPasswordReset as jest.MockedFunction<typeof confirmUserPasswordReset>;
const mockedUseConnectivity = useConnectivity as jest.MockedFunction<typeof useConnectivity>;
const mockedUseAuthRateLimit = useAuthRateLimit as jest.MockedFunction<typeof useAuthRateLimit>;
const mockedRecordAuthRateLimitFailure = recordAuthRateLimitFailure as jest.MockedFunction<
  typeof recordAuthRateLimitFailure
>;
const mockedRecordAuthRateLimitSuccess = recordAuthRateLimitSuccess as jest.MockedFunction<
  typeof recordAuthRateLimitSuccess
>;

function pressButtonByLabel(renderer: any, label: string) {
  const button = renderer.root.findAllByType('Button').find((node: any) => node.props.label === label);
  if (!button) {
    throw new Error(`Missing button with label ${label}`);
  }

  return button.props.onPress();
}

function createRoute(params?: { email?: string; token?: string }) {
  return {
    key: 'ResetPassword-test',
    name: 'ResetPassword' as const,
    params,
  };
}

function setInputValue(renderer: any, testID: string, value: string) {
  const input = renderer.root.findByProps({ testID });
  act(() => {
    input.props.onChangeText(value);
  });
}

function getTextContent(children: unknown): string {
  if (Array.isArray(children)) {
    return children.map(getTextContent).join('');
  }

  return typeof children === 'string' ? children : '';
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

describe('ResetPasswordScreen', () => {
  const navigation = {
    canGoBack: jest.fn(() => true),
    goBack: jest.fn(),
    navigate: jest.fn(),
    reset: jest.fn(),
  };

  beforeEach(() => {
    navigation.canGoBack.mockReturnValue(true);
    navigation.goBack.mockReset();
    navigation.navigate.mockReset();
    navigation.reset.mockReset();
    mockedRequestUserPasswordReset.mockReset();
    mockedConfirmUserPasswordReset.mockReset();
    mockedUseAuthRateLimit.mockReset();
    mockedUseAuthRateLimit.mockImplementation(() => allowedRateLimit());
    mockedRecordAuthRateLimitFailure.mockReset();
    mockedRecordAuthRateLimitFailure.mockResolvedValue({
      allowed: true,
      failedAttempts: 1,
      message: null,
      remainingMs: 0,
    });
    mockedRecordAuthRateLimitSuccess.mockReset();
    mockedRecordAuthRateLimitSuccess.mockResolvedValue(undefined);
    mockedUseConnectivity.mockReturnValue({
      isOnline: true,
    } as unknown as ReturnType<typeof useConnectivity>);
  });

  it('renders email confirmation content without token or password inputs', async () => {
    let renderer: any;
    await act(async () => {
      renderer = create(
        <ResetPasswordScreen navigation={navigation as never} route={createRoute({ email: 'USER@example.com' })} />,
      );
    });

    expect(renderer.root.findByType('AuthIntroCard').props.title).toBe('Check Your Email');
    expect(
      renderer.root
        .findAllByType('Text')
        .some((node: any) => getTextContent(node.props.children) === 'Reset link sent to: user@example.com'),
    ).toBe(true);
    expect(renderer.root.findAllByType('Input')).toHaveLength(0);
  });

  it('returns to sign in with the reset email prefilled', async () => {
    let renderer: any;
    await act(async () => {
      renderer = create(
        <ResetPasswordScreen navigation={navigation as never} route={createRoute({ email: 'user@example.com' })} />,
      );
    });

    act(() => {
      pressButtonByLabel(renderer, 'Back to Sign In');
    });

    expect(navigation.reset).toHaveBeenCalledWith({
      index: 0,
      routes: [
        {
          name: 'Login',
          params: {
            email: 'user@example.com',
          },
        },
      ],
    });
  });

  it('resends the reset email and shows a success banner', async () => {
    mockedRequestUserPasswordReset.mockResolvedValue(undefined);

    let renderer: any;
    await act(async () => {
      renderer = create(
        <ResetPasswordScreen navigation={navigation as never} route={createRoute({ email: 'user@example.com' })} />,
      );
    });

    await act(async () => {
      await pressButtonByLabel(renderer, 'Resend Email');
    });

    expect(mockedRequestUserPasswordReset).toHaveBeenCalledWith('user@example.com');
    expect(mockedRecordAuthRateLimitSuccess).toHaveBeenCalledWith(
      'password_reset_resend',
      'user@example.com',
    );
    expect(renderer.root.findByType('FormResultBanner').props.message).toBe('Reset email sent again.');
  });

  it('surfaces resend failures', async () => {
    mockedRequestUserPasswordReset.mockRejectedValue(new Error('Could not send.'));

    let renderer: any;
    await act(async () => {
      renderer = create(
        <ResetPasswordScreen navigation={navigation as never} route={createRoute({ email: 'user@example.com' })} />,
      );
    });

    await act(async () => {
      await pressButtonByLabel(renderer, 'Resend Email');
    });

    expect(mockedRecordAuthRateLimitFailure).toHaveBeenCalledWith(
      'password_reset_resend',
      'user@example.com',
    );
    expect(renderer.root.findByType('PageErrorToast').props.errorMessage).toBe('Could not send.');
  });

  it('disables resend when no email is available', async () => {
    let renderer: any;
    await act(async () => {
      renderer = create(<ResetPasswordScreen navigation={navigation as never} route={createRoute()} />);
    });

    const resendButton = renderer.root.findAllByType('Button').find((node: any) => node.props.label === 'Resend Email');
    expect(resendButton?.props.disabled).toBe(true);
  });

  it('renders a password reset form when opened from an email token', async () => {
    let renderer: any;
    await act(async () => {
      renderer = create(
        <ResetPasswordScreen
          navigation={navigation as never}
          route={createRoute({ email: 'USER@example.com', token: 'reset-token' })}
        />,
      );
    });

    expect(renderer.root.findByType('AuthIntroCard').props.title).toBe('Reset Password');
    expect(renderer.root.findByProps({ testID: 'reset-password-new-password-input' })).toBeDefined();
    expect(renderer.root.findByProps({ testID: 'reset-password-confirm-password-input' })).toBeDefined();
  });

  it('validates token reset password length and mismatch before submitting', async () => {
    let renderer: any;
    await act(async () => {
      renderer = create(
        <ResetPasswordScreen navigation={navigation as never} route={createRoute({ token: 'reset-token' })} />,
      );
    });

    setInputValue(renderer, 'reset-password-new-password-input', 'short');
    setInputValue(renderer, 'reset-password-confirm-password-input', 'short');

    await act(async () => {
      await pressButtonByLabel(renderer, 'Reset Password');
    });

    expect(renderer.root.findByType('PageErrorToast').props.errorMessage).toBe(
      'Password must be at least 8 characters.',
    );
    expect(mockedConfirmUserPasswordReset).not.toHaveBeenCalled();

    setInputValue(renderer, 'reset-password-new-password-input', 'password123');
    setInputValue(renderer, 'reset-password-confirm-password-input', 'password456');

    await act(async () => {
      await pressButtonByLabel(renderer, 'Reset Password');
    });

    expect(renderer.root.findByType('PageErrorToast').props.errorMessage).toBe('Passwords do not match.');
    expect(mockedConfirmUserPasswordReset).not.toHaveBeenCalled();
  });

  it('confirms the reset token and returns to sign in after success', async () => {
    mockedConfirmUserPasswordReset.mockResolvedValue(undefined);

    let renderer: any;
    await act(async () => {
      renderer = create(
        <ResetPasswordScreen
          navigation={navigation as never}
          route={createRoute({ email: 'user@example.com', token: 'reset-token' })}
        />,
      );
    });

    setInputValue(renderer, 'reset-password-new-password-input', 'password123');
    setInputValue(renderer, 'reset-password-confirm-password-input', 'password123');

    await act(async () => {
      await pressButtonByLabel(renderer, 'Reset Password');
    });

    expect(mockedConfirmUserPasswordReset).toHaveBeenCalledWith('reset-token', 'password123', 'password123');
    expect(mockedRecordAuthRateLimitSuccess).toHaveBeenCalledWith(
      'password_reset_confirm',
      'user@example.com',
    );
    expect(renderer.root.findByType('FormResultBanner').props.message).toBe(
      'Your password has been reset. Sign in with your new password.',
    );

    act(() => {
      pressButtonByLabel(renderer, 'Back to Sign In');
    });

    expect(navigation.reset).toHaveBeenCalledWith({
      index: 0,
      routes: [
        {
          name: 'Login',
          params: {
            email: 'user@example.com',
          },
        },
      ],
    });
  });

  it('shows a friendly error when token reset fails', async () => {
    mockedConfirmUserPasswordReset.mockRejectedValue(new Error('invalid token'));

    let renderer: any;
    await act(async () => {
      renderer = create(
        <ResetPasswordScreen navigation={navigation as never} route={createRoute({ token: 'reset-token' })} />,
      );
    });

    setInputValue(renderer, 'reset-password-new-password-input', 'password123');
    setInputValue(renderer, 'reset-password-confirm-password-input', 'password123');

    await act(async () => {
      await pressButtonByLabel(renderer, 'Reset Password');
    });

    expect(mockedRecordAuthRateLimitFailure).toHaveBeenCalledWith(
      'password_reset_confirm',
      '',
    );
    expect(renderer.root.findByType('PageErrorToast').props.errorMessage).toBe(
      'This reset link is invalid or expired. Request a new reset email.',
    );
  });

  it('blocks reset resends and token confirmations independently', async () => {
    mockedUseAuthRateLimit.mockImplementation((flow) =>
      flow === 'password_reset_resend' || flow === 'password_reset_confirm'
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

    let resendRenderer: any;
    await act(async () => {
      resendRenderer = create(
        <ResetPasswordScreen navigation={navigation as never} route={createRoute({ email: 'user@example.com' })} />,
      );
    });

    const resendButton = resendRenderer.root
      .findAllByType('Button')
      .find((node: any) => node.props.label === 'Try Again in 30s');
    expect(resendButton?.props.disabled).toBe(true);

    await act(async () => {
      await resendButton?.props.onPress();
    });

    expect(mockedRequestUserPasswordReset).not.toHaveBeenCalled();
    expect(resendRenderer.root.findByType('PageErrorToast').props.errorMessage).toBe(
      'Too many reset email requests. Try again in 30 seconds.',
    );

    let confirmRenderer: any;
    await act(async () => {
      confirmRenderer = create(
        <ResetPasswordScreen
          navigation={navigation as never}
          route={createRoute({ email: 'user@example.com', token: 'reset-token' })}
        />,
      );
    });

    setInputValue(confirmRenderer, 'reset-password-new-password-input', 'password123');
    setInputValue(confirmRenderer, 'reset-password-confirm-password-input', 'password123');

    const confirmButton = confirmRenderer.root
      .findAllByType('Button')
      .find((node: any) => node.props.label === 'Try Again in 30s');
    expect(confirmButton?.props.disabled).toBe(true);

    await act(async () => {
      await confirmButton?.props.onPress();
    });

    expect(mockedConfirmUserPasswordReset).not.toHaveBeenCalled();
    expect(confirmRenderer.root.findByType('PageErrorToast').props.errorMessage).toBe(
      'Too many password reset attempts. Try again in 30 seconds.',
    );
  });
});
