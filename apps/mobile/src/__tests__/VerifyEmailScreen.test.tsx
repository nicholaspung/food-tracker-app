import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import { act, create } from 'react-test-renderer';

import {
  confirmUserEmailVerification,
  requestUserEmailVerification,
} from '../features';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { useSync } from '../providers/SyncProvider';
import { VerifyEmailScreen } from '../screens/VerifyEmailScreen';

const mockReact = React;

jest.mock('../features', () => ({
  confirmUserEmailVerification: jest.fn(),
  requestUserEmailVerification: jest.fn(),
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

jest.mock('../providers/SyncProvider', () => ({
  useSync: jest.fn(),
}));

jest.mock('../theme', () => ({
  createThemedStyles: () => () => ({}),
}));

jest.mock('../ui', () => ({
  Button: (props: Record<string, unknown>) => mockReact.createElement('Button', props),
  Card: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Card', props, children),
  Screen: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Screen', props, children),
  Text: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Text', props, children),
}));

jest.mock('../components/shared', () => ({
  AuthIntroCard: (props: Record<string, unknown>) => mockReact.createElement('AuthIntroCard', props),
  AuthTopBar: (props: Record<string, unknown>) => mockReact.createElement('AuthTopBar', props),
  ConfirmDestructiveModal: (props: Record<string, unknown>) => mockReact.createElement('ConfirmDestructiveModal', props),
  FormResultBanner: (props: Record<string, unknown>) => mockReact.createElement('FormResultBanner', props),
  FormScaffold: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('FormScaffold', props, children),
  LoadingOverlay: (props: Record<string, unknown>) => mockReact.createElement('LoadingOverlay', props),
}));

jest.mock('../components/shared/PageErrorToast', () => ({
  PageErrorToast: (props: Record<string, unknown>) => mockReact.createElement('PageErrorToast', props),
}));

const mockedRequestUserEmailVerification =
  requestUserEmailVerification as jest.MockedFunction<typeof requestUserEmailVerification>;
const mockedConfirmUserEmailVerification =
  confirmUserEmailVerification as jest.MockedFunction<typeof confirmUserEmailVerification>;
const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockedUseConnectivity = useConnectivity as jest.MockedFunction<typeof useConnectivity>;
const mockedUseSync = useSync as jest.MockedFunction<typeof useSync>;

function pressButtonByLabel(renderer: any, label: string) {
  const button = renderer.root.findAllByType('Button').find((node: any) => node.props.label === label);
  if (!button) {
    throw new Error(`Missing button with label ${label}`);
  }

  act(() => {
    button.props.onPress();
  });
}

function createToken(payload: Record<string, unknown>) {
  const encodedPayload = globalThis
    .btoa(JSON.stringify(payload))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/u, '');
  return `header.${encodedPayload}.signature`;
}

describe('VerifyEmailScreen', () => {
  const navigation = {
    canGoBack: jest.fn(() => true),
    goBack: jest.fn(),
    navigate: jest.fn(),
    reset: jest.fn(),
  };

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-21T12:00:00.000Z'));
    await AsyncStorage.clear();
    navigation.canGoBack.mockReturnValue(true);
    navigation.goBack.mockReset();
    navigation.navigate.mockReset();
    navigation.reset.mockReset();
    mockedRequestUserEmailVerification.mockReset();
    mockedConfirmUserEmailVerification.mockReset();
    mockedUseAuth.mockReset();
    mockedUseConnectivity.mockReset();
    mockedUseSync.mockReset();
    mockedUseConnectivity.mockReturnValue({
      isOnline: true,
    } as unknown as ReturnType<typeof useConnectivity>);
    mockedUseSync.mockReturnValue({
      queueDepth: 0,
    } as unknown as ReturnType<typeof useSync>);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('auto-sends a verification email when the screen opens', async () => {
    mockedUseAuth.mockReturnValue({
      actualUser: {
        email: 'user@example.com',
      },
      refreshAuthSession: jest.fn(),
      signOut: jest.fn(),
      status: 'verification_required',
      verificationStatus: 'grace_expired',
    } as unknown as ReturnType<typeof useAuth>);
    mockedRequestUserEmailVerification.mockResolvedValue(undefined);

    let renderer: any;
    await act(async () => {
      renderer = create(
        <VerifyEmailScreen
          navigation={navigation as never}
          route={{
            key: 'VerifyEmail-test',
            name: 'VerifyEmail',
            params: {
              source: 'expired_entry',
            },
          }}
        />,
      );
    });

    expect(mockedRequestUserEmailVerification).toHaveBeenCalledWith('user@example.com');
    const resendButton = renderer.root.findAllByType('Button').find(
      (node: any) => node.props.label === 'Resend in 60s',
    );
    expect(resendButton).toBeDefined();
  });

  it('redirects home when a retained session becomes verified', async () => {
    mockedUseAuth.mockReturnValue({
      actualUser: {
        email: 'verified-user@example.com',
      },
      refreshAuthSession: jest.fn(),
      signOut: jest.fn(),
      status: 'authenticated',
      verificationStatus: 'grace_period',
    } as unknown as ReturnType<typeof useAuth>);
    mockedRequestUserEmailVerification.mockResolvedValue(undefined);

    let renderer: any;
    await act(async () => {
      renderer = create(
        <VerifyEmailScreen
          navigation={navigation as never}
          route={{
            key: 'VerifyEmail-test',
            name: 'VerifyEmail',
            params: {
              source: 'profile',
            },
          }}
        />,
      );
    });

    mockedUseAuth.mockReturnValue({
      actualUser: {
        email: 'verified-user@example.com',
      },
      refreshAuthSession: jest.fn(),
      signOut: jest.fn(),
      status: 'authenticated',
      verificationStatus: 'verified',
    } as unknown as ReturnType<typeof useAuth>);

    await act(async () => {
      renderer.update(
        <VerifyEmailScreen
          navigation={navigation as never}
          route={{
            key: 'VerifyEmail-test',
            name: 'VerifyEmail',
            params: {
              source: 'profile',
            },
          }}
        />,
      );
    });

    expect(navigation.reset).toHaveBeenCalledWith({
      index: 0,
      routes: [{ name: 'Home' }],
    });
  });

  it('allows another resend after the cooldown expires', async () => {
    mockedUseAuth.mockReturnValue({
      actualUser: {
        email: 'cooldown-user@example.com',
      },
      refreshAuthSession: jest.fn(),
      signOut: jest.fn(),
      status: 'authenticated',
      verificationStatus: 'grace_period',
    } as unknown as ReturnType<typeof useAuth>);
    mockedRequestUserEmailVerification.mockResolvedValue(undefined);

    let renderer: any;
    await act(async () => {
      renderer = create(
        <VerifyEmailScreen
          navigation={navigation as never}
          route={{
            key: 'VerifyEmail-cooldown',
            name: 'VerifyEmail',
            params: {
              source: 'profile',
            },
          }}
        />,
      );
    });

    expect(mockedRequestUserEmailVerification).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(60_000);
      await Promise.resolve();
    });

    await act(async () => {
      pressButtonByLabel(renderer, 'Resend Verification Email');
    });

    expect(mockedRequestUserEmailVerification).toHaveBeenCalledTimes(2);
  });

  it('opens a discard-warning modal before logging out when queued writes exist', async () => {
    const signOut = jest.fn().mockResolvedValue(undefined);
    mockedUseAuth.mockReturnValue({
      actualUser: {
        email: 'queued-user@example.com',
      },
      refreshAuthSession: jest.fn(),
      signOut,
      status: 'verification_required',
      verificationStatus: 'grace_expired',
    } as unknown as ReturnType<typeof useAuth>);
    mockedUseSync.mockReturnValue({
      queueDepth: 2,
    } as unknown as ReturnType<typeof useSync>);
    mockedRequestUserEmailVerification.mockResolvedValue(undefined);

    let renderer: any;
    await act(async () => {
      renderer = create(
        <VerifyEmailScreen
          navigation={navigation as never}
          route={{
            key: 'VerifyEmail-queued-logout',
            name: 'VerifyEmail',
            params: {
              source: 'expired_entry',
            },
          }}
        />,
      );
    });

    await act(async () => {
      pressButtonByLabel(renderer, 'Sign Out');
      await Promise.resolve();
    });

    expect(renderer.root.findByType('ConfirmDestructiveModal').props.visible).toBe(true);
    expect(signOut).not.toHaveBeenCalled();

    await act(async () => {
      renderer.root.findByType('ConfirmDestructiveModal').props.onConfirm();
      await Promise.resolve();
    });

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(navigation.reset).toHaveBeenCalledWith({
      index: 0,
      routes: [{ name: 'Onboarding' }],
    });
  });

  it('logs out immediately without a discard-warning modal when no queued writes exist', async () => {
    const signOut = jest.fn().mockResolvedValue(undefined);
    mockedUseAuth.mockReturnValue({
      actualUser: {
        email: 'clean-user@example.com',
      },
      refreshAuthSession: jest.fn(),
      signOut,
      status: 'verification_required',
      verificationStatus: 'grace_expired',
    } as unknown as ReturnType<typeof useAuth>);
    mockedRequestUserEmailVerification.mockResolvedValue(undefined);

    let renderer: any;
    await act(async () => {
      renderer = create(
        <VerifyEmailScreen
          navigation={navigation as never}
          route={{
            key: 'VerifyEmail-no-queue-logout',
            name: 'VerifyEmail',
            params: {
              source: 'expired_entry',
            },
          }}
        />,
      );
    });

    await act(async () => {
      pressButtonByLabel(renderer, 'Sign Out');
      await Promise.resolve();
    });

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(renderer.root.findByType('ConfirmDestructiveModal').props.visible).toBe(false);
    expect(navigation.reset).toHaveBeenCalledWith({
      index: 0,
      routes: [{ name: 'Onboarding' }],
    });
  });

  it('auto-confirms a verification token from an email link', async () => {
    const refreshAuthSession = jest.fn().mockResolvedValue(undefined);
    mockedUseAuth.mockReturnValue({
      actualUser: {
        email: 'token-user@example.com',
      },
      refreshAuthSession,
      signOut: jest.fn(),
      status: 'authenticated',
      verificationStatus: 'grace_period',
    } as unknown as ReturnType<typeof useAuth>);
    mockedConfirmUserEmailVerification.mockResolvedValue(undefined);
    const token = createToken({ email: 'token-user@example.com', type: 'verification' });

    let renderer: any;
    await act(async () => {
      renderer = create(
        <VerifyEmailScreen
          navigation={navigation as never}
          route={{
            key: 'VerifyEmail-token',
            name: 'VerifyEmail',
            params: {
              source: 'email_link',
              token,
            },
          }}
        />,
      );
      await Promise.resolve();
    });

    expect(mockedConfirmUserEmailVerification).toHaveBeenCalledWith(token);
    expect(refreshAuthSession).toHaveBeenCalledTimes(1);
    expect(renderer.root.findByType('FormResultBanner').props.message).toBe(
      'Your email has been verified. The app will refresh your account status automatically.',
    );
    expect(mockedRequestUserEmailVerification).not.toHaveBeenCalled();
  });

  it('shows token verification success for signed-out users', async () => {
    mockedUseAuth.mockReturnValue({
      actualUser: null,
      refreshAuthSession: jest.fn(),
      signOut: jest.fn(),
      status: 'unauthenticated',
      verificationStatus: 'verified',
    } as unknown as ReturnType<typeof useAuth>);
    mockedConfirmUserEmailVerification.mockResolvedValue(undefined);
    const token = createToken({ email: 'signed-out@example.com', type: 'verification' });

    let renderer: any;
    await act(async () => {
      renderer = create(
        <VerifyEmailScreen
          navigation={navigation as never}
          route={{
            key: 'VerifyEmail-token-signed-out',
            name: 'VerifyEmail',
            params: {
              source: 'email_link',
              token,
            },
          }}
        />,
      );
      await Promise.resolve();
    });

    expect(renderer.root.findByType('FormResultBanner').props.message).toBe(
      'Your email has been verified. You can sign in now.',
    );
  });

  it('shows an expired token error and allows resend when token email is available', async () => {
    mockedUseAuth.mockReturnValue({
      actualUser: null,
      refreshAuthSession: jest.fn(),
      signOut: jest.fn(),
      status: 'unauthenticated',
      verificationStatus: 'grace_expired',
    } as unknown as ReturnType<typeof useAuth>);
    mockedConfirmUserEmailVerification.mockRejectedValue(new Error('expired'));
    mockedRequestUserEmailVerification.mockResolvedValue(undefined);
    const token = createToken({ email: 'expired@example.com', type: 'verification' });

    let renderer: any;
    await act(async () => {
      renderer = create(
        <VerifyEmailScreen
          navigation={navigation as never}
          route={{
            key: 'VerifyEmail-token-expired',
            name: 'VerifyEmail',
            params: {
              source: 'email_link',
              token,
            },
          }}
        />,
      );
      await Promise.resolve();
    });

    expect(renderer.root.findByType('PageErrorToast').props.errorMessage).toBe(
      'This verification link is invalid or expired. Request a new verification email.',
    );

    await act(async () => {
      pressButtonByLabel(renderer, 'Resend Verification Email');
      await Promise.resolve();
    });

    expect(mockedRequestUserEmailVerification).toHaveBeenCalledWith('expired@example.com');
  });

  it('shows retry copy for transient verification confirmation failures', async () => {
    mockedUseAuth.mockReturnValue({
      actualUser: null,
      refreshAuthSession: jest.fn(),
      signOut: jest.fn(),
      status: 'unauthenticated',
      verificationStatus: 'verified',
    } as unknown as ReturnType<typeof useAuth>);
    mockedConfirmUserEmailVerification
      .mockRejectedValueOnce({ status: 0 })
      .mockResolvedValueOnce(undefined);
    const token = createToken({ email: 'transient@example.com', type: 'verification' });

    let renderer: any;
    await act(async () => {
      renderer = create(
        <VerifyEmailScreen
          navigation={navigation as never}
          route={{
            key: 'VerifyEmail-token-transient',
            name: 'VerifyEmail',
            params: {
              source: 'email_link',
              token,
            },
          }}
        />,
      );
      await Promise.resolve();
    });

    expect(renderer.root.findByType('PageErrorToast').props.errorMessage).toBe(
      'We could not reach the verification server. Check your connection and try again.',
    );
    expect(renderer.root.findByType('AuthIntroCard').props.description).toBe(
      'We could not reach the verification server.',
    );

    await act(async () => {
      pressButtonByLabel(renderer, 'Try Again');
      await Promise.resolve();
    });

    expect(mockedConfirmUserEmailVerification).toHaveBeenCalledTimes(2);
    expect(renderer.root.findByType('FormResultBanner').props.message).toBe(
      'Your email has been verified. You can sign in now.',
    );
  });

  it('keeps a verified success state when retained-session refresh fails', async () => {
    const refreshAuthSession = jest.fn().mockRejectedValue(new Error('refresh failed'));
    mockedUseAuth.mockReturnValue({
      actualUser: {
        email: 'refresh-user@example.com',
      },
      refreshAuthSession,
      signOut: jest.fn(),
      status: 'authenticated',
      verificationStatus: 'grace_period',
    } as unknown as ReturnType<typeof useAuth>);
    mockedConfirmUserEmailVerification.mockResolvedValue(undefined);
    const token = createToken({ email: 'refresh-user@example.com', type: 'verification' });

    let renderer: any;
    await act(async () => {
      renderer = create(
        <VerifyEmailScreen
          navigation={navigation as never}
          route={{
            key: 'VerifyEmail-token-refresh-failure',
            name: 'VerifyEmail',
            params: {
              source: 'email_link',
              token,
            },
          }}
        />,
      );
      await Promise.resolve();
    });

    expect(refreshAuthSession).toHaveBeenCalledTimes(1);
    expect(renderer.root.findByType('AuthIntroCard').props.description).toBe(
      'Your email address has been verified.',
    );
    expect(renderer.root.findByType('FormResultBanner').props.message).toBe(
      'Your email has been verified. If the app does not update automatically, close and reopen it.',
    );
    expect(renderer.root.findByType('PageErrorToast').props.errorMessage).toBeNull();
  });

  it('keeps the resend cooldown after remounting', async () => {
    mockedUseAuth.mockReturnValue({
      actualUser: null,
      refreshAuthSession: jest.fn(),
      signOut: jest.fn(),
      status: 'unauthenticated',
      verificationStatus: 'verified',
    } as unknown as ReturnType<typeof useAuth>);
    mockedRequestUserEmailVerification.mockResolvedValue(undefined);
    const route = {
      key: 'VerifyEmail-persisted-cooldown',
      name: 'VerifyEmail' as const,
      params: {
        email: 'persist@example.com',
        source: 'login' as const,
      },
    };

    let renderer: any;
    await act(async () => {
      renderer = create(<VerifyEmailScreen navigation={navigation as never} route={route} />);
    });

    await act(async () => {
      pressButtonByLabel(renderer, 'Resend Verification Email');
      await Promise.resolve();
    });

    expect(mockedRequestUserEmailVerification).toHaveBeenCalledWith('persist@example.com');

    await act(async () => {
      renderer.unmount();
    });

    await act(async () => {
      renderer = create(<VerifyEmailScreen navigation={navigation as never} route={route} />);
      await Promise.resolve();
    });

    expect(renderer.root.findAllByType('Button').some((node: any) => node.props.label === 'Resend in 60s')).toBe(
      true,
    );
  });

  it('persists a server rate-limit cooldown after resend failures', async () => {
    mockedUseAuth.mockReturnValue({
      actualUser: null,
      refreshAuthSession: jest.fn(),
      signOut: jest.fn(),
      status: 'unauthenticated',
      verificationStatus: 'verified',
    } as unknown as ReturnType<typeof useAuth>);
    mockedRequestUserEmailVerification.mockRejectedValue({ status: 429 });

    let renderer: any;
    await act(async () => {
      renderer = create(
        <VerifyEmailScreen
          navigation={navigation as never}
          route={{
            key: 'VerifyEmail-server-rate-limit',
            name: 'VerifyEmail',
            params: {
              email: 'limited@example.com',
              source: 'login',
            },
          }}
        />,
      );
    });

    await act(async () => {
      pressButtonByLabel(renderer, 'Resend Verification Email');
      await Promise.resolve();
    });

    expect(renderer.root.findByType('PageErrorToast').props.errorMessage).toBe(
      'Please wait about a minute before requesting another verification email.',
    );
    expect(renderer.root.findAllByType('Button').some((node: any) => node.props.label === 'Resend in 60s')).toBe(
      true,
    );
  });
});
