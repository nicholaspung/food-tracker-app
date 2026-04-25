import React from 'react';
import { act, create } from 'react-test-renderer';

import { requestUserPasswordReset } from '../features';
import { ResetPasswordScreen } from '../screens/ResetPasswordScreen';

const mockReact = React;

jest.mock('../features', () => ({
  requestUserPasswordReset: jest.fn(),
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

function pressButtonByLabel(renderer: any, label: string) {
  const button = renderer.root.findAllByType('Button').find((node: any) => node.props.label === label);
  if (!button) {
    throw new Error(`Missing button with label ${label}`);
  }

  return button.props.onPress();
}

function createRoute(email?: string) {
  return {
    key: 'ResetPassword-test',
    name: 'ResetPassword' as const,
    params: email ? { email } : undefined,
  };
}

function getTextContent(children: unknown): string {
  if (Array.isArray(children)) {
    return children.map(getTextContent).join('');
  }

  return typeof children === 'string' ? children : '';
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
  });

  it('renders email confirmation content without token or password inputs', async () => {
    let renderer: any;
    await act(async () => {
      renderer = create(
        <ResetPasswordScreen navigation={navigation as never} route={createRoute('USER@example.com')} />,
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
        <ResetPasswordScreen navigation={navigation as never} route={createRoute('user@example.com')} />,
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
        <ResetPasswordScreen navigation={navigation as never} route={createRoute('user@example.com')} />,
      );
    });

    await act(async () => {
      await pressButtonByLabel(renderer, 'Resend Email');
    });

    expect(mockedRequestUserPasswordReset).toHaveBeenCalledWith('user@example.com');
    expect(renderer.root.findByType('FormResultBanner').props.message).toBe('Reset email sent again.');
  });

  it('surfaces resend failures', async () => {
    mockedRequestUserPasswordReset.mockRejectedValue(new Error('Could not send.'));

    let renderer: any;
    await act(async () => {
      renderer = create(
        <ResetPasswordScreen navigation={navigation as never} route={createRoute('user@example.com')} />,
      );
    });

    await act(async () => {
      await pressButtonByLabel(renderer, 'Resend Email');
    });

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
});
