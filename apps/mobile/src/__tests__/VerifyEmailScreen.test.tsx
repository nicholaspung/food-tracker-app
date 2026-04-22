import React from 'react';
import { act, create } from 'react-test-renderer';

import {
  confirmUserEmailVerification,
  requestUserEmailVerification,
} from '../features';
import { trackObservabilityEvent } from '../observability';
import { useAuth } from '../providers/AuthProvider';
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
  FormResultBanner: (props: Record<string, unknown>) => mockReact.createElement('FormResultBanner', props),
  FormScaffold: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('FormScaffold', props, children),
  LoadingOverlay: (props: Record<string, unknown>) => mockReact.createElement('LoadingOverlay', props),
}));

jest.mock('../components/shared/PageErrorToast', () => ({
  PageErrorToast: (props: Record<string, unknown>) => mockReact.createElement('PageErrorToast', props),
}));

const mockedConfirmUserEmailVerification =
  confirmUserEmailVerification as jest.MockedFunction<typeof confirmUserEmailVerification>;
const mockedRequestUserEmailVerification =
  requestUserEmailVerification as jest.MockedFunction<typeof requestUserEmailVerification>;
const mockedTrackObservabilityEvent =
  trackObservabilityEvent as jest.MockedFunction<typeof trackObservabilityEvent>;
const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

function setToken(renderer: any, value: string) {
  const input = renderer.root.findByType('Input');
  act(() => {
    input.props.onChangeText(value);
  });
}

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
    navigation.canGoBack.mockReturnValue(true);
    navigation.goBack.mockReset();
    navigation.navigate.mockReset();
    navigation.reset.mockReset();
    mockedConfirmUserEmailVerification.mockReset();
    mockedRequestUserEmailVerification.mockReset();
    mockedTrackObservabilityEvent.mockReset();
    mockedUseAuth.mockReset();
  });

  it('refreshes the retained session after a successful verification', async () => {
    const refreshAuthSession = jest.fn().mockResolvedValue(undefined);
    mockedUseAuth.mockReturnValue({
      actualUser: {
        email: 'user@example.com',
      },
      refreshAuthSession,
      signInWithPassword: jest.fn(),
      signOut: jest.fn(),
      status: 'verification_required',
    } as unknown as ReturnType<typeof useAuth>);
    mockedConfirmUserEmailVerification.mockResolvedValue(undefined);

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

    setToken(renderer, 'verification-token');
    await act(async () => {
      pressButtonByLabel(renderer, 'Verify and Refresh Access');
    });

    expect(mockedConfirmUserEmailVerification).toHaveBeenCalledWith('verification-token');
    expect(refreshAuthSession).toHaveBeenCalled();
    expect(navigation.reset).toHaveBeenCalledWith({
      index: 0,
      routes: [{ name: 'Home' }],
    });
  });

  it('requests another verification email from the resend action', async () => {
    mockedUseAuth.mockReturnValue({
      actualUser: {
        email: 'user@example.com',
      },
      refreshAuthSession: jest.fn(),
      signInWithPassword: jest.fn(),
      signOut: jest.fn(),
      status: 'authenticated',
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

    await act(async () => {
      pressButtonByLabel(renderer, 'Resend Verification Email');
    });

    expect(mockedRequestUserEmailVerification).toHaveBeenCalledWith('user@example.com');
  });
});
