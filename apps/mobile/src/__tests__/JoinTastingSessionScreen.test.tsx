import React from 'react';
import { act, create } from 'react-test-renderer';

import {
  usePendingTastingSessionLifecycleWrites,
  useTastingSessionLifecycleWrites,
} from '../features';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { JoinTastingSessionScreen } from '../screens/JoinTastingSessionScreen';

const mockReact = React;

jest.mock('react-native', () => ({
  ScrollView: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('ScrollView', props, children),
  StyleSheet: {
    create: <T,>(value: T) => value,
  },
  View: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('View', props, children),
}));

jest.mock('../components/shared', () => ({
  FeatureFormScreenScaffold: (
    { children, ...props }: Record<string, unknown> & { children?: React.ReactNode },
  ) => mockReact.createElement('FeatureFormScreenScaffold', props, children),
  PageErrorToast: (props: Record<string, unknown>) => mockReact.createElement('PageErrorToast', props),
}));

jest.mock('../features', () => ({
  usePendingTastingSessionLifecycleWrites: jest.fn(),
  useTastingSessionLifecycleWrites: jest.fn(),
}));

jest.mock('../providers/ConnectivityProvider', () => ({
  useConnectivity: jest.fn(),
}));

jest.mock('../ui', () => ({
  Card: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Card', props, children),
  Input: (props: Record<string, unknown>) => mockReact.createElement('Input', props),
  Text: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Text', props, children),
}));

const mockedUsePendingTastingSessionLifecycleWrites =
  usePendingTastingSessionLifecycleWrites as jest.MockedFunction<
    typeof usePendingTastingSessionLifecycleWrites
  >;
const mockedUseTastingSessionLifecycleWrites = useTastingSessionLifecycleWrites as jest.MockedFunction<
  typeof useTastingSessionLifecycleWrites
>;
const mockedUseConnectivity = useConnectivity as jest.MockedFunction<typeof useConnectivity>;
type TestRenderer = ReturnType<typeof create> & { root: any };

function getTextContent(node: any): string {
  return node.children
    .map((child: any) => (typeof child === 'string' ? child : getTextContent(child)))
    .join('');
}

describe('JoinTastingSessionScreen', () => {
  const navigation = {
    goBack: jest.fn(),
    navigate: jest.fn(),
  };
  const joinSession = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseConnectivity.mockReturnValue({ isOnline: true } as ReturnType<typeof useConnectivity>);
    mockedUsePendingTastingSessionLifecycleWrites.mockReturnValue({
      getCreateState: jest.fn(() => ({ status: 'idle' })),
      getJoinState: jest.fn(() => ({ status: 'idle' })),
      getStatusState: jest.fn(() => ({ status: 'idle' })),
      refreshPendingWrites: jest.fn().mockResolvedValue(undefined),
    });
    mockedUseTastingSessionLifecycleWrites.mockReturnValue({
      joinSession,
    } as unknown as ReturnType<typeof useTastingSessionLifecycleWrites>);
  });

  function renderScreen() {
    let renderer: TestRenderer;
    act(() => {
      renderer = create(
        <JoinTastingSessionScreen
          navigation={navigation as never}
          route={{ key: 'join-route', name: 'JoinTastingSession' } as never}
        />,
      ) as TestRenderer;
    });
    return renderer!;
  }

  async function enterInviteCode(renderer: TestRenderer) {
    await act(async () => {
      renderer.root.findByType('Input').props.onChangeText('abc123');
    });
  }

  it('queues a valid invite code offline and replaces the action with confirmation', async () => {
    mockedUseConnectivity.mockReturnValue({ isOnline: false } as ReturnType<typeof useConnectivity>);
    joinSession.mockResolvedValue({ status: 'queued' });
    let joinPending = false;
    mockedUsePendingTastingSessionLifecycleWrites.mockReturnValue({
      getCreateState: jest.fn(() => ({ status: 'idle' })),
      getJoinState: jest.fn(() => ({ status: joinPending ? 'pending' : 'idle' })),
      getStatusState: jest.fn(() => ({ status: 'idle' })),
      refreshPendingWrites: jest.fn(async () => {
        joinPending = true;
      }),
    });
    const renderer = renderScreen();
    await enterInviteCode(renderer);

    let scaffold = renderer.root.findByType('FeatureFormScreenScaffold');
    expect(scaffold.props.primaryAction.disabled).toBe(false);
    await act(async () => {
      scaffold.props.primaryAction.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });

    scaffold = renderer.root.findByType('FeatureFormScreenScaffold');
    expect(joinSession).toHaveBeenCalledWith({ inviteCode: 'ABC123' });
    expect(scaffold.props.primaryAction).toMatchObject({
      disabled: true,
      label: 'Join Queued',
    });
    expect(renderer.root.findAllByType('Text').map(getTextContent)).toContain(
      'Join request queued. It will run when you reconnect.',
    );
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('keeps online navigation to the joined session', async () => {
    joinSession.mockResolvedValue({
      result: {
        id: 'session-1',
        status: 'lobby',
      },
      status: 'completed',
    });
    const renderer = renderScreen();
    await enterInviteCode(renderer);

    await act(async () => {
      renderer.root.findByType('FeatureFormScreenScaffold').props.primaryAction.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(navigation.navigate).toHaveBeenCalledWith('TastingSessionLobby', {
      sessionId: 'session-1',
    });
  });
});
