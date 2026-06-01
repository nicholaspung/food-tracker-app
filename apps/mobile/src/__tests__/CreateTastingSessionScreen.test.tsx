import React from 'react';
import { act, create } from 'react-test-renderer';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';

import { useTastingSessionWrites } from '../features';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { CreateTastingSessionScreen } from '../screens/CreateTastingSessionScreen';

const mockReact = React;

const mockTheme = {
  colors: {
    background: {
      muted: 'muted-background',
      surface: 'surface-background',
    },
    border: {
      default: 'default-border',
      info: 'info-border',
      strong: 'strong-border',
      subtle: 'subtle-border',
      success: 'success-border',
      warning: 'warning-border',
    },
    button: {
      primaryBg: 'primary-button-background',
      primaryDisabledBg: 'primary-button-disabled',
      secondaryBg: 'secondary-button-background',
      secondaryBorder: 'secondary-button-border',
    },
    fill: {
      brand: 'brand-fill',
      danger: 'danger-fill',
    },
    status: {
      infoBg: 'info-background',
      successBg: 'success-background',
      warningBg: 'warning-background',
    },
    text: {
      brand: 'brand-text',
      danger: 'danger-text',
      info: 'info-text',
      inverse: 'inverse-text',
      muted: 'muted-text',
      primary: 'primary-text',
      secondary: 'secondary-text',
      success: 'success-text',
      warning: 'warning-text',
    },
  },
  radii: {
    lg: 16,
    md: 12,
    pill: 999,
  },
  sizes: {
    buttonHeight: 48,
    inputMinHeight: 48,
    secondaryButtonHeight: 40,
  },
  spacing: {
    xxs: 4,
    xs: 8,
    sm: 12,
    md: 16,
    lg: 20,
  },
  typography: {
    bodyLg: { fontSize: 18 },
    titleSm: { fontSize: 20, fontWeight: '700' },
  },
} as const;

jest.mock('@tanstack/react-query', () => ({
  useInfiniteQuery: jest.fn(),
  useQueryClient: jest.fn(),
}));

jest.mock('react-native', () => {
  const React = jest.requireActual<typeof import('react')>('react');

  return {
    ScrollView: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
      React.createElement('ScrollView', props, children),
    StyleSheet: {
      create: <T,>(value: T) => value,
    },
    View: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
      React.createElement('View', props, children),
  };
});

jest.mock('../components/shared', () => ({
  FeatureFormScreenScaffold: (
    { children, ...props }: Record<string, unknown> & { children?: React.ReactNode },
  ) => mockReact.createElement('FeatureFormScreenScaffold', props, children),
  OptionList: (
    { children, ...props }: Record<string, unknown> & { children?: React.ReactNode },
  ) => mockReact.createElement('OptionList', props, children),
  OptionListRow: (props: Record<string, unknown>) => mockReact.createElement('OptionListRow', props),
  PageErrorToast: (props: Record<string, unknown>) => mockReact.createElement('PageErrorToast', props),
  Skeleton: (props: Record<string, unknown>) => mockReact.createElement('Skeleton', props),
}));

jest.mock('../features', () => ({
  friendsQueryKeys: {
    paginated: (userId: string | null | undefined, section: string, search?: string) =>
      search?.trim()
        ? ['feature', 'friends', 'user', userId ?? 'anonymous', 'paginated', section, search.trim()]
        : ['feature', 'friends', 'user', userId ?? 'anonymous', 'paginated', section],
  },
  hydrateFriendsSummaryFromPaginatedData: jest.fn(),
  listFriendsPage: jest.fn(),
  tastingSessionsQueryKeys: {
    root: ['feature', 'tasting-sessions'],
  },
  useTastingSessionWrites: jest.fn(),
}));

jest.mock('../hooks/useDebouncedValue', () => ({
  useDebouncedValue: (value: string) => value,
}));

jest.mock('../providers/ConnectivityProvider', () => ({
  useConnectivity: jest.fn(),
}));

jest.mock('../providers/AuthProvider', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../theme', () => ({
  createThemedStyles:
    (factory: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) =>
      factory(mockTheme, ...args),
  useTheme: () => mockTheme,
}));

jest.mock('../ui', () => ({
  Button: (props: Record<string, unknown>) => mockReact.createElement('Button', props),
  Card: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Card', props, children),
  Input: (props: Record<string, unknown>) => mockReact.createElement('Input', props),
  Modal: ({
    children,
    visible,
    ...props
  }: Record<string, unknown> & { children?: React.ReactNode; visible?: boolean }) =>
    visible ? mockReact.createElement('Modal', props, children) : null,
  Text: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Text', props, children),
}));

const mockedUseInfiniteQuery = useInfiniteQuery as jest.MockedFunction<typeof useInfiniteQuery>;
const mockedUseQueryClient = useQueryClient as jest.MockedFunction<typeof useQueryClient>;
const mockedUseTastingSessionWrites = useTastingSessionWrites as jest.MockedFunction<
  typeof useTastingSessionWrites
>;
const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockedUseConnectivity = useConnectivity as jest.MockedFunction<typeof useConnectivity>;
type TestRenderer = ReturnType<typeof create> & { root: any };

const friends = [
  {
    createdAt: '2026-05-01T00:00:00.000Z',
    email: 'waitlist@example.com',
    id: 'friendship-1',
    name: 'Waitlist 1',
    status: 'friend',
    userId: 'user-friend-1',
  },
  {
    createdAt: '2026-05-02T00:00:00.000Z',
    email: 'madi@example.com',
    id: 'friendship-2',
    name: 'madi',
    status: 'friend',
    userId: 'user-friend-2',
  },
] as const;

function buildInfiniteQueryResult(items: readonly Record<string, unknown>[]) {
  return {
    data: {
      pageParams: [1],
      pages: [
        {
          hasNextPage: false,
          items,
          page: 1,
          pageSize: 20,
          totalItems: items.length,
          totalPages: 1,
        },
      ],
    },
    fetchNextPage: jest.fn(),
    hasNextPage: false,
    isError: false,
    isFetching: false,
    isFetchingNextPage: false,
    isLoading: false,
    isSuccess: true,
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof useInfiniteQuery>;
}

function findByTestId(renderer: TestRenderer, type: string, testID: string) {
  const match = renderer.root.findAllByType(type).find((node: any) => node.props.testID === testID);
  if (!match) {
    throw new Error(`Could not find ${type} with testID "${testID}".`);
  }

  return match;
}

function hasTestId(renderer: TestRenderer, type: string, testID: string): boolean {
  return renderer.root.findAllByType(type).some((node: any) => node.props.testID === testID);
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

function hasExactText(renderer: TestRenderer, value: string): boolean {
  return renderer.root.findAllByType('Text').some((node: any) => getTextContent(node) === value);
}

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('CreateTastingSessionScreen', () => {
  let friendsItems: readonly Record<string, unknown>[];
  let navigation: {
    goBack: jest.Mock;
    navigate: jest.Mock;
  };
  let queryClient: {
    invalidateQueries: jest.Mock;
  };

  beforeEach(() => {
    friendsItems = friends;
    navigation = {
      goBack: jest.fn(),
      navigate: jest.fn(),
    };
    queryClient = {
      invalidateQueries: jest.fn(async () => undefined),
    };

    mockedUseInfiniteQuery.mockReset();
    mockedUseInfiniteQuery.mockImplementation(() => buildInfiniteQueryResult(friendsItems));

    mockedUseQueryClient.mockReset();
    mockedUseQueryClient.mockReturnValue(queryClient as unknown as ReturnType<typeof useQueryClient>);

    mockedUseTastingSessionWrites.mockReset();
    mockedUseTastingSessionWrites.mockReturnValue({
      acceptInvite: jest.fn(),
      createSession: jest.fn().mockResolvedValue({
        result: {
          createdAt: '2026-05-01T00:00:00.000Z',
          createdByUserId: 'user-1',
          id: 'session-1',
          inviteCode: 'ABC123',
          invites: [],
          joinExpiresAt: '2026-05-01T01:00:00.000Z',
          joinedCount: 1,
          leaderUserId: 'user-1',
          maxApprovedItems: 8,
          maxParticipants: 8,
          maxRestaurants: 3,
          name: 'Friday ramen tasting',
          participants: [],
          restaurants: [],
          status: 'lobby',
          updatedAt: '2026-05-01T00:00:00.000Z',
        },
        status: 'completed',
      }),
      deleteSession: jest.fn(),
      dismissInvite: jest.fn(),
      joinSession: jest.fn(),
      lockLobby: jest.fn(),
      reopenInviteWindow: jest.fn(),
      removeParticipant: jest.fn(),
      resendInvite: jest.fn(),
    } as unknown as ReturnType<typeof useTastingSessionWrites>);

    mockedUseAuth.mockReset();
    mockedUseAuth.mockReturnValue({
      user: {
        email: 'pat@example.com',
        id: 'user-1',
        name: 'Pat',
      },
    } as ReturnType<typeof useAuth>);

    mockedUseConnectivity.mockReset();
    mockedUseConnectivity.mockReturnValue({
      isOnline: true,
    } as ReturnType<typeof useConnectivity>);
  });

  async function renderScreen(): Promise<TestRenderer> {
    let renderer: TestRenderer | null = null;

    await act(async () => {
      renderer = create(
        <CreateTastingSessionScreen
          navigation={navigation as never}
          route={{
            key: 'CreateTastingSession-route',
            name: 'CreateTastingSession',
          } as never}
        />,
      ) as TestRenderer;
    });

    if (!renderer) {
      throw new Error('Expected renderer to be created.');
    }

    await flushMicrotasks();
    return renderer as TestRenderer;
  }

  it('renders the tasting invite picker trigger instead of inline invite rows', async () => {
    const renderer = await renderScreen();

    expect(hasTestId(renderer, 'OptionListRow', 'tasting-friends-picker-trigger')).toBe(true);
    expect(hasExactText(renderer, 'Tap to invite')).toBe(false);
    expect(mockedUseInfiniteQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['feature', 'friends', 'user', 'user-1', 'paginated', 'friends'],
      }),
    );
  });

  it('hides manual person entry when inviting tasting friends', async () => {
    const renderer = await renderScreen();
    const pickerTrigger = findByTestId(renderer, 'OptionListRow', 'tasting-friends-picker-trigger');

    await act(async () => {
      pickerTrigger.props.onPress();
    });

    expect(hasTestId(renderer, 'Input', 'bill-custom-participant-input')).toBe(false);
    expect(hasExactText(renderer, 'Add Person')).toBe(false);
  });

  it('submits selected tasting invitees as user ids', async () => {
    const renderer = await renderScreen();
    const nameInput = renderer.root.findAllByType('Input').find((node: any) => node.props.label === 'Session name');
    if (!nameInput) {
      throw new Error('Could not find session name input.');
    }

    await act(async () => {
      nameInput.props.onChangeText('Friday ramen tasting');
    });

    const pickerTrigger = findByTestId(renderer, 'OptionListRow', 'tasting-friends-picker-trigger');
    await act(async () => {
      pickerTrigger.props.onPress();
    });

    const firstFriend = findByTestId(renderer, 'OptionListRow', 'bill-friends-option-0');
    const secondFriend = findByTestId(renderer, 'OptionListRow', 'bill-friends-option-1');
    await act(async () => {
      firstFriend.props.onPress();
      secondFriend.props.onPress();
    });

    const participantPickerModal = renderer.root.findByType('Modal');
    await act(async () => {
      participantPickerModal.props.primaryAction.onPress();
    });

    expect(hasExactText(renderer, '2 friends invited')).toBe(true);

    const scaffold = renderer.root.findByType('FeatureFormScreenScaffold');
    await act(async () => {
      scaffold.props.primaryAction.onPress();
    });
    await flushMicrotasks();

    const tastingSessionWrites = mockedUseTastingSessionWrites.mock.results[0]?.value;
    expect(tastingSessionWrites.createSession).toHaveBeenCalledTimes(1);
    expect(tastingSessionWrites.createSession).toHaveBeenCalledWith({
      invitedUserIds: ['user-friend-1', 'user-friend-2'],
      isOnline: true,
      joinDurationMinutes: 60,
      name: 'Friday ramen tasting',
    });
  });

  it('shows the empty friend copy', async () => {
    friendsItems = [];
    const renderer = await renderScreen();

    expect(hasExactText(renderer, 'No accepted friends found.')).toBe(true);
  });

  it('disables create and shows offline messaging when offline', async () => {
    mockedUseConnectivity.mockReturnValue({
      isOnline: false,
    } as ReturnType<typeof useConnectivity>);

    const renderer = await renderScreen();
    const scaffold = renderer.root.findByType('FeatureFormScreenScaffold');

    expect(scaffold.props.primaryAction.disabled).toBe(true);
    expect(hasExactText(renderer, 'Creating a group tasting requires a connection.')).toBe(true);
  });
});
