import React from 'react';
import { act, create } from 'react-test-renderer';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';

import { useOfflineAwareFeatureWrite } from '../features/store/useOfflineAwareFeatureWrite';
import { NotesScreen } from '../screens/NotesScreen';

const mockReact = React;

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

jest.mock('../theme', () => ({
  createThemedStyles: () => () => ({}),
  useTheme: () => ({
    colors: {
      text: {
        brand: 'blue',
        danger: 'red',
        inverse: 'white',
        muted: 'gray',
        primary: 'black',
      },
      background: {
        inverse: 'black',
      },
      border: {
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
      pill: 999,
    },
  }),
}));

jest.mock('../ui', () => {
  return {
    Button: (props: Record<string, unknown>) => mockReact.createElement('Button', props),
    Card: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
      mockReact.createElement('Card', props, children),
    Text: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
      mockReact.createElement('Text', props, children),
  };
});

jest.mock('../components/shared', () => {
  return {
    ConfirmDestructiveModal: () => null,
    EmptyState: (props: Record<string, unknown>) => mockReact.createElement('EmptyState', props),
    ErrorState: (props: Record<string, unknown>) => mockReact.createElement('ErrorState', props),
    FeatureDetailScreenScaffold: ({ children }: { children?: React.ReactNode }) =>
      mockReact.createElement(mockReact.Fragment, null, children),
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

describe('NotesScreen', () => {
  beforeEach(() => {
    mockedUseInfiniteQuery.mockReturnValue({
      data: {
        pages: [
          {
            items: [
              {
                id: 'note_1',
                title: 'Note 1',
                content: 'Test note',
                status: 'draft',
                createdAt: '2026-03-01T00:00:00.000Z',
                updatedAt: '2026-03-02T00:00:00.000Z',
              },
            ],
            summary: {
              allCount: 1,
              draftCount: 1,
              usedCount: 0,
            },
            page: 1,
            pageSize: 20,
            totalItems: 1,
            totalPages: 1,
            hasNextPage: false,
          },
        ],
        pageParams: [1],
      },
      isError: false,
      isFetching: false,
      isLoading: false,
      isSuccess: true,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: jest.fn(),
      refetch: jest.fn(),
    } as unknown as ReturnType<typeof useInfiniteQuery>);
    mockedUseQueryClient.mockReturnValue({
      fetchQuery: jest.fn(),
      invalidateQueries: jest.fn(),
    } as unknown as ReturnType<typeof useQueryClient>);
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(jest.fn() as ReturnType<typeof useOfflineAwareFeatureWrite>);
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
});
