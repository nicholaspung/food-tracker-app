import React from 'react';
import { act, create } from 'react-test-renderer';

import { useAuth } from '../providers/AuthProvider';
import { LoginScreen } from '../screens/LoginScreen';

const mockReact = React;

jest.mock('../observability', () => ({
  trackObservabilityEvent: jest.fn(),
}));

jest.mock('../providers/AuthProvider', () => ({
  AUTH_EMAIL_VERIFICATION_REQUIRED_MESSAGE: 'Please verify your email to continue.',
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
    expect(input.props.secureTextEntry).toBe(true);
    expect(input.props.autoComplete).toBe('current-password');
    expect(input.props.importantForAutofill).not.toBe('no');
    expect(input.props.textContentType).toBe('password');
    expect(input.props.passwordRules).toBeUndefined();
  });
});
