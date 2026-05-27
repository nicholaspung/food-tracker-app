import React from 'react';
import { act, create } from 'react-test-renderer';

import { useFriendWrites } from '../features';
import { trackObservabilityEvent } from '../observability';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { AddFriendScreen } from '../screens/AddFriendScreen';

const mockReact = React;

jest.mock('react-native', () => ({
  View: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('View', props, children),
}));

jest.mock('../components/shared', () => ({
  FeatureFormScreenScaffold: (
    { children, ...props }: Record<string, unknown> & { children?: React.ReactNode },
  ) => mockReact.createElement('FeatureFormScreenScaffold', props, children),
  PageErrorToast: (props: Record<string, unknown>) => mockReact.createElement('PageErrorToast', props),
}));

jest.mock('../features', () => {
  const friendCodeUtils = jest.requireActual('../features/store/friendCodeUtils');

  return {
    ...friendCodeUtils,
    useFriendWrites: jest.fn(),
  };
});

jest.mock('../observability', () => ({
  trackObservabilityEvent: jest.fn(),
}));

jest.mock('../observability/productAnalytics', () => ({
  trackProductEvent: jest.fn(),
}));

jest.mock('../providers/AuthProvider', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../providers/ConnectivityProvider', () => ({
  useConnectivity: jest.fn(),
}));

jest.mock('../theme', () => ({
  createThemedStyles: (factory: (theme: Record<string, any>) => Record<string, unknown>) => () =>
    factory({
      spacing: {
        md: 16,
        sm: 8,
        xs: 6,
        xxs: 4,
      },
    }),
}));

jest.mock('../ui', () => ({
  Button: (props: Record<string, unknown>) => mockReact.createElement('Button', props),
  Card: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Card', props, children),
  Input: (props: Record<string, unknown>) => mockReact.createElement('Input', props),
  Text: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Text', props, children),
}));

const mockedUseFriendWrites = useFriendWrites as jest.MockedFunction<typeof useFriendWrites>;
const mockedTrackObservabilityEvent = trackObservabilityEvent as jest.MockedFunction<typeof trackObservabilityEvent>;
const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockedUseConnectivity = useConnectivity as jest.MockedFunction<typeof useConnectivity>;

function renderAddFriendScreen() {
  return create(
    <AddFriendScreen
      navigation={{
        canGoBack: jest.fn(() => true),
        goBack: jest.fn(),
        navigate: jest.fn(),
      } as never}
      route={{
        key: 'AddFriend-route',
        name: 'AddFriend',
      } as never}
    />,
  );
}

describe('AddFriendScreen', () => {
  let sendFriendRequest: jest.Mock;

  beforeEach(() => {
    sendFriendRequest = jest.fn(async () => ({
      status: 'completed',
    }));

    mockedUseFriendWrites.mockReturnValue({
      acceptFriendRequest: jest.fn(),
      removeFriend: jest.fn(),
      sendFriendRequest,
    } as never);
    mockedUseAuth.mockReturnValue({
      user: {
        friendCode: 'SELF1234',
        id: 'derived-user-id',
      },
    } as never);
    mockedUseConnectivity.mockReturnValue({
      isOnline: true,
    } as never);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('blocks manual self-code entry using the persisted friend code before falling back to the user id', async () => {
    let renderer: any;

    act(() => {
      renderer = renderAddFriendScreen();
    });

    const input = renderer!.root.findByType('Input');
    act(() => {
      input.props.onChangeText('self-1234');
    });

    const scaffold = renderer!.root.findByType('FeatureFormScreenScaffold');
    await act(async () => {
      scaffold.props.primaryAction.onPress();
    });

    expect(sendFriendRequest).not.toHaveBeenCalled();
    expect(mockedTrackObservabilityEvent).toHaveBeenCalledWith(
      'FRIEND_REQUEST_SEND_VALIDATION_FAILED',
      expect.objectContaining({
        entryMethod: 'manual_code',
        reason: 'self_code',
        source: 'AddFriendScreen',
      }),
    );
    expect(renderer!.root.findByType('PageErrorToast').props.errorMessage).toBe(
      'You cannot add yourself as a friend.',
    );
  });
});
