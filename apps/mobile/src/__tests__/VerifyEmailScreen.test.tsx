import React from 'react';
import { act, create } from 'react-test-renderer';

import {
  requestUserEmailVerification,
} from '../features';
import { useAuth } from '../providers/AuthProvider';
import { VerifyEmailScreen } from '../screens/VerifyEmailScreen';

const mockReact = React;

jest.mock('../features', () => ({
  requestUserEmailVerification: jest.fn(),
}));

jest.mock('../observability', () => ({
  trackObservabilityEvent: jest.fn(),
}));

jest.mock('../providers/AuthProvider', () => ({
  useAuth: jest.fn(),
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
const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

function pressButtonByLabel(renderer: any, label: string) {
  const button = renderer.root.findAllByType('Button').find((node: any) => node.props.label === label);
  if (!button) {
    throw new Error(`Missing button with label ${label}`);
  }

  act(() => {
    button.props.onPress();
  });
}

describe('VerifyEmailScreen', () => {
  const navigation = {
    canGoBack: jest.fn(() => true),
    goBack: jest.fn(),
    navigate: jest.fn(),
    reset: jest.fn(),
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-21T12:00:00.000Z'));
    navigation.canGoBack.mockReturnValue(true);
    navigation.goBack.mockReset();
    navigation.navigate.mockReset();
    navigation.reset.mockReset();
    mockedRequestUserEmailVerification.mockReset();
    mockedUseAuth.mockReset();
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
    });

    await act(async () => {
      pressButtonByLabel(renderer, 'Resend Verification Email');
    });

    expect(mockedRequestUserEmailVerification).toHaveBeenCalledTimes(2);
  });
});
