import React from 'react';
import { act, create } from 'react-test-renderer';
import { useQueryClient } from '@tanstack/react-query';

import { useTastingSessionWrites, type TastingSessionRecord } from '../features';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { TastingSessionLobbyScreen } from '../screens/TastingSessionLobbyScreen';
import { useTastingSessionLifecycleReadState } from '../screens/tastingSessions/useTastingSessionLifecycleReadState';

const mockReact = React;

jest.mock('react-native', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    Share: {
      share: jest.fn(),
    },
    Pressable: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
      React.createElement('Pressable', props, children),
    StyleSheet: {
      create: <T,>(value: T) => value,
    },
    View: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
      React.createElement('View', props, children),
  };
});

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: jest.fn(),
}));

jest.mock('../components/shared', () => ({
  ConfirmDestructiveModal: (props: Record<string, unknown>) => mockReact.createElement('ConfirmDestructiveModal', props),
  EmptyState: (props: Record<string, unknown>) => mockReact.createElement('EmptyState', props),
  ErrorState: (props: Record<string, unknown>) => mockReact.createElement('ErrorState', props),
  FeatureDetailScreenScaffold: (
    { children, ...props }: Record<string, unknown> & { children?: React.ReactNode },
  ) => mockReact.createElement('FeatureDetailScreenScaffold', props, children),
  OptionList: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('OptionList', props, children),
  OptionListRow: (props: Record<string, unknown>) => mockReact.createElement('OptionListRow', props),
  PageErrorToast: (props: Record<string, unknown>) => mockReact.createElement('PageErrorToast', props),
  StatusPill: (props: Record<string, unknown>) => mockReact.createElement('StatusPill', props),
}));

jest.mock('../features', () => ({
  tastingSessionsQueryKeys: {
    detail: (sessionId: string) => ['feature', 'tasting-sessions', sessionId],
    root: ['feature', 'tasting-sessions'],
  },
  useTastingSessionWrites: jest.fn(),
}));

jest.mock('../providers/AuthProvider', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../providers/ConnectivityProvider', () => ({
  useConnectivity: jest.fn(),
}));

jest.mock('../screens/tastingSessions/useTastingSessionLifecycleReadState', () => ({
  useTastingSessionLifecycleReadState: jest.fn(),
}));

jest.mock('../theme', () => ({
  createThemedStyles:
    (factory: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) =>
      factory(
        {
          colors: {
            background: {
              surface: 'surface-background',
            },
            border: {
              subtle: 'subtle-border',
            },
            text: {
              danger: 'danger-text',
            },
          },
          radii: {
            md: 12,
          },
          spacing: {
            sm: 12,
          },
        },
        ...args,
      ),
  useTheme: () => ({
    colors: {
      text: {
        danger: 'danger-text',
      },
    },
  }),
}));

jest.mock('../ui', () => ({
  Button: (props: Record<string, unknown>) => mockReact.createElement('Button', props),
  Card: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Card', props, children),
  ListItem: ({ trailing, titleAccessory, ...props }: Record<string, unknown>) =>
    mockReact.createElement('ListItem', props, titleAccessory as React.ReactNode, trailing as React.ReactNode),
  Modal: ({
    children,
    visible,
    ...props
  }: Record<string, unknown> & { children?: React.ReactNode; visible?: boolean }) =>
    visible ? mockReact.createElement('Modal', props, children) : null,
  Text: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Text', props, children),
}));

const mockedUseTastingSessionWrites = useTastingSessionWrites as jest.MockedFunction<
  typeof useTastingSessionWrites
>;
const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockedUseConnectivity = useConnectivity as jest.MockedFunction<typeof useConnectivity>;
const mockedUseTastingSessionLifecycleReadState = useTastingSessionLifecycleReadState as jest.MockedFunction<
  typeof useTastingSessionLifecycleReadState
>;
const mockedUseQueryClient = useQueryClient as jest.MockedFunction<typeof useQueryClient>;

const reopenInviteWindow = jest.fn();
const deleteSession = jest.fn();
const leaveSession = jest.fn();
const resendInvite = jest.fn();
const invalidateQueries = jest.fn();
const setQueryData = jest.fn();
type TestRenderer = ReturnType<typeof create> & { root: any };

function buildSession(
  joinExpiresAt: string,
  inviteStatus: TastingSessionRecord['invites'][number]['status'] = 'pending',
): TastingSessionRecord {
  return {
    createdAt: '2026-05-20T11:00:00.000Z',
    createdByUserId: 'leader_1',
    id: 'session_1',
    inviteCode: 'ABC123',
    invites: [
      {
        createdAt: '2026-05-20T11:00:00.000Z',
        id: 'invite_1',
        invitedUserId: 'user_2',
        invitedUserName: 'Madi',
        status: inviteStatus,
      },
    ],
    joinExpiresAt,
    joinedCount: 1,
    leaderUserId: 'leader_1',
    maxApprovedItems: 8,
    maxParticipants: 8,
    maxRestaurants: 3,
    name: 'Ramen night',
    participants: [
      {
        id: 'participant_1',
        joinedAt: '2026-05-20T11:00:00.000Z',
        name: 'Pat',
        role: 'leader',
        userId: 'leader_1',
      },
    ],
    restaurants: [],
    status: 'lobby',
    updatedAt: '2026-05-20T11:00:00.000Z',
  };
}

function renderScreen(
  session: TastingSessionRecord | null,
  queryState?: Partial<ReturnType<typeof useTastingSessionLifecycleReadState>['query']>,
) {
  const navigation = {
    navigate: jest.fn(),
    replace: jest.fn(),
  };

  const applyMissingAccessPolicy = jest.fn(() => {
    setQueryData(['feature', 'tasting-sessions'], expect.any(Function));
    setQueryData(['feature', 'tasting-sessions', 'session_1'], null);
    invalidateQueries({ queryKey: ['feature', 'tasting-sessions'] });
  });
  mockedUseTastingSessionLifecycleReadState.mockReturnValue({
    applyMissingAccessPolicy,
    missingAccess: {
      message: 'Your invite was revoked.',
      redirectDestination: {
        name: 'TastingSessions',
        params: {
          errorMessage: 'Your invite was revoked.',
        },
      },
      shouldHandle: !session && !queryState?.isError && !queryState?.isLoading,
    },
    onlineOnly: {
      actionsDisabled: !mockedUseConnectivity().isOnline,
      isOnline: mockedUseConnectivity().isOnline,
      warningMessage: mockedUseConnectivity().isOnline ? null : 'Lobby actions require a connection.',
    },
    query: {
      data: session,
      isError: false,
      isLoading: false,
      ...queryState,
    },
    redirectDestination: session?.status === 'planning'
      ? { name: 'TastingSessionPlanning', params: { sessionId: session.id } }
      : session?.status === 'tasting' || session?.status === 'rating'
        ? { name: 'TastingSessionTasting', params: { sessionId: session.id } }
        : session?.status === 'completed'
          ? { name: 'TastingSessionResults', params: { sessionId: session.id } }
          : null,
    roles: {
      currentParticipant: session?.participants.find((participant) => participant.userId === mockedUseAuth().user?.id) ?? null,
      isInvitee: false,
      isLeader: Boolean(session && mockedUseAuth().user?.id === session.leaderUserId),
      isParticipant: Boolean(
        session?.participants.some((participant) => participant.userId === mockedUseAuth().user?.id),
      ),
    },
    shouldPoll: true,
    step: {
      currentStep: 0,
      label: 'Lobby',
      stage: 'lobby',
    },
  } as unknown as ReturnType<typeof useTastingSessionLifecycleReadState>);

  let renderer: TestRenderer;
  act(() => {
    renderer = create(
      <TastingSessionLobbyScreen
        navigation={navigation as never}
        route={{ params: { sessionId: session?.id ?? 'session_1' } } as never}
      />,
    ) as TestRenderer;
  });

  return { navigation, renderer: renderer! };
}

function getTextContent(node: any): string {
  return node.children
    .map((child: any) => {
      if (typeof child === 'string' || typeof child === 'number') {
        return String(child);
      }
      return getTextContent(child);
    })
    .join('');
}

function findButton(renderer: TestRenderer, label: string) {
  const button = renderer.root.findAllByType('Button').find((node: any) => node.props.label === label);
  if (!button) {
    throw new Error(`Could not find button ${label}`);
  }
  return button;
}

describe('TastingSessionLobbyScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseAuth.mockReturnValue({
      user: {
        id: 'leader_1',
      },
    } as ReturnType<typeof useAuth>);
    mockedUseConnectivity.mockReturnValue({
      isOnline: true,
    } as ReturnType<typeof useConnectivity>);
    mockedUseQueryClient.mockReturnValue({
      invalidateQueries,
      setQueryData,
    } as unknown as ReturnType<typeof useQueryClient>);
    mockedUseTastingSessionWrites.mockReturnValue({
      acceptInvite: jest.fn(),
      createSession: jest.fn(),
      deleteSession,
      dismissInvite: jest.fn(),
      joinSession: jest.fn(),
      leaveSession,
      lockLobby: jest.fn(),
      removeParticipant: jest.fn(),
      reopenInviteWindow,
      resendInvite,
    } as unknown as ReturnType<typeof useTastingSessionWrites>);
    reopenInviteWindow.mockResolvedValue({
      result: buildSession('2099-01-01T00:00:00.000Z'),
      status: 'completed',
    });
    deleteSession.mockResolvedValue({
      result: { success: true },
      status: 'completed',
    });
    leaveSession.mockResolvedValue({
      result: { success: true },
      status: 'completed',
    });
    resendInvite.mockResolvedValue({
      result: buildSession('2099-01-01T00:00:00.000Z'),
      status: 'completed',
    });
  });

  it('shows expired leader controls without exposing the stale invite code', () => {
    const { renderer } = renderScreen(buildSession('2000-01-01T00:00:00.000Z'));

    expect(findButton(renderer, 'Share').props.disabled).toBe(true);
    expect(findButton(renderer, 'Reopen Window')).toBeTruthy();
    expect(renderer.root.findAllByType('StatusPill').some((node: any) => node.props.label === 'Expired')).toBe(true);
    expect(renderer.root.findAllByType('Text').map(getTextContent)).not.toContain('Code: ABC123');
  });

  it('reopens an expired invite window with the selected duration', async () => {
    const { renderer } = renderScreen(buildSession('2000-01-01T00:00:00.000Z'));

    act(() => {
      findButton(renderer, 'Reopen Window').props.onPress();
    });

    const optionTitles = renderer.root.findAllByType('OptionListRow').map((node: any) => node.props.title);
    expect(optionTitles).toEqual(['15 minutes', '30 minutes', '1 hour', '2 hours']);

    const oneHourOption = renderer.root.findAllByType('OptionListRow').find((node: any) => node.props.title === '1 hour');
    await act(async () => {
      oneHourOption?.props.onPress();
      await Promise.resolve();
    });

    expect(reopenInviteWindow).toHaveBeenCalledWith({
      isOnline: true,
      joinDurationMinutes: 60,
      sessionId: 'session_1',
    });
  });

  it('shows pending invite status while the invite window is open', () => {
    const { renderer } = renderScreen(buildSession('2099-01-01T00:00:00.000Z'));

    expect(findButton(renderer, 'Share').props.disabled).toBe(false);
    expect(renderer.root.findAllByType('StatusPill').some((node: any) => node.props.label === 'Pending')).toBe(true);
    expect(renderer.root.findAllByType('Text').map(getTextContent)).toContain('Code: ABC123');
  });

  it('deletes a lobby after destructive confirmation', async () => {
    const { navigation, renderer } = renderScreen(buildSession('2099-01-01T00:00:00.000Z'));

    act(() => {
      renderer.root.findByType('FeatureDetailScreenScaffold').props.rightAccessory.props.onPress();
    });

    const modal = renderer.root
      .findAllByType('ConfirmDestructiveModal')
      .find((node: any) => node.props.title === 'Delete Tasting Session?');
    if (!modal) {
      throw new Error('Expected delete confirmation modal.');
    }
    await act(async () => {
      modal.props.onConfirm();
      await Promise.resolve();
    });

    expect(deleteSession).toHaveBeenCalledWith({
      isOnline: true,
      sessionId: 'session_1',
    });
    expect(navigation.navigate).toHaveBeenCalledWith('TastingSessions');
  });

  it('lets joined participants exit the lobby and returns them to group tastings', async () => {
    mockedUseAuth.mockReturnValue({
      user: {
        id: 'user_2',
      },
    } as ReturnType<typeof useAuth>);

    const { navigation, renderer } = renderScreen({
      ...buildSession('2099-01-01T00:00:00.000Z', 'accepted'),
      joinedCount: 2,
      participants: [
        ...buildSession('2099-01-01T00:00:00.000Z').participants,
        {
          id: 'participant_2',
          joinedAt: '2026-05-20T11:00:00.000Z',
          name: 'Madi',
          role: 'participant',
          userId: 'user_2',
        },
      ],
    });

    act(() => {
      findButton(renderer, 'Exit Session').props.onPress();
    });

    const modal = renderer.root
      .findAllByType('ConfirmDestructiveModal')
      .find((node: any) => node.props.title === 'Exit Tasting Session?');
    if (!modal) {
      throw new Error('Expected exit confirmation modal.');
    }
    await act(async () => {
      modal.props.onConfirm();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(leaveSession).toHaveBeenCalledWith({
      isOnline: true,
      sessionId: 'session_1',
    });
    expect(navigation.navigate).toHaveBeenCalledWith('TastingSessions');
  });

  it('uses a trash icon trigger for leader participant removal', () => {
    const { renderer } = renderScreen({
      ...buildSession('2099-01-01T00:00:00.000Z', 'accepted'),
      joinedCount: 2,
      participants: [
        ...buildSession('2099-01-01T00:00:00.000Z').participants,
        {
          id: 'participant_2',
          joinedAt: '2026-05-20T11:00:00.000Z',
          name: 'Madi',
          role: 'participant',
          userId: 'user_2',
        },
      ],
    });

    const removeTrigger = renderer.root.findByProps({
      testID: 'remove-tasting-participant-participant_2',
    });

    expect(removeTrigger.props.accessibilityLabel).toBe('Remove Madi');
    expect(renderer.root.findAllByType('Button').some((node: any) => node.props.label === 'Remove')).toBe(false);
  });

  it('resends a dismissed invite while the lobby is open', async () => {
    const { renderer } = renderScreen(buildSession('2099-01-01T00:00:00.000Z', 'dismissed'));

    await act(async () => {
      findButton(renderer, 'Resend').props.onPress();
      await Promise.resolve();
    });

    expect(resendInvite).toHaveBeenCalledWith({
      inviteId: 'invite_1',
      isOnline: true,
      sessionId: 'session_1',
    });
  });

  it('resends a revoked invite while the lobby is open', async () => {
    const { renderer } = renderScreen(buildSession('2099-01-01T00:00:00.000Z', 'revoked'));

    await act(async () => {
      findButton(renderer, 'Resend').props.onPress();
      await Promise.resolve();
    });

    expect(resendInvite).toHaveBeenCalledWith({
      inviteId: 'invite_1',
      isOnline: true,
      sessionId: 'session_1',
    });
  });

  it('sends revoked invitees back to the group tasting screen when lobby access disappears', () => {
    const { navigation } = renderScreen(null);

    expect(setQueryData).toHaveBeenCalledWith(['feature', 'tasting-sessions'], expect.any(Function));
    expect(setQueryData).toHaveBeenCalledWith(['feature', 'tasting-sessions', 'session_1'], null);
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['feature', 'tasting-sessions'] });
    expect(navigation.navigate).toHaveBeenCalledWith('TastingSessions', {
      errorMessage: 'Your invite was revoked.',
    });
  });

  it('moves invitees from the lobby to planning when the leader starts planning', () => {
    mockedUseAuth.mockReturnValue({
      user: {
        id: 'user_2',
      },
    } as ReturnType<typeof useAuth>);

    const { navigation } = renderScreen({
      ...buildSession('2099-01-01T00:00:00.000Z', 'accepted'),
      status: 'planning',
    });

    expect(navigation.replace).toHaveBeenCalledWith('TastingSessionPlanning', {
      sessionId: 'session_1',
    });
  });
});
