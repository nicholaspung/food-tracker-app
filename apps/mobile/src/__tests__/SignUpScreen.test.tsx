import React from 'react';
import { act, create } from 'react-test-renderer';

import { createCollectionRecord, sendApiRequest } from '../features';
import { savePendingFriendSuggestion } from '../lib/pendingFriendSuggestion';
import { trackObservabilityEvent } from '../observability';
import { useAuth } from '../providers/AuthProvider';
import { SignUpScreen } from '../screens/SignUpScreen';

const mockReact = React;

jest.mock('../features', () => ({
  createCollectionRecord: jest.fn(),
  sendApiRequest: jest.fn(),
}));

jest.mock('../lib/pendingFriendSuggestion', () => ({
  savePendingFriendSuggestion: jest.fn(),
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
const mockedTrackObservabilityEvent =
  trackObservabilityEvent as jest.MockedFunction<typeof trackObservabilityEvent>;
const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

function setInputValue(renderer: any, testID: string, value: string) {
  const input = renderer.root.findByProps({ testID });
  act(() => {
    input.props.onChangeText(value);
  });
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
    mockedTrackObservabilityEvent.mockReset();
    mockedUseAuth.mockReset();

    mockedSendApiRequest.mockResolvedValue({});
    mockedCreateCollectionRecord.mockResolvedValue({ id: 'user_1' } as never);
    mockedSavePendingFriendSuggestion.mockResolvedValue();
  });

  it('renders signup credential fields with generated-password autofill support', async () => {
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

    for (const testID of ['signup-password-input', 'signup-confirm-password-input']) {
      const input = renderer.root.findByProps({ testID });

      expect(input.props.secureTextEntry).toBe(true);
      expect(input.props.autoComplete).toBe('new-password');
      expect(input.props.importantForAutofill).not.toBe('no');
      expect(input.props.textContentType).toBe('newPassword');
      expect(input.props.passwordRules).toBe('minlength: 8;');
    }
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

    expect(mockedCreateCollectionRecord).toHaveBeenCalled();
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
});
