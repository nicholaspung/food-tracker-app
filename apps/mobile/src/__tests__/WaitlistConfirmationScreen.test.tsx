import React from 'react';
import { act, create } from 'react-test-renderer';

import { WaitlistConfirmationScreen } from '../screens/WaitlistConfirmationScreen';

const mockReact = React;

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
  FormScaffold: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('FormScaffold', props, children),
}));

describe('WaitlistConfirmationScreen', () => {
  it('returns to join-waitlist mode from waitlist confirmation', async () => {
    const navigation = {
      navigate: jest.fn(),
    };
    const route = {
      key: 'WaitlistConfirmation-test',
      name: 'WaitlistConfirmation' as const,
      params: {
        email: ' USER@example.com ',
      },
    };

    let renderer: any;
    await act(async () => {
      renderer = create(
        <WaitlistConfirmationScreen navigation={navigation as never} route={route} />,
      );
    });

    act(() => {
      renderer.root.findByProps({ testID: 'waitlist-confirmation-signup-button' }).props.onPress();
    });

    expect(navigation.navigate).toHaveBeenCalledWith('SignUp', {
      email: 'user@example.com',
      mode: 'join_waitlist',
    });
  });
});
