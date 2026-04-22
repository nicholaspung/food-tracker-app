import React from 'react';
import { act, create } from 'react-test-renderer';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';

import { useOfflineAwareFeatureWrite } from '../features/store/useOfflineAwareFeatureWrite';
import { trackObservabilityEvent } from '../observability';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { NotesScreen } from '../screens/NotesScreen';

const mockReact = React;
const theme = {
  colors: {
    text: {
      brand: 'blue',
      danger: 'red',
      inverse: 'white',
      muted: 'gray',
      primary: 'black',
      secondary: 'slategray',
    },
    background: {
      inverse: 'black',
      muted: 'whitesmoke',
      surface: 'white',
    },
    border: {
      default: 'lightgray',
      subtle: 'silver',
    },
  },
  spacing: {
    md: 16,
    sm: 12,
    xs: 8,
    xxs: 4,
  },
  radii: {
    md: 12,
    pill: 999,
  },
  sizes: {
    secondaryButtonHeight: 44,
  },
} as const;

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

jest.mock('@tanstack/react-query', () => ({
  useInfiniteQuery: jest.fn(),
  useQueryClient: jest.fn(),
}));

jest.mock('../features/store/useOfflineAwareFeatureWrite', () => ({
  useOfflineAwareFeatureWrite: jest.fn(),
}));

jest.mock('../observability', () => ({
  trackObservabilityEvent: jest.fn(),
}));

jest.mock('../providers/ConnectivityProvider', () => ({
  useConnectivity: jest.fn(),
}));

jest.mock('../theme', () => ({
  createThemedStyles:
    (factory: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) =>
      factory(theme, ...args),
  useTheme: () => theme,
}));

jest.mock('../ui', () => {
  return {
    Button: (props: Record<string, unknown>) => mockReact.createElement('Button', props),
    Card: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
      mockReact.createElement('Card', props, children),
    Input: (props: Record<string, unknown>) => mockReact.createElement('Input', props),
    Text: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
      mockReact.createElement('Text', props, children),
  };
});

jest.mock('../components/shared', () => {
  return {
    ConfirmDestructiveModal: () => null,
    EmptyState: (props: Record<string, unknown>) => mockReact.createElement('EmptyState', props),
    ErrorState: (props: Record<string, unknown>) => mockReact.createElement('ErrorState', props),
    ExpandableText: jest.requireActual('../components/shared/ExpandableText').ExpandableText,
    FeatureDetailScreenScaffold: (
      { children, ...props }: Record<string, unknown> & { children?: React.ReactNode },
    ) => mockReact.createElement('FeatureDetailScreenScaffold', props, children),
    HeaderAccessoryButton: () => null,
    PhotoViewerModal: () => null,
    SegmentedControl: (props: Record<string, unknown>) => mockReact.createElement('MockSegmentedControl', props),
    Skeleton: () => null,
    StatusPill: () => null,
  };
});

jest.mock('../components/shared/PageErrorToast', () => ({
  PageErrorToast: () => null,
}));

const mockedUseInfiniteQuery = useInfiniteQuery as jest.MockedFunction<typeof useInfiniteQuery>;
const mockedUseQueryClient = useQueryClient as jest.MockedFunction<typeof useQueryClient>;
const mockedUseOfflineAwareFeatureWrite = useOfflineAwareFeatureWrite as jest.MockedFunction<
  typeof useOfflineAwareFeatureWrite
>;
const mockedUseConnectivity = useConnectivity as jest.MockedFunction<typeof useConnectivity>;
const mockedTrackObservabilityEvent = trackObservabilityEvent as jest.MockedFunction<
  typeof trackObservabilityEvent
>;

function buildNote(overrides: Record<string, unknown> = {}) {
  return {
    id: 'note_1',
    title: 'Note 1',
    content: 'Test note',
    status: 'draft',
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-02T00:00:00.000Z',
    ...overrides,
  };
}

function styleIncludes(style: unknown, expected: Record<string, unknown>): boolean {
  const styles = Array.isArray(style) ? style.flat() : [style];

  return styles.some((entry) => {
    if (!entry || typeof entry !== 'object') {
      return false;
    }

    return Object.entries(expected).every(([key, value]) => (entry as Record<string, unknown>)[key] === value);
  });
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return {
    promise,
    reject,
    resolve,
  };
}

function buildNotesQueryResult(
  items: Record<string, unknown>[],
  overrides: Record<string, unknown> = {},
) {
  const draftCount = items.filter((item) => item.status === 'draft').length;
  const usedCount = items.filter((item) => item.status === 'used').length;

  return {
    data: {
      pages: [
        {
          items,
          summary: {
            allCount: items.length,
            draftCount,
            usedCount,
          },
          page: 1,
          pageSize: 20,
          totalItems: items.length,
          totalPages: 1,
          hasNextPage: false,
        },
      ],
      pageParams: [1],
    },
    isError: false,
    isFetching: false,
    isLoading: false,
    isRefetching: false,
    isSuccess: true,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: jest.fn(),
    refetch: jest.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useInfiniteQuery>;
}

function buildDisabledNotesQueryResult() {
  return {
    data: undefined,
    isError: false,
    isFetching: false,
    isLoading: false,
    isRefetching: false,
    isSuccess: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: jest.fn(),
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof useInfiniteQuery>;
}

function buildLoadingNotesQueryResult() {
  return buildNotesQueryResult([], {
    data: undefined,
    isFetching: true,
    isLoading: true,
    isRefetching: false,
    isSuccess: false,
  });
}

function buildErrorNotesQueryResult() {
  return buildNotesQueryResult([], {
    data: undefined,
    isError: true,
    isRefetching: false,
    isSuccess: false,
  });
}

function mockNotesQueries(options?: {
  baseItems?: Record<string, unknown>[];
  searchItemsByTerm?: Record<string, Record<string, unknown>[]>;
  loadingSearchTerms?: string[];
  errorSearchTerms?: string[];
}) {
  const {
    baseItems = [buildNote()],
    searchItemsByTerm = {},
    loadingSearchTerms = [],
    errorSearchTerms = [],
  } = options ?? {};

  mockedUseInfiniteQuery.mockImplementation((queryOptions: Record<string, any>) => {
    const queryKey = queryOptions.queryKey;
    const enabled = queryOptions.enabled ?? true;
    const searchTerm =
      Array.isArray(queryKey) && queryKey.length === 5 && typeof queryKey[4] === 'string'
        ? queryKey[4]
        : '';

    if (!enabled) {
      return buildDisabledNotesQueryResult();
    }

    if (searchTerm) {
      if (loadingSearchTerms.includes(searchTerm)) {
        return buildLoadingNotesQueryResult();
      }

      if (errorSearchTerms.includes(searchTerm)) {
        return buildErrorNotesQueryResult();
      }

      return buildNotesQueryResult(searchItemsByTerm[searchTerm] ?? []);
    }

    return buildNotesQueryResult(baseItems);
  });
}

describe('NotesScreen', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockedUseInfiniteQuery.mockReset();
    mockedUseQueryClient.mockReset();
    mockedUseOfflineAwareFeatureWrite.mockReset();
    mockedTrackObservabilityEvent.mockReset();
    mockNotesQueries();
    mockedUseQueryClient.mockReturnValue({
      fetchQuery: jest.fn(),
      invalidateQueries: jest.fn(),
    } as unknown as ReturnType<typeof useQueryClient>);
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(jest.fn() as ReturnType<typeof useOfflineAwareFeatureWrite>);
    mockedUseConnectivity.mockReturnValue({ isOnline: true } as ReturnType<typeof useConnectivity>);
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('shows the auto-delete banner only on the Used tab', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <NotesScreen
          navigation={{
            navigate: jest.fn(),
          } as never}
          route={{} as never}
        />,
      );
    });

    const findBannerNodes = () =>
      renderer?.root.findAll((node: any) => node.props.testID === 'notes-used-retention-banner') ?? [];

    expect(findBannerNodes()).toHaveLength(0);

    await act(async () => {
      renderer?.root.findByType('MockSegmentedControl').props.onChange('used');
    });

    expect(findBannerNodes().length).toBeGreaterThan(0);

    await act(async () => {
      renderer?.root.findByType('MockSegmentedControl').props.onChange('all');
    });

    expect(findBannerNodes()).toHaveLength(0);
  });

  it('renders used note cards with the default white card tone', async () => {
    let renderer: any = null;

    mockNotesQueries({
      baseItems: [
        buildNote({
          id: 'used_note_1',
          title: 'Used Note 1',
          content: 'Previously used note',
          status: 'used',
        }),
      ],
    });

    await act(async () => {
      renderer = create(
        <NotesScreen
          navigation={{
            navigate: jest.fn(),
          } as never}
          route={{} as never}
        />,
      );
    });

    await act(async () => {
      renderer?.root.findByType('MockSegmentedControl').props.onChange('used');
    });

    const cardTones = renderer?.root
      .findAll((node: any) => node.type === 'Card')
      .map((node: any) => node.props.tone);

    expect(cardTones).toContain('default');
    expect(cardTones).not.toContain('muted');
  });

  it('shows and clears the search input state', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <NotesScreen
          navigation={{
            navigate: jest.fn(),
          } as never}
          route={{} as never}
        />,
      );
    });

    const searchInput = renderer?.root.findByType('Input');
    expect(searchInput.props.placeholder).toBe('Search notes...');
    expect(searchInput.props.value).toBe('');
    expect(
      renderer?.root.findAll((node: any) => node.props.accessibilityLabel === 'Clear search'),
    ).toHaveLength(0);

    await act(async () => {
      searchInput.props.onChangeText('ramen');
    });

    const clearButtons = renderer?.root.findAll(
      (node: any) =>
        node.props.accessibilityLabel === 'Clear search' && typeof node.props.onPress === 'function',
    ) ?? [];

    expect(renderer?.root.findByType('Input').props.value).toBe('ramen');
    expect(clearButtons).toHaveLength(1);

    await act(async () => {
      clearButtons[0].props.onPress();
    });

    expect(renderer?.root.findByType('Input').props.value).toBe('');
    expect(
      renderer?.root.findAll((node: any) => node.props.accessibilityLabel === 'Clear search'),
    ).toHaveLength(0);
  });

  it('shows a search-specific empty state when the active search has no matches', async () => {
    let renderer: any = null;

    mockNotesQueries({
      baseItems: [buildNote()],
      searchItemsByTerm: {
        ramen: [],
      },
    });

    await act(async () => {
      renderer = create(
        <NotesScreen
          navigation={{
            navigate: jest.fn(),
          } as never}
          route={{} as never}
        />,
      );
    });

    await act(async () => {
      renderer?.root.findByType('Input').props.onChangeText('ramen');
    });

    const emptyState = renderer?.root.findByType('EmptyState');
    expect(emptyState.props.title).toBe('No matching notes');
    expect(emptyState.props.description).toBe('Try a different search term.');
    expect(emptyState.props.actionLabel).toBe('Clear Search');
    expect(emptyState.props.tone).toBe('muted');
  });

  it('renders note descriptions as multiline text with preserved paragraph breaks', async () => {
    let renderer: any = null;

    mockNotesQueries({
      baseItems: [
        buildNote({
          content: 'First line\n\nSecond line',
        }),
      ],
    });

    await act(async () => {
      renderer = create(
        <NotesScreen
          navigation={{
            navigate: jest.fn(),
          } as never}
          route={{} as never}
        />,
      );
    });

    const previewText = renderer?.root.findAll(
      (node: any) => node.type === 'Text' && node.props.numberOfLines === 4,
    )[0];

    expect(previewText).toBeDefined();
    expect(previewText.props.variant).toBe('bodyMd');
    expect(previewText.props.children).toBe('First line\n\nSecond line');
  });

  it('renders a location row when location text exists and clamps preview to three lines', async () => {
    let renderer: any = null;

    mockNotesQueries({
      baseItems: [
        buildNote({
          content: 'First line\nSecond line\nThird line\nFourth line',
          locationText: 'Window booth',
        }),
      ],
    });

    await act(async () => {
      renderer = create(
        <NotesScreen
          navigation={{
            navigate: jest.fn(),
          } as never}
          route={{} as never}
        />,
      );
    });

    const previewText = renderer?.root.findAll(
      (node: any) => node.type === 'Text' && node.props.variant === 'bodyMd',
    )[0];
    const locationText = renderer?.root.findAll(
      (node: any) => node.type === 'Text' && node.props.children === 'Window booth',
    )[0];

    expect(previewText.props.numberOfLines).toBe(3);
    expect(previewText.props.ellipsizeMode).toBe('tail');
    expect(locationText).toBeDefined();
    expect(locationText.props.numberOfLines).toBe(1);
    expect(locationText.props.variant).toBe('bodySm');
  });

  it('keeps the photo and note content top-aligned when a note has photos', async () => {
    let renderer: any = null;

    mockNotesQueries({
      baseItems: [
        buildNote({
          content: 'First line\nSecond line\nThird line\nFourth line',
          locationText: 'Window booth',
          photoPreview: {
            count: 2,
            id: 'photo_1',
            photo: 'thumb.jpg',
          },
        }),
      ],
    });

    await act(async () => {
      renderer = create(
        <NotesScreen
          navigation={{
            navigate: jest.fn(),
          } as never}
          route={{} as never}
        />,
      );
    });

    const noteContentRow = renderer?.root.findAll(
      (node: any) =>
        node.type === 'View' &&
        styleIncludes(node.props.style, {
          alignItems: 'flex-start',
          flexDirection: 'row',
          gap: theme.spacing.sm,
        }),
    )[0];
    const noteTextContent = renderer?.root.findAll(
      (node: any) =>
        node.type === 'View' &&
        styleIncludes(node.props.style, {
          flex: 1,
          justifyContent: 'flex-start',
          minHeight: 64,
        }),
    )[0];
    const photoWrap = renderer?.root.findByProps({
      accessibilityLabel: 'View photos for note note_1',
    });

    expect(noteContentRow).toBeDefined();
    expect(noteTextContent).toBeDefined();
    expect(photoWrap).toBeDefined();
    expect(
      styleIncludes(photoWrap.props.style, {
        alignSelf: 'flex-start',
        position: 'relative',
      }),
    ).toBe(true);
  });

  it('expands note previews inline while keeping the location row and actions available', async () => {
    let renderer: any = null;

    mockNotesQueries({
      baseItems: [
        buildNote({
          content: 'First line\nSecond line\nThird line',
          locationText: 'Window booth',
        }),
      ],
    });

    await act(async () => {
      renderer = create(
        <NotesScreen
          navigation={{
            navigate: jest.fn(),
          } as never}
          route={{} as never}
        />,
      );
    });

    const previewText = renderer?.root.findAll(
      (node: any) =>
        node.type === 'Text' &&
        node.props.variant === 'bodyMd' &&
        node.props.children === 'First line\nSecond line\nThird line',
    )[0];

    await act(async () => {
      previewText.props.onTextLayout({
        nativeEvent: {
          lines: [{}, {}, {}, {}],
        },
      });
    });

    await act(async () => {
      renderer?.root.findByProps({ accessibilityHint: 'Shows the full text' }).props.onPress();
    });

    const expandedPreviewText = renderer?.root.findAll(
      (node: any) =>
        node.type === 'Text' &&
        node.props.variant === 'bodyMd' &&
        node.props.children === 'First line\nSecond line\nThird line',
    )[0];
    const locationText = renderer?.root.findAll(
      (node: any) => node.type === 'Text' && node.props.children === 'Window booth',
    )[0];

    expect(expandedPreviewText.props.numberOfLines).toBeUndefined();
    expect(locationText.props.numberOfLines).toBe(1);
    expect(renderer?.root.findByProps({ testID: 'note-use-button-note_1' })).toBeDefined();
    expect(renderer?.root.findByProps({ testID: 'note-edit-button-note_1' })).toBeDefined();
    expect(renderer?.root.findByProps({ testID: 'note-delete-button-note_1' })).toBeDefined();
  });

  it('omits the location row when location text is empty and keeps the four-line preview clamp', async () => {
    let renderer: any = null;

    mockNotesQueries({
      baseItems: [
        buildNote({
          content: 'First line\nSecond line\nThird line\nFourth line\nFifth line',
          locationText: '',
        }),
      ],
    });

    await act(async () => {
      renderer = create(
        <NotesScreen
          navigation={{
            navigate: jest.fn(),
          } as never}
          route={{} as never}
        />,
      );
    });

    const previewText = renderer?.root.findAll(
      (node: any) => node.type === 'Text' && node.props.variant === 'bodyMd',
    )[0];
    const locationText = renderer?.root.findAll(
      (node: any) => node.type === 'Text' && node.props.children === '',
    );

    expect(previewText.props.numberOfLines).toBe(4);
    expect(previewText.props.ellipsizeMode).toBe('tail');
    expect(locationText).toHaveLength(0);
  });

  it('filters loaded notes immediately for one-character searches without enabling server search', async () => {
    let renderer: any = null;

    mockNotesQueries({
      baseItems: [
        buildNote({
          content: 'Alpha note',
          locationText: 'Window booth',
        }),
      ],
    });

    await act(async () => {
      renderer = create(
        <NotesScreen
          navigation={{
            navigate: jest.fn(),
          } as never}
          route={{} as never}
        />,
      );
    });

    await act(async () => {
      renderer?.root.findByType('Input').props.onChangeText('A');
    });

    const enabledSearchCalls = mockedUseInfiniteQuery.mock.calls.filter(([queryOptions]) => {
      const queryKey = (queryOptions as Record<string, any>).queryKey;
      const enabled = (queryOptions as Record<string, any>).enabled ?? true;
      return enabled && Array.isArray(queryKey) && queryKey.length === 5;
    });

    expect(renderer?.root.findByType('Input').props.value).toBe('A');
    expect(enabledSearchCalls).toHaveLength(0);
    expect(
      renderer?.root.findAll((node: any) => node.type === 'Text' && node.props.children === 'Alpha note'),
    ).toHaveLength(1);
  });

  it('keeps showing local matches while a debounced server search is loading', async () => {
    let renderer: any = null;

    mockNotesQueries({
      baseItems: [
        buildNote({
          content: 'Alpha note',
          locationText: 'Window booth',
        }),
      ],
      loadingSearchTerms: ['Al'],
    });

    await act(async () => {
      renderer = create(
        <NotesScreen
          navigation={{
            navigate: jest.fn(),
          } as never}
          route={{} as never}
        />,
      );
    });

    await act(async () => {
      renderer?.root.findByType('Input').props.onChangeText('Al');
    });

    await act(async () => {
      jest.advanceTimersByTime(250);
    });

    expect(
      renderer?.root.findAll((node: any) => node.type === 'Text' && node.props.children === 'Alpha note'),
    ).toHaveLength(1);
    expect(renderer?.root.findAllByType('EmptyState')).toHaveLength(0);
  });

  it('switches from local matches to debounced server-backed results once search resolves', async () => {
    let renderer: any = null;

    mockNotesQueries({
      baseItems: [
        buildNote({
          id: 'local_note',
          content: 'Cab ride',
          locationText: 'Booth seat',
        }),
      ],
      searchItemsByTerm: {
        bo: [
          buildNote({
            id: 'server_note',
            content: 'Bo server result',
          }),
        ],
      },
    });

    await act(async () => {
      renderer = create(
        <NotesScreen
          navigation={{
            navigate: jest.fn(),
          } as never}
          route={{} as never}
        />,
      );
    });

    await act(async () => {
      renderer?.root.findByType('Input').props.onChangeText('bo');
    });

    expect(
      renderer?.root.findAll((node: any) => node.type === 'Text' && node.props.children === 'Cab ride'),
    ).toHaveLength(1);

    await act(async () => {
      jest.advanceTimersByTime(250);
    });

    expect(
      renderer?.root.findAll((node: any) => node.type === 'Text' && node.props.children === 'Cab ride'),
    ).toHaveLength(0);
    expect(
      renderer?.root.findAll((node: any) => node.type === 'Text' && node.props.children === 'Bo server result'),
    ).toHaveLength(1);
  });

  it('matches the visible location field during immediate local search', async () => {
    let renderer: any = null;

    mockNotesQueries({
      baseItems: [
        buildNote({
          content: 'Alpha note',
          locationText: 'Window booth',
        }),
      ],
    });

    await act(async () => {
      renderer = create(
        <NotesScreen
          navigation={{
            navigate: jest.fn(),
          } as never}
          route={{} as never}
        />,
      );
    });

    await act(async () => {
      renderer?.root.findByType('Input').props.onChangeText('booth');
    });

    expect(
      renderer?.root.findAll((node: any) => node.type === 'Text' && node.props.children === 'Alpha note'),
    ).toHaveLength(1);
    expect(
      renderer?.root.findAll((node: any) => node.type === 'Text' && node.props.children === 'Window booth'),
    ).toHaveLength(1);
  });

  it('keeps showing local matches when debounced server results are unfiltered', async () => {
    let renderer: any = null;

    mockNotesQueries({
      baseItems: [
        buildNote({
          id: 'local_match',
          content: 'Alpha note',
          locationText: 'Window booth',
        }),
      ],
      searchItemsByTerm: {
        al: [
          buildNote({
            id: 'server_mismatch',
            content: 'Completely unrelated',
            locationText: 'Somewhere else',
          }),
        ],
      },
    });

    await act(async () => {
      renderer = create(
        <NotesScreen
          navigation={{
            navigate: jest.fn(),
          } as never}
          route={{} as never}
        />,
      );
    });

    await act(async () => {
      renderer?.root.findByType('Input').props.onChangeText('al');
    });

    await act(async () => {
      jest.advanceTimersByTime(250);
    });

    expect(
      renderer?.root.findAll((node: any) => node.type === 'Text' && node.props.children === 'Alpha note'),
    ).toHaveLength(1);
    expect(
      renderer?.root.findAll((node: any) => node.type === 'Text' && node.props.children === 'Completely unrelated'),
    ).toHaveLength(0);
    expect(mockedTrackObservabilityEvent).toHaveBeenCalledWith(
      'NOTES_SEARCH_RESULTS_REJECTED',
      expect.objectContaining({
        source: 'NotesScreen',
        activeFilter: 'unused',
        noteStatusFilter: 'draft',
        searchTermLength: 2,
        returnedItemCount: 1,
        hasNonMatchingItem: true,
      }),
    );
  });

  it('keeps the empty search state and base badge counts when stale server results are rejected', async () => {
    let renderer: any = null;

    mockNotesQueries({
      baseItems: [
        buildNote({
          id: 'draft_note',
          content: 'Alpha note',
          status: 'draft',
        }),
        buildNote({
          id: 'used_note',
          content: 'Bravo note',
          status: 'used',
        }),
      ],
      searchItemsByTerm: {
        zz: [
          buildNote({
            id: 'search_draft_1',
            content: 'Alpha note',
            status: 'draft',
          }),
          buildNote({
            id: 'search_draft_2',
            content: 'Bravo note',
            status: 'draft',
          }),
        ],
      },
    });

    await act(async () => {
      renderer = create(
        <NotesScreen
          navigation={{
            navigate: jest.fn(),
          } as never}
          route={{} as never}
        />,
      );
    });

    await act(async () => {
      renderer?.root.findByType('Input').props.onChangeText('zz');
    });

    await act(async () => {
      jest.advanceTimersByTime(250);
    });

    const emptyState = renderer?.root.findByType('EmptyState');
    const filterOptions = renderer?.root.findByType('MockSegmentedControl').props.options;

    expect(emptyState.props.title).toBe('No matching notes');
    expect(emptyState.props.tone).toBe('muted');
    expect(filterOptions).toEqual([
      expect.objectContaining({ value: 'unused', badgeCount: 1 }),
      expect.objectContaining({ value: 'used', badgeCount: 1 }),
      expect.objectContaining({ value: 'all', badgeCount: 2 }),
    ]);
  });

  it('renders the normal notes empty state with muted tone', async () => {
    let renderer: any = null;

    mockNotesQueries({
      baseItems: [],
    });

    await act(async () => {
      renderer = create(
        <NotesScreen
          navigation={{
            navigate: jest.fn(),
          } as never}
          route={{} as never}
        />,
      );
    });

    const emptyState = renderer?.root.findByType('EmptyState');

    expect(emptyState.props.title).toBe('Nothing to show');
    expect(emptyState.props.tone).toBe('muted');
  });

  it('keeps the notes list refreshing prop active until the refetch lifecycle settles', async () => {
    const refetchDeferred = createDeferred<{
      data: {
        pages: { items: Record<string, unknown>[] }[];
      };
    }>();
    const baseQueryResult = buildNotesQueryResult([buildNote()], {
      isRefetching: false,
      refetch: jest.fn(() => refetchDeferred.promise),
    });
    const disabledSearchQueryResult = buildDisabledNotesQueryResult();
    mockedUseInfiniteQuery.mockImplementation((queryOptions: Record<string, any>) =>
      queryOptions.enabled === false ? disabledSearchQueryResult : baseQueryResult,
    );

    const navigation = {
      navigate: jest.fn(),
    };
    const route = {};
    let renderer: any = null;

    await act(async () => {
      renderer = create(<NotesScreen navigation={navigation as never} route={route as never} />);
    });

    const findRefreshableScaffold = () => renderer.root.findByType('FeatureDetailScreenScaffold');

    expect(findRefreshableScaffold().props.refreshing).toBe(false);
    expect(renderer.root.findAllByType('FlatList')).toHaveLength(0);

    let refreshPromise: Promise<unknown> | null = null;
    act(() => {
      refreshPromise = findRefreshableScaffold().props.onRefresh();
    });

    expect(findRefreshableScaffold().props.refreshing).toBe(true);

    await act(async () => {
      baseQueryResult.isRefetching = true;
      renderer.update(<NotesScreen navigation={navigation as never} route={route as never} />);
      await Promise.resolve();
    });

    expect(findRefreshableScaffold().props.refreshing).toBe(true);

    await act(async () => {
      refetchDeferred.resolve({
        data: {
          pages: [{ items: [buildNote()] }],
        },
      });
      await refreshPromise;
    });

    expect(findRefreshableScaffold().props.refreshing).toBe(true);

    await act(async () => {
      baseQueryResult.isRefetching = false;
      renderer.update(<NotesScreen navigation={navigation as never} route={route as never} />);
      await Promise.resolve();
    });

    expect(findRefreshableScaffold().props.refreshing).toBe(false);
  });
});
