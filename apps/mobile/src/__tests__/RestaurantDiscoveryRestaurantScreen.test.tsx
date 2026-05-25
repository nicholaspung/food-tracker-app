import React from 'react';
import { act, create } from 'react-test-renderer';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { RestaurantDiscoveryRestaurantScreen } from '../screens/RestaurantDiscoveryRestaurantScreen';
import { menuItemsQueryKeys } from '../features/store/menuItemsQuery';

const mockReact = React;
const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
let mockIsOnline = true;
const mockScanMenu = jest.fn();
const mockUseMenuScanFlow = jest.fn();

jest.mock('@expo/vector-icons', () => ({
  Ionicons: (props: Record<string, unknown>) => mockReact.createElement('Ionicons', props),
}));

jest.mock('react-native', () => ({
  Linking: {
    openSettings: jest.fn(),
  },
  View: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('View', props, children),
}));

jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn(),
  useQueryClient: jest.fn(),
}));

jest.mock('../components/shared', () => ({
  EmptyState: (props: Record<string, unknown>) => mockReact.createElement('EmptyState', props),
  FeatureDetailScreenScaffold: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('FeatureDetailScreenScaffold', props, children),
  LoadingState: (props: Record<string, unknown>) => mockReact.createElement('LoadingState', props),
  PageErrorToast: (props: Record<string, unknown>) => mockReact.createElement('PageErrorToast', props),
  PhotoSourceActionCards: (props: Record<string, unknown>) => mockReact.createElement('PhotoSourceActionCards', props),
  SegmentedControl: (props: Record<string, unknown>) => mockReact.createElement('SegmentedControl', props),
  VisitRestaurantOptionTrailing: (props: Record<string, unknown>) =>
    mockReact.createElement('VisitRestaurantOptionTrailing', props),
}));

jest.mock('../features', () => ({
  useMenuScanFlow: (...args: unknown[]) => mockUseMenuScanFlow(...args),
}));

jest.mock('../features/store/restaurantsStore', () => ({
  getSameNameRestaurantHistory: jest.fn(),
  listMenuItemsForRestaurant: jest.fn(),
}));

jest.mock('../hooks/useImageSourcePicker', () => ({
  useImageSourcePicker: jest.fn(() => ({
    permissionNeedsSettings: false,
    pickImageAssets: jest.fn(),
  })),
}));

jest.mock('../lib/photoStaging', () => ({
  cleanupStagedPhotoFiles: jest.fn(),
  stageLocalPhotoFile: jest.fn(),
}));

jest.mock('../lib/visitRestaurantSearch', () => ({
  buildVisitRestaurantDescription: jest.fn((restaurant) => [restaurant.location, restaurant.cuisineType].filter(Boolean).join(' • ')),
}));

jest.mock('../observability', () => ({
  trackObservabilityEvent: jest.fn(),
}));

jest.mock('../providers/ConnectivityProvider', () => ({
  useConnectivity: jest.fn(() => ({
    isOnline: mockIsOnline,
  })),
}));

jest.mock('../theme', () => ({
  createThemedStyles:
    (factory: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) =>
      factory(
        {
          colors: {
            status: {
              successBg: 'success-bg',
              successBorder: 'success-border',
              warningBg: 'warning-bg',
              warningBorder: 'warning-border',
            },
            text: {
              brand: 'brand',
              info: 'info',
              success: 'success',
            },
          },
          radii: { md: 8 },
          spacing: { md: 16, sm: 8, xs: 4 },
        },
        ...args,
      ),
  useTheme: jest.fn(() => ({
    colors: {
      text: {
        brand: 'brand',
        info: 'info',
        success: 'success',
      },
    },
  })),
}));

jest.mock('../ui', () => ({
  Button: (props: Record<string, unknown>) => mockReact.createElement('Button', props),
  Card: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Card', props, children),
  ListItem: (props: Record<string, unknown>) => mockReact.createElement('ListItem', props),
  Text: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Text', props, children),
}));

const mockedUseQuery = useQuery as jest.MockedFunction<typeof useQuery>;
const mockedUseQueryClient = useQueryClient as jest.MockedFunction<typeof useQueryClient>;

function renderScreen() {
  let renderer: any;
  act(() => {
    renderer = create(
      <RestaurantDiscoveryRestaurantScreen
        navigation={{ navigate: mockNavigate, goBack: mockGoBack } as never}
        route={{
          key: 'restaurant-detail',
          name: 'RestaurantDiscoveryRestaurant',
          params: {
            cuisineType: 'Cafe',
            friendCount: 2,
            isGooglePlace: true,
            location: 'West Hollywood, CA',
            restaurantId: 'restaurant-1',
            restaurantName: 'Erewhon West Hollywood',
            userVisitCount: 1,
          },
        }}
      />,
    );
  });
  return renderer;
}

describe('RestaurantDiscoveryRestaurantScreen', () => {
  beforeEach(() => {
    mockIsOnline = true;
    mockNavigate.mockReset();
    mockGoBack.mockReset();
    mockedUseQueryClient.mockReturnValue({
      getQueryData: jest.fn(),
      invalidateQueries: jest.fn(),
      setQueryData: jest.fn(),
    } as never);
    mockedUseQuery.mockImplementation((options: any) => {
      const queryKey = options.queryKey as readonly unknown[];
      if (queryKey.includes('sameNameHistory')) {
        return {
          data: {
            anchorRestaurant: {
              id: 'restaurant-1',
              name: 'Erewhon West Hollywood',
            },
            itemCount: 0,
            items: [],
            locationCount: 1,
            normalizedName: 'erewhon west hollywood',
            restaurants: [],
            visitCount: 0,
          },
          isError: false,
          isLoading: false,
          refetch: jest.fn(),
        } as never;
      }

      return {
        data: [],
        isError: false,
        isLoading: false,
        refetch: jest.fn(),
      } as never;
    });
    mockScanMenu.mockReset();
    mockUseMenuScanFlow.mockReset();
    mockUseMenuScanFlow.mockReturnValue({
      createdItemNames: [],
      errorMessage: null,
      existingItemNames: [],
      lastRequestedSource: 'gallery',
      permissionNeedsSettings: false,
      reset: jest.fn(),
      scanMenu: mockScanMenu,
      selectedImageName: '',
      status: 'idle',
      verification: null,
    });
  });

  it('renders restaurant context and queries restaurant-scoped menu items', () => {
    const renderer = renderScreen();

    const scaffold = renderer.root.findByType('FeatureDetailScreenScaffold');
    expect(scaffold.props.title).toBe('Erewhon West Hollywood');
    expect(scaffold.props.subtitle).toContain('West Hollywood, CA • Cafe');
    expect(scaffold.props.subtitle).toContain('You: 1 visit');
    expect(scaffold.props.subtitle).toContain('Friends: 2 friends');
    expect(scaffold.props.subtitle).toContain('Google place');
    expect(scaffold.props.rightAccessory).toBeTruthy();
    expect(renderer.root.findAllByType('Card')).toHaveLength(2);
    expect(renderer.root.findAllByType('SegmentedControl')).toHaveLength(0);
    expect(mockedUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: menuItemsQueryKeys.restaurant('restaurant-1'),
      }),
    );
    expect(renderer.root.findByType('EmptyState').props.title).toBe('No menu items yet');
  });

  it('disables scan menu items while offline', () => {
    mockIsOnline = false;
    const renderer = renderScreen();

    const scanButton = renderer.root
      .findAllByType('Button')
      .find((node: any) => node.props.label === 'Scan Menu Items');

    expect(scanButton?.props.disabled).toBe(true);
  });

  it('delegates menu photo source actions to the shared menu scan flow', () => {
    const renderer = renderScreen();

    const scanButton = renderer.root
      .findAllByType('Button')
      .find((node: any) => node.props.label === 'Scan Menu Items');

    act(() => {
      scanButton?.props.onPress();
    });

    const photoSourceActions = renderer.root.findByType('PhotoSourceActionCards');
    act(() => {
      photoSourceActions.props.onCameraPress();
    });

    expect(mockUseMenuScanFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        analyticsSource: 'FoodDiscoveryRestaurant',
        restaurantId: 'restaurant-1',
        restaurantName: 'Erewhon West Hollywood',
      }),
    );
    expect(mockScanMenu).toHaveBeenCalledWith('camera');
  });

  it('reads menu scan errors from the shared menu scan flow', () => {
    mockUseMenuScanFlow.mockReturnValue({
      createdItemNames: [],
      errorMessage: 'failed to parse menu with Gemini',
      existingItemNames: [],
      lastRequestedSource: 'gallery',
      permissionNeedsSettings: false,
      reset: jest.fn(),
      scanMenu: mockScanMenu,
      selectedImageName: '',
      status: 'error',
      verification: null,
    });

    const renderer = renderScreen();

    expect(renderer.root.findByType('PageErrorToast').props.errorMessage).toBe(
      'failed to parse menu with Gemini',
    );
  });

  it('shows all locations scope when same-name history spans multiple locations', () => {
    mockedUseQuery.mockImplementation((options: any) => {
      const queryKey = options.queryKey as readonly unknown[];
      if (queryKey.includes('sameNameHistory')) {
        return {
          data: {
            anchorRestaurant: {
              id: 'restaurant-1',
              name: 'Erewhon West Hollywood',
            },
            itemCount: 2,
            items: [
              {
                averageRating: 4.5,
                displayName: 'Tonic Bar Smoothie',
                latestRating: 5,
                latestRestaurantId: 'restaurant-2',
                latestRestaurantLocation: 'Venice, CA',
                latestRestaurantName: 'Erewhon West Hollywood',
                latestVisitedAt: '2026-04-05T18:30:00.000Z',
                normalizedItemName: 'tonic bar smoothie',
                orderCount: 2,
                restaurants: [],
              },
            ],
            latestVisitedAt: '2026-04-05T18:30:00.000Z',
            locationCount: 2,
            normalizedName: 'erewhon west hollywood',
            restaurants: [],
            visitCount: 3,
          },
          isError: false,
          isLoading: false,
          refetch: jest.fn(),
        } as never;
      }

      return {
        data: [],
        isError: false,
        isLoading: false,
        refetch: jest.fn(),
      } as never;
    });
    const renderer = renderScreen();

    const segmentedControl = renderer.root.findByType('SegmentedControl');
    expect(segmentedControl.props.options).toEqual([
      { label: 'This Location', value: 'location' },
      { label: 'All Locations', value: 'allLocations' },
    ]);

    act(() => {
      segmentedControl.props.onChange('allLocations');
    });

    const listItem = renderer.root.findByType('ListItem');
    expect(renderer.root.findAllByType('Text').some((node: any) => node.props.children === 'Ordered Across Locations')).toBe(true);
    expect(listItem.props.title).toBe('Tonic Bar Smoothie');
  });

  it('renders a retryable all locations error without blocking the screen', () => {
    const refetch = jest.fn();
    mockedUseQuery.mockImplementation((options: any) => {
      const queryKey = options.queryKey as readonly unknown[];
      if (queryKey.includes('sameNameHistory')) {
        return {
          data: {
            anchorRestaurant: {
              id: 'restaurant-1',
              name: 'Erewhon West Hollywood',
            },
            itemCount: 0,
            items: [],
            locationCount: 2,
            normalizedName: 'erewhon west hollywood',
            restaurants: [],
            visitCount: 1,
          },
          isError: true,
          isLoading: false,
          refetch,
        } as never;
      }

      return {
        data: [],
        isError: false,
        isLoading: false,
        refetch: jest.fn(),
      } as never;
    });
    const renderer = renderScreen();

    act(() => {
      renderer.root.findByType('SegmentedControl').props.onChange('allLocations');
    });

    expect(renderer.root.findByProps({ title: 'Orders unavailable' }).props.errorMessage).toBe(
      'Could not load orders across locations.',
    );
    expect(renderer.root.findByType('FeatureDetailScreenScaffold').props.title).toBe('Erewhon West Hollywood');
  });
});
