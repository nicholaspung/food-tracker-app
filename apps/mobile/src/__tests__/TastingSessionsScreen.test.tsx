import React from 'react';
import { act, create } from 'react-test-renderer';
import { useQuery } from '@tanstack/react-query';

import { useTastingSessionWrites, type TastingSessionRecord } from '../features';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { TastingSessionsScreen } from '../screens/TastingSessionsScreen';

const mockReact = React;

jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn(),
}));

jest.mock('react-native', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    Pressable: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
      React.createElement('Pressable', props, children),
    StyleSheet: {
      create: <T,>(value: T) => value,
    },
    View: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
      React.createElement('View', props, children),
  };
});

jest.mock('../components/shared', () => ({
  BackHeaderScreenScaffold: (
    { children, ...props }: Record<string, unknown> & { children?: React.ReactNode },
  ) => mockReact.createElement('BackHeaderScreenScaffold', props, children),
  EmptyState: (props: Record<string, unknown>) => mockReact.createElement('EmptyState', props),
  ErrorState: (props: Record<string, unknown>) => mockReact.createElement('ErrorState', props),
  HeaderAccessoryButton: (props: Record<string, unknown>) => mockReact.createElement('HeaderAccessoryButton', props),
  LoadingState: (props: Record<string, unknown>) => mockReact.createElement('LoadingState', props),
  PageErrorToast: (props: Record<string, unknown>) => mockReact.createElement('PageErrorToast', props),
  OptionList: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('OptionList', props, children),
  OptionListRow: ({ rightAccessory, titleAccessory, ...props }: Record<string, unknown>) =>
    mockReact.createElement('OptionListRow', props, titleAccessory as React.ReactNode, rightAccessory as React.ReactNode),
  StatusPill: (props: Record<string, unknown>) => mockReact.createElement('StatusPill', props),
}));

jest.mock('../features', () => ({
  listTastingSessions: jest.fn(),
  tastingSessionsQueryKeys: {
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

jest.mock('../theme', () => ({
  createThemedStyles:
    (factory: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) =>
      factory(
        {
          colors: {
            background: {
              muted: 'muted-background',
              surface: 'surface-background',
            },
            border: {
              default: 'default-border',
            },
            status: {
              infoBg: 'info-background',
              infoBorder: 'info-border',
            },
            text: {
              brand: 'brand-text',
              info: 'info-text',
            },
          },
          radii: {
            lg: 16,
            pill: 999,
          },
          spacing: {
            xxs: 4,
            xs: 8,
            sm: 12,
            md: 16,
          },
        },
        ...args,
      ),
  useTheme: () => ({
    colors: {
      text: {
        brand: 'brand-text',
        info: 'info-text',
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
  Text: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Text', props, children),
}));

const mockedUseQuery = useQuery as jest.MockedFunction<typeof useQuery>;
const mockedUseTastingSessionWrites = useTastingSessionWrites as jest.MockedFunction<
  typeof useTastingSessionWrites
>;
const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockedUseConnectivity = useConnectivity as jest.MockedFunction<typeof useConnectivity>;

const acceptInvite = jest.fn();
const dismissInvite = jest.fn();
type TestRenderer = ReturnType<typeof create> & { root: any };

function buildSession(joinExpiresAt: string): TastingSessionRecord {
  return {
    createdAt: '2026-05-20T11:00:00.000Z',
    createdByUserId: 'leader_1',
    id: `session_${joinExpiresAt}`,
    inviteCode: 'ABC123',
    invites: [
      {
        createdAt: '2026-05-20T11:00:00.000Z',
        id: 'invite_1',
        invitedUserId: 'user_1',
        invitedUserName: 'Pat',
        status: 'pending',
      },
    ],
    joinExpiresAt,
    joinedCount: 1,
    leaderUserId: 'leader_1',
    maxApprovedItems: 8,
    maxParticipants: 8,
    maxRestaurants: 3,
    name: 'Ramen night',
    participants: [],
    restaurants: [],
    status: 'lobby',
    updatedAt: '2026-05-20T11:00:00.000Z',
  };
}

function buildInviteOnlySessionWithoutInvite(): TastingSessionRecord {
  return {
    ...buildSession('2000-01-01T00:00:00.000Z'),
    id: 'session_without_invite',
    invites: [],
  };
}

function buildRevokedSessionWithStaleParticipant(): TastingSessionRecord {
  return {
    ...buildSession('2099-01-01T00:00:00.000Z'),
    id: 'session_revoked_stale_participant',
    invites: [
      {
        createdAt: '2026-05-20T11:00:00.000Z',
        id: 'invite_revoked',
        invitedUserId: 'user_1',
        invitedUserName: 'Pat',
        status: 'revoked',
      },
    ],
    joinedCount: 2,
    participants: [
      {
        id: 'participant_stale',
        joinedAt: '2026-05-20T11:00:00.000Z',
        name: 'Pat',
        role: 'participant',
        userId: 'user_1',
      },
    ],
  };
}

function buildCompletedSession(): TastingSessionRecord {
  return {
    ...buildSession('2026-05-20T12:00:00.000Z'),
    id: 'session_completed',
    invites: [],
    joinedCount: 2,
    leaderUserId: 'user_1',
    name: 'Completed tasting',
    participants: [
      {
        id: 'participant_1',
        joinedAt: '2026-05-20T11:00:00.000Z',
        name: 'Pat',
        role: 'leader',
        userId: 'user_1',
      },
      {
        id: 'participant_2',
        joinedAt: '2026-05-20T11:05:00.000Z',
        name: 'Sam',
        role: 'participant',
        userId: 'user_2',
      },
    ],
    restaurants: [
      {
        createdAt: '2026-05-20T11:10:00.000Z',
        id: 'restaurant_1',
        items: [
          {
            createdAt: '2026-05-20T11:15:00.000Z',
            id: 'item_1',
            menuItemId: 'menu_item_1',
            name: 'Tonkotsu',
            ratings: [],
            restaurantSuggestionId: 'restaurant_1',
            status: 'approved',
            suggestedByParticipantId: 'participant_1',
          },
        ],
        restaurantId: 'restaurant_record_1',
        restaurantName: 'Ramen Place',
        status: 'approved',
        suggestedByParticipantId: 'participant_1',
      },
    ],
    status: 'completed',
    updatedAt: '2026-05-22T16:30:00.000Z',
  };
}

function renderScreen(
  sessions: TastingSessionRecord[],
  routeParams?: RootStackParamList['TastingSessions'],
) {
  const navigation = {
    navigate: jest.fn(),
    setParams: jest.fn(),
  };
  const refetch = jest.fn(async () => ({ data: sessions }));

  mockedUseQuery.mockReturnValue({
    data: sessions,
    isError: false,
    isLoading: false,
    isRefetching: false,
    refetch,
  } as unknown as ReturnType<typeof useQuery>);

  let renderer: TestRenderer;
  act(() => {
    renderer = create(
      <TastingSessionsScreen
        navigation={navigation as never}
        route={{ params: routeParams } as never}
      />,
    ) as TestRenderer;
  });

  return { navigation, refetch, renderer: renderer! };
}

function findButton(renderer: TestRenderer, label: string) {
  const button = renderer.root.findAllByType('Button').find((node: any) => node.props.label === label);
  if (!button) {
    throw new Error(`Could not find button ${label}`);
  }
  return button;
}

describe('TastingSessionsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseAuth.mockReturnValue({
      user: {
        id: 'user_1',
      },
    } as ReturnType<typeof useAuth>);
    mockedUseConnectivity.mockReturnValue({
      isOnline: true,
    } as ReturnType<typeof useConnectivity>);
    mockedUseTastingSessionWrites.mockReturnValue({
      acceptInvite,
      createSession: jest.fn(),
      deleteSession: jest.fn(),
      dismissInvite,
      joinSession: jest.fn(),
      lockLobby: jest.fn(),
      reopenInviteWindow: jest.fn(),
      removeParticipant: jest.fn(),
      resendInvite: jest.fn(),
    } as unknown as ReturnType<typeof useTastingSessionWrites>);
  });

  it('keeps expired pending invites off the active session list', () => {
    const { renderer } = renderScreen([buildSession('2000-01-01T00:00:00.000Z')]);

    expect(acceptInvite).not.toHaveBeenCalled();
    expect(renderer.root.findAllByType('Button').some((node: any) => node.props.label === 'Join Invite')).toBe(false);
    expect(renderer.root.findAllByType('ListItem').some((node: any) => node.props.title === 'Ramen night')).toBe(false);
    expect(renderer.root.findAllByType('Text').some((node: any) => node.children.join('') === 'Invite expired')).toBe(true);
  });

  it('lets invitees dismiss an expired invite banner without rendering the session card', async () => {
    const { renderer } = renderScreen([buildSession('2000-01-01T00:00:00.000Z')]);

    await act(async () => {
      findButton(renderer, 'Dismiss').props.onPress();
      await Promise.resolve();
    });

    expect(dismissInvite).toHaveBeenCalledWith({
      isOnline: true,
      sessionId: 'session_2000-01-01T00:00:00.000Z',
    });
    expect(renderer.root.findAllByType('ListItem').some((node: any) => node.props.title === 'Ramen night')).toBe(false);
  });

  it('shows join actions for pending invites while the invite window is open', () => {
    const { renderer } = renderScreen([buildSession('2099-01-01T00:00:00.000Z')]);

    expect(renderer.root.findAllByType('Button').some((node: any) => node.props.label === 'Join Invite')).toBe(true);
    expect(renderer.root.findAllByType('StatusPill').some((node: any) => node.props.label === 'Expired')).toBe(false);
  });

  it('hides active lobby sessions when the user is not leader, participant, or actively invited', () => {
    const { renderer } = renderScreen([buildInviteOnlySessionWithoutInvite()]);

    expect(renderer.root.findAllByType('ListItem').some((node: any) => node.props.title === 'Ramen night')).toBe(false);
    expect(renderer.root.findAllByType('Text').some((node: any) => node.children.join('') === 'Invite expired')).toBe(false);
  });

  it('hides revoked invite sessions even when cached participant data is stale', () => {
    const { renderer } = renderScreen([buildRevokedSessionWithStaleParticipant()]);

    expect(renderer.root.findAllByType('ListItem').some((node: any) => node.props.title === 'Ramen night')).toBe(false);
  });

  it('uses the join banner for manual code entry instead of a standalone button', () => {
    const { navigation, renderer } = renderScreen([]);

    expect(renderer.root.findAllByType('Button').some((node: any) => node.props.label === 'Enter Code')).toBe(false);

    act(() => {
      renderer.root.findByType('Pressable').props.onPress();
    });

    expect(navigation.navigate).toHaveBeenCalledWith('JoinTastingSession');
  });

  it('refreshes group tastings from the screen scaffold pull action', async () => {
    const { refetch, renderer } = renderScreen([]);
    const scaffold = renderer.root.findByType('BackHeaderScreenScaffold');

    await act(async () => {
      await scaffold.props.onRefresh();
    });

    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('refreshes group tastings when notification navigation requests fresh data', () => {
    const { navigation, refetch } = renderScreen([], { refreshSignal: 123 });

    expect(refetch).toHaveBeenCalledTimes(1);
    expect(navigation.setParams).toHaveBeenCalledWith({ refreshSignal: undefined });
  });

  it('revalidates group tastings on mount without interval polling', () => {
    renderScreen([buildCompletedSession()]);

    const queryOptions = mockedUseQuery.mock.calls[0]?.[0] as unknown as {
      enabled: boolean;
      refetchInterval?: unknown;
      refetchOnMount: string;
      refetchOnReconnect: string;
      staleTime: number;
    };

    expect(queryOptions.enabled).toBe(true);
    expect(queryOptions.staleTime).toBe(0);
    expect(queryOptions.refetchOnMount).toBe('always');
    expect(queryOptions.refetchOnReconnect).toBe('always');
    expect(queryOptions.refetchInterval).toBeUndefined();
  });

  it('does not start a network list fetch while offline', () => {
    mockedUseConnectivity.mockReturnValue({
      isOnline: false,
    } as ReturnType<typeof useConnectivity>);

    renderScreen([]);

    const queryOptions = mockedUseQuery.mock.calls[0]?.[0] as unknown as {
      enabled: boolean;
    };

    expect(queryOptions.enabled).toBe(false);
  });

  it('renders completed sessions as list rows with a session date', () => {
    const { renderer } = renderScreen([buildCompletedSession()]);

    const completedRow = renderer.root
      .findAllByType('OptionListRow')
      .find((node: any) => node.props.title === 'Completed tasting');

    expect(completedRow).toBeTruthy();
    expect(completedRow?.props.subtitle).toBe('May 22, 2026 - 1 restaurant, 1 item, 2 tasters');
    expect(renderer.root.findAllByType('Card')).toHaveLength(0);
  });
});
