import React from 'react';
import { act, create } from 'react-test-renderer';

import { requestUserPasswordReset } from '../features';
import { useAuthRateLimit } from '../hooks/useAuthRateLimit';
import {
  recordAuthRateLimitFailure,
  recordAuthRateLimitSuccess,
} from '../lib/authRateLimiter';
import { ForgotPasswordScreen } from '../screens/ForgotPasswordScreen';

const mockReact = React;

jest.mock('../features', () => ({
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

const mockedRequestUserPasswordReset =
  requestUserPasswordReset as jest.MockedFunction<typeof requestUserPasswordReset>;
const mockedUseAuthRateLimit = useAuthRateLimit as jest.MockedFunction<typeof useAuthRateLimit>;
const mockedRecordAuthRateLimitFailure = recordAuthRateLimitFailure as jest.MockedFunction<
  typeof recordAuthRateLimitFailure
>;
const mockedRecordAuthRateLimitSuccess = recordAuthRateLimitSuccess as jest.MockedFunction<
  typeof recordAuthRateLimitSuccess
>;

function setInputValue(renderer: any, testID: string, value: string) {
  const input = renderer.root.findByProps({ testID });
  act(() => {
    input.props.onChangeText(value);
  });
}

function pressButtonByLabel(renderer: any, label: string) {
  const button = renderer.root.findAllByType('Button').find((node: any) => node.props.label === label);
  if (!button) {
    throw new Error(`Missing button with label ${label}`);
  }

  return button.props.onPress();
}

describe('ForgotPasswordScreen', () => {
  const navigation = {
    navigate: jest.fn(),
  };

  const route = {
    key: 'ForgotPassword-test',
    name: 'ForgotPassword' as const,
    params: undefined,
  };

  beforeEach(() => {
    navigation.navigate.mockReset();
    mockedRequestUserPasswordReset.mockReset();
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
  });

  it('shows a validation error when email is missing', async () => {
    let renderer: any;
    await act(async () => {
      renderer = create(<ForgotPasswordScreen navigation={navigation as never} route={route} />);
    });

    await act(async () => {
      await pressButtonByLabel(renderer, 'Send Reset Email');
    });

    expect(mockedRequestUserPasswordReset).not.toHaveBeenCalled();
    expect(renderer.root.findByType('PageErrorToast').props.errorMessage).toBe('Email is required.');
  });

  it('requests a reset email with normalized email and navigates to confirmation', async () => {
    mockedRequestUserPasswordReset.mockResolvedValue(undefined);

    let renderer: any;
    await act(async () => {
      renderer = create(<ForgotPasswordScreen navigation={navigation as never} route={route} />);
    });

    setInputValue(renderer, 'forgot-password-email-input', ' USER@example.COM ');

    await act(async () => {
      await pressButtonByLabel(renderer, 'Send Reset Email');
    });

    expect(mockedRequestUserPasswordReset).toHaveBeenCalledWith('user@example.com');
    expect(mockedRecordAuthRateLimitSuccess).toHaveBeenCalledWith(
      'password_reset_request',
      'user@example.com',
    );
    expect(navigation.navigate).toHaveBeenCalledWith('ResetPassword', {
      email: 'user@example.com',
    });
  });

  it('surfaces request failures', async () => {
    mockedRequestUserPasswordReset.mockRejectedValue(new Error('Could not send email.'));

    let renderer: any;
    await act(async () => {
      renderer = create(<ForgotPasswordScreen navigation={navigation as never} route={route} />);
    });

    setInputValue(renderer, 'forgot-password-email-input', 'user@example.com');

    await act(async () => {
      await pressButtonByLabel(renderer, 'Send Reset Email');
    });

    expect(navigation.navigate).not.toHaveBeenCalledWith('ResetPassword', expect.anything());
    expect(mockedRecordAuthRateLimitFailure).toHaveBeenCalledWith(
      'password_reset_request',
      'user@example.com',
    );
    expect(renderer.root.findByType('PageErrorToast').props.errorMessage).toBe('Could not send email.');
  });

  it('blocks reset requests when the limiter is active', async () => {
    mockedUseAuthRateLimit.mockReturnValue({
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
    });

    let renderer: any;
    await act(async () => {
      renderer = create(<ForgotPasswordScreen navigation={navigation as never} route={route} />);
    });

    setInputValue(renderer, 'forgot-password-email-input', 'user@example.com');

    const submitButton = renderer.root.findByType('Button');
    expect(submitButton.props.disabled).toBe(true);
    expect(submitButton.props.label).toBe('Try Again in 30s');

    await act(async () => {
      await submitButton.props.onPress();
    });

    expect(mockedRequestUserPasswordReset).not.toHaveBeenCalled();
    expect(renderer.root.findByType('PageErrorToast').props.errorMessage).toBe(
      'Too many password reset requests. Try again in 30 seconds.',
    );
  });
});
