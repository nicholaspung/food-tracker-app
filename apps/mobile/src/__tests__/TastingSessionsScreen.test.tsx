import React from 'react';
import { act, create } from 'react-test-renderer';
import { useInfiniteQuery } from '@tanstack/react-query';

import { useTastingSessionWrites, type TastingSessionListSummary } from '../features';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { TastingSessionsScreen } from '../screens/TastingSessionsScreen';

const mockReact = React;

jest.mock('@tanstack/react-query', () => ({
  useInfiniteQuery: jest.fn(),
}));

jest.mock('react-native', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    Pressable: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
      React.createElement('Pressable', props, children),
    SectionList: ({
      ListFooterComponent,
      ListHeaderComponent,
      renderItem,
      renderSectionHeader,
      sections = [],
      ...props
    }: Record<string, any>) => {
      const children = sections.flatMap((section: any) => [
        renderSectionHeader
          ? React.cloneElement(renderSectionHeader({ section }), { key: `${section.key}-header` })
          : null,
        ...section.data.map((item: any, index: number) => {
          const element = renderItem?.({
            index,
            item,
            section,
            separators: {},
          });
          return element ? React.cloneElement(element, { key: item.id }) : null;
        }),
      ]);

      return React.createElement(
        'SectionList',
        props,
        ListHeaderComponent,
        children,
        ListFooterComponent,
      );
    },
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
  OptionListInlineBody: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('OptionListInlineBody', props, children),
  OptionListRow: ({ rightAccessory, titleAccessory, ...props }: Record<string, unknown>) =>
    mockReact.createElement('OptionListRow', props, titleAccessory as React.ReactNode, rightAccessory as React.ReactNode),
  StatusPill: (props: Record<string, unknown>) => mockReact.createElement('StatusPill', props),
}));

jest.mock('../features', () => ({
  listTastingSessionSummariesPage: jest.fn(),
  tastingSessionsQueryKeys: {
    root: ['feature', 'tasting-sessions'],
    summaries: (filter: string) => ['feature', 'tasting-sessions', 'summaries', filter],
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

const mockedUseInfiniteQuery = useInfiniteQuery as jest.MockedFunction<typeof useInfiniteQuery>;
const mockedUseTastingSessionWrites = useTastingSessionWrites as jest.MockedFunction<
  typeof useTastingSessionWrites
>;
const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockedUseConnectivity = useConnectivity as jest.MockedFunction<typeof useConnectivity>;

const acceptInvite = jest.fn();
const dismissInvite = jest.fn();
type TestRenderer = ReturnType<typeof create> & { root: any };

function buildSession(joinExpiresAt: string): TastingSessionListSummary {
  return {
    approvedItemCount: 0,
    approvedRestaurantCount: 0,
    createdAt: '2026-05-20T11:00:00.000Z',
    id: `session_${joinExpiresAt}`,
    joinExpiresAt,
    joinedCount: 1,
    leaderUserId: 'leader_1',
    maxApprovedItems: 8,
    maxParticipants: 8,
    maxRestaurants: 3,
    name: 'Ramen night',
    status: 'lobby',
    updatedAt: '2026-05-20T11:00:00.000Z',
    viewerInvite: {
      createdAt: '2026-05-20T11:00:00.000Z',
      id: 'invite_1',
      invitedUserId: 'user_1',
      invitedUserName: 'Pat',
      status: 'pending',
    },
    viewerParticipant: false,
  };
}

function buildInviteOnlySessionWithoutInvite(): TastingSessionListSummary {
  return {
    ...buildSession('2000-01-01T00:00:00.000Z'),
    id: 'session_without_invite',
    viewerInvite: undefined,
  };
}

function buildRevokedSessionWithStaleParticipant(): TastingSessionListSummary {
  return {
    ...buildSession('2099-01-01T00:00:00.000Z'),
    id: 'session_revoked_stale_participant',
    joinedCount: 2,
    viewerInvite: {
      createdAt: '2026-05-20T11:00:00.000Z',
      id: 'invite_revoked',
      invitedUserId: 'user_1',
      invitedUserName: 'Pat',
      status: 'revoked',
    },
    viewerParticipant: true,
  };
}

function buildCompletedSession(): TastingSessionListSummary {
  return {
    ...buildSession('2026-05-20T12:00:00.000Z'),
    approvedItemCount: 1,
    approvedRestaurantCount: 1,
    id: 'session_completed',
    joinedCount: 2,
    leaderUserId: 'user_1',
    name: 'Completed tasting',
    status: 'completed',
    updatedAt: '2026-05-22T16:30:00.000Z',
    viewerInvite: undefined,
    viewerParticipant: true,
  };
}

function buildUserOwnedSession(overrides: Partial<TastingSessionListSummary> = {}): TastingSessionListSummary {
  return {
    ...buildSession('2099-01-01T00:00:00.000Z'),
    id: 'session_owned',
    joinedCount: 1,
    leaderUserId: 'user_1',
    name: 'Owned tasting',
    updatedAt: '2026-05-20T11:00:00.000Z',
    viewerInvite: undefined,
    viewerParticipant: true,
    ...overrides,
  };
}

function renderScreen(
  sessions: TastingSessionListSummary[] | undefined,
  routeParams?: RootStackParamList['TastingSessions'],
) {
  const navigation = {
    navigate: jest.fn(),
    setParams: jest.fn(),
  };
  const refetch = jest.fn(async () => ({ data: sessions }));
  const fetchNextPage = jest.fn(async () => ({ data: sessions }));

  mockedUseInfiniteQuery.mockImplementation((options: any) => {
    const filter = options.queryKey[3] as 'active' | 'completed';
    const filteredSessions =
      sessions?.filter((session) =>
        filter === 'active' ? session.status !== 'completed' : session.status === 'completed',
      ) ?? [];
    return {
      data:
        sessions === undefined
          ? undefined
          : {
              pageParams: [1],
              pages: [
                {
                  hasNextPage: false,
                  items: filteredSessions,
                  page: 1,
                  pageSize: 20,
                  totalItems: filteredSessions.length,
                  totalPages: filteredSessions.length > 0 ? 1 : 0,
                },
              ],
            },
      fetchNextPage,
      hasNextPage: false,
      isError: false,
      isFetchingNextPage: false,
      isLoading: false,
      isRefetching: false,
      refetch,
    } as unknown as ReturnType<typeof useInfiniteQuery>;
  });

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

function getEmptyStateTitles(renderer: TestRenderer) {
  return renderer.root.findAllByType('EmptyState').map((node: any) => node.props.title);
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
    expect(renderer.root.findAllByType('OptionListRow').some((node: any) => node.props.title === 'Ramen night')).toBe(false);
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
    expect(renderer.root.findAllByType('OptionListRow').some((node: any) => node.props.title === 'Ramen night')).toBe(false);
  });

  it('shows join actions for pending invites while the invite window is open', () => {
    const { renderer } = renderScreen([buildSession('2099-01-01T00:00:00.000Z')]);

    expect(renderer.root.findAllByType('Button').some((node: any) => node.props.label === 'Join Invite')).toBe(true);
    expect(renderer.root.findAllByType('StatusPill').some((node: any) => node.props.label === 'Expired')).toBe(false);
  });

  it('hides active lobby sessions when the user is not leader, participant, or actively invited', () => {
    const { renderer } = renderScreen([buildInviteOnlySessionWithoutInvite()]);

    expect(renderer.root.findAllByType('OptionListRow').some((node: any) => node.props.title === 'Ramen night')).toBe(false);
    expect(renderer.root.findAllByType('Text').some((node: any) => node.children.join('') === 'Invite expired')).toBe(false);
  });

  it('hides revoked invite sessions even when cached participant data is stale', () => {
    const { renderer } = renderScreen([buildRevokedSessionWithStaleParticipant()]);

    expect(renderer.root.findAllByType('OptionListRow').some((node: any) => node.props.title === 'Ramen night')).toBe(false);
  });

  it('renders active sessions in the virtualized list', () => {
    const { renderer } = renderScreen([
      buildUserOwnedSession({ id: 'session_lobby', name: 'Lobby tasting', status: 'lobby' }),
      buildUserOwnedSession({ id: 'session_planning', name: 'Planning tasting', status: 'planning' }),
    ]);

    expect(renderer.root.findAllByType('SectionList')).toHaveLength(1);
    expect(renderer.root.findAllByType('OptionListRow').map((node: any) => node.props.title)).toEqual([
      'Planning tasting',
      'Lobby tasting',
    ]);
    expect(renderer.root.findAllByType('Card')).toHaveLength(0);
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
    const list = renderer.root.findByType('SectionList');

    await act(async () => {
      await list.props.onRefresh();
    });

    expect(refetch).toHaveBeenCalledTimes(2);
  });

  it('refreshes group tastings when notification navigation requests fresh data', () => {
    const { navigation, refetch } = renderScreen([], { refreshSignal: 123 });

    expect(refetch).toHaveBeenCalledTimes(2);
    expect(navigation.setParams).toHaveBeenCalledWith({ refreshSignal: undefined });
  });

  it('revalidates group tastings on mount without interval polling', () => {
    renderScreen([buildCompletedSession()]);

    const queryOptions = mockedUseInfiniteQuery.mock.calls[0]?.[0] as unknown as {
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

    const queryOptions = mockedUseInfiniteQuery.mock.calls.map((call) => call[0] as { enabled: boolean });

    expect(queryOptions).toHaveLength(2);
    expect(queryOptions.every((options) => options.enabled === false)).toBe(true);
  });

  it('shows an offline unavailable state instead of the normal empty state when no sessions are cached', () => {
    mockedUseConnectivity.mockReturnValue({
      isOnline: false,
    } as ReturnType<typeof useConnectivity>);

    const { renderer } = renderScreen(undefined);

    expect(getEmptyStateTitles(renderer)).toContain('No saved sessions available offline');
    expect(getEmptyStateTitles(renderer)).not.toContain('No group tastings');
  });

  it('renders cached sessions while offline', () => {
    mockedUseConnectivity.mockReturnValue({
      isOnline: false,
    } as ReturnType<typeof useConnectivity>);

    const { renderer } = renderScreen([buildUserOwnedSession()]);

    expect(getEmptyStateTitles(renderer)).toEqual([]);
    expect(renderer.root.findAllByType('OptionListRow').some((node: any) => node.props.title === 'Owned tasting')).toBe(true);
    expect(renderer.root.findAllByType('Text').some((node: any) => node.children.join('') === 'Offline mode shows saved sessions. Actions require a connection.')).toBe(true);
  });

  it('renders the normal empty state after an online empty response', () => {
    const { renderer } = renderScreen([]);

    expect(getEmptyStateTitles(renderer)).toContain('No group tastings');
    expect(getEmptyStateTitles(renderer)).not.toContain('No saved sessions available offline');
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

  it('orders visible sessions from newest to oldest in each section', () => {
    const olderActive = buildUserOwnedSession({
      id: 'session_older_active',
      name: 'Older active',
      updatedAt: '2026-05-20T11:00:00.000Z',
    });
    const newerActive = buildUserOwnedSession({
      id: 'session_newer_active',
      name: 'Newer active',
      updatedAt: '2026-05-21T11:00:00.000Z',
    });
    const olderCompleted = {
      ...buildCompletedSession(),
      id: 'session_older_completed',
      name: 'Older completed',
      updatedAt: '2026-05-22T11:00:00.000Z',
    };
    const newerCompleted = {
      ...buildCompletedSession(),
      id: 'session_newer_completed',
      name: 'Newer completed',
      updatedAt: '2026-05-23T11:00:00.000Z',
    };

    const { renderer } = renderScreen([olderCompleted, olderActive, newerCompleted, newerActive]);

    expect(renderer.root.findAllByType('OptionListRow').map((node: any) => node.props.title)).toEqual([
      'Newer active',
      'Older active',
      'Newer completed',
      'Older completed',
    ]);
  });
});
