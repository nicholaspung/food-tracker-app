import React from 'react';
import { act, create } from 'react-test-renderer';

import { RestaurantDiscoveryScreen } from '../screens/RestaurantDiscoveryScreen';
import { extractRestaurantNamesFromImage } from '../features';
import { useRestaurantSelectionFlow } from '../hooks/useRestaurantSelectionFlow';
import { useImageSourcePicker } from '../hooks/useImageSourcePicker';
import { stageLocalPhotoFile } from '../lib/photoStaging';

const mockReact = React;
const mockNavigate = jest.fn();
const mockSearchNearby = jest.fn();
const mockClearPlacesSearchState = jest.fn();
const mockSearchByText = jest.fn();
const mockSetIsSearchExpanded = jest.fn();
const mockSetSearchQuery = jest.fn();
const mockPickImageAssets = jest.fn();

jest.mock('@expo/vector-icons', () => ({
  Ionicons: (props: Record<string, unknown>) => mockReact.createElement('Ionicons', props),
}));

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(),
}));

jest.mock('react-native', () => ({
  Linking: {
    openSettings: jest.fn(),
  },
  Pressable: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Pressable', props, children),
  View: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('View', props, children),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: jest.fn(() => ({
    invalidateQueries: jest.fn(),
  })),
}));

jest.mock('../components/shared', () => ({
  BackHeaderScreenScaffold: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('BackHeaderScreenScaffold', props, children),
  LoadingState: (props: Record<string, unknown>) => mockReact.createElement('LoadingState', props),
  PageErrorToast: (props: Record<string, unknown>) => mockReact.createElement('PageErrorToast', props),
  PhotoSourceActionCards: (props: Record<string, unknown>) => mockReact.createElement('PhotoSourceActionCards', props),
  SegmentedControl: (props: Record<string, unknown>) => mockReact.createElement('SegmentedControl', props),
  VisitRestaurantOptionTrailing: (props: Record<string, unknown>) =>
    mockReact.createElement('VisitRestaurantOptionTrailing', props),
  VisitRestaurantSearchHeaderToggle: (props: Record<string, unknown>) =>
    mockReact.createElement('VisitRestaurantSearchHeaderToggle', props),
  VisitRestaurantSearchOptionDescription: (props: Record<string, unknown>) =>
    mockReact.createElement('VisitRestaurantSearchOptionDescription', props),
  VisitRestaurantSearchSection: (props: Record<string, unknown>) =>
    mockReact.createElement('VisitRestaurantSearchSection', props),
}));

jest.mock('../features', () => ({
  extractRestaurantNamesFromImage: jest.fn(),
  formatLimitExceededMessage: jest.fn((payload) => payload.message),
  parseLimitExceededError: jest.fn(() => null),
  useMonthlyUsage: jest.fn(() => ({
    snapshot: {
      remaining: {
        placesQueriesMonthly: 10,
      },
    },
  })),
}));

jest.mock('../hooks/useImageSourcePicker', () => ({
  useImageSourcePicker: jest.fn(() => ({
    permissionNeedsSettings: false,
    pickImageAssets: mockPickImageAssets,
  })),
}));

jest.mock('../hooks/useRestaurantSelectionFlow', () => ({
  useRestaurantSelectionFlow: jest.fn(),
}));

jest.mock('../lib/photoStaging', () => ({
  cleanupStagedPhotoFiles: jest.fn(),
  stageLocalPhotoFile: jest.fn(),
}));

jest.mock('../observability', () => ({
  trackObservabilityEvent: jest.fn(),
}));

jest.mock('../providers/AuthProvider', () => ({
  useAuth: jest.fn(() => ({
    actualUser: { isAdmin: false },
    user: { isAdmin: false, isSubscriber: false },
  })),
}));

jest.mock('../providers/ConnectivityProvider', () => ({
  useConnectivity: jest.fn(() => ({
    isOnline: true,
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
              warningBg: 'warning-bg',
              warningBorder: 'warning-border',
            },
            text: {
              info: 'info',
            },
          },
          radii: { md: 8 },
          spacing: { md: 16, sm: 8, xs: 4, xxs: 2 },
        },
        ...args,
      ),
  useTheme: jest.fn(() => ({
    colors: {
      text: {
        info: 'info',
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

const mockedUseRestaurantSelectionFlow = useRestaurantSelectionFlow as jest.MockedFunction<
  typeof useRestaurantSelectionFlow
>;
const mockedUseImageSourcePicker = useImageSourcePicker as jest.MockedFunction<typeof useImageSourcePicker>;
const mockedExtractRestaurantNamesFromImage = extractRestaurantNamesFromImage as jest.MockedFunction<
  typeof extractRestaurantNamesFromImage
>;
const mockedStageLocalPhotoFile = stageLocalPhotoFile as jest.MockedFunction<typeof stageLocalPhotoFile>;

describe('RestaurantDiscoveryScreen', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockSearchNearby.mockReset();
    mockSearchNearby.mockResolvedValue({ results: [], status: 'success' });
    mockClearPlacesSearchState.mockReset();
    mockSearchByText.mockReset();
    mockSearchByText.mockResolvedValue(undefined);
    mockSetIsSearchExpanded.mockReset();
    mockSetSearchQuery.mockReset();
    mockPickImageAssets.mockReset();
    mockPickImageAssets.mockResolvedValue({
      assets: [{ uri: 'file:///storefront.jpg' }],
      status: 'selected',
    });
    mockedUseImageSourcePicker.mockReturnValue({
      permissionNeedsSettings: false,
      pickImageAssets: mockPickImageAssets,
    } as never);
    mockedExtractRestaurantNamesFromImage.mockReset();
    mockedStageLocalPhotoFile.mockReset();
    mockedStageLocalPhotoFile.mockResolvedValue({ uri: 'file:///staged-storefront.jpg' } as never);
    mockedUseRestaurantSelectionFlow.mockReturnValue({
      clearPlacesSearchState: mockClearPlacesSearchState,
      compactSearchLabel: 'Search',
      displayedNearbyRestaurants: [],
      displayedSavedRestaurants: [
        {
          distance: null,
          restaurant: {
            id: 'restaurant-1',
            name: 'Erewhon West Hollywood',
            location: 'West Hollywood, CA',
            cuisineType: 'Cafe',
            userVisitCount: 1,
          },
        },
      ],
      expandedSearchLabel: 'Search Food Places',
      isGettingLocation: false,
      isPlacesQuotaReached: false,
      isSearchExpanded: true,
      isSearchingNearbyRestaurants: false,
      isSearchingRestaurants: false,
      loadedRestaurantRecords: [],
      locationPermissionNeedsSettings: false,
      manualLocation: 'Tokyo',
      menuItemsQuery: {} as never,
      placesQueriesRemaining: 10,
      resetLocationPermissionNeedsSettings: jest.fn(),
      resetRestaurantSelectionFlow: jest.fn(),
      savedEmptyDescription: 'No restaurants.',
      savedEmptyTitle: 'No restaurants',
      savedRestaurantRecords: [],
      savedRestaurantsErrorMessage: null,
      savedRestaurantsLoading: false,
      savedRestaurantsTitle: 'Recent restaurants',
      searchButtonDisabled: false,
      searchByText: mockSearchByText,
      searchErrorMessage: null,
      searchNearby: mockSearchNearby,
      searchQuery: 'ramen',
      setIsSearchExpanded: mockSetIsSearchExpanded,
      setManualLocation: jest.fn(),
      setSearchQuery: mockSetSearchQuery,
      shouldEnforceUsageLimitsClientSide: true,
      shouldQuerySavedRestaurantsBySearch: false,
      shouldShowPlacesUpgradePrompt: false,
      showNearbyPlaces: false,
      triggerSavedRestaurantsRefetch: jest.fn(),
    } as unknown as ReturnType<typeof useRestaurantSelectionFlow>);
  });

  function renderScreen() {
    let renderer: any;
    act(() => {
      renderer = create(
        <RestaurantDiscoveryScreen
          navigation={{ navigate: mockNavigate, goBack: jest.fn() } as never}
          route={{ key: 'discovery', name: 'RestaurantDiscovery' } as never}
        />,
      );
    });

    return renderer;
  }

  function switchDiscoveryTab(renderer: any, tab: 'search' | 'scan') {
    act(() => {
      renderer.root.findByType('SegmentedControl').props.onChange(tab);
    });
  }

  it('navigates selected restaurants to the discovery restaurant detail screen', () => {
    const renderer = renderScreen();

    const searchSection = renderer.root.findByType('VisitRestaurantSearchSection');
    searchSection.props.savedOptions[0].onPress();

    expect(mockNavigate).toHaveBeenCalledWith(
      'RestaurantDiscoveryRestaurant',
      expect.objectContaining({
        restaurantId: 'restaurant-1',
        restaurantName: 'Erewhon West Hollywood',
      }),
    );
  });

  it('places add new restaurant in the expanded search footer with detail return target', () => {
    const renderer = renderScreen();

    const searchSection = renderer.root.findByType('VisitRestaurantSearchSection');
    const footer = searchSection.props.footerContent;
    let footerRenderer: any;
    act(() => {
      footerRenderer = create(footer);
    });
    footerRenderer.root.findByProps({ testID: 'restaurant-discovery-add-restaurant-link' }).props.onPress();

    expect(mockNavigate).toHaveBeenCalledWith('CreateVisitAddRestaurant', {
      initialLocation: 'Tokyo',
      initialRestaurantName: 'ramen',
      returnTo: 'RestaurantDiscoveryRestaurant',
    });
  });

  it('opens on the Search tab by default', () => {
    const renderer = renderScreen();

    expect(renderer.root.findByType('SegmentedControl').props.value).toBe('search');
    expect(renderer.root.findAllByType('VisitRestaurantSearchSection')).toHaveLength(1);
    expect(renderer.root.findAllByType('PhotoSourceActionCards')).toHaveLength(0);
    expect(renderer.root.findAllByType('Button').some((node: any) => node.props.label === 'Read a Storefront')).toBe(false);
  });

  it('shows storefront reading on the Scan tab without GPS search', () => {
    const renderer = renderScreen();

    switchDiscoveryTab(renderer, 'scan');

    expect(renderer.root.findAllByType('VisitRestaurantSearchSection')).toHaveLength(0);
    const storefrontButton = renderer.root
      .findAllByType('Button')
      .find((node: any) => node.props.label === 'Read a Storefront');
    expect(storefrontButton).toBeTruthy();
    expect(renderer.root.findAllByType('PhotoSourceActionCards')).toHaveLength(0);

    act(() => {
      storefrontButton?.props.onPress();
    });

    expect(renderer.root.findAllByType('PhotoSourceActionCards')).toHaveLength(1);
    expect(mockSearchNearby).not.toHaveBeenCalled();
  });

  it('searches extracted restaurant names and returns to the Search tab', async () => {
    mockedExtractRestaurantNamesFromImage.mockResolvedValueOnce({
      found: true,
      options: [
        {
          confidence: 'high',
          name: 'Sushi Ginza',
          reason: 'The storefront sign is visible.',
        },
      ],
    } as never);
    const renderer = renderScreen();

    switchDiscoveryTab(renderer, 'scan');
    act(() => {
      renderer.root.findAllByType('Button').find((node: any) => node.props.label === 'Read a Storefront')?.props.onPress();
    });
    await act(async () => {
      await renderer.root.findByType('PhotoSourceActionCards').props.onGalleryPress();
    });

    const possibleName = renderer.root.findByType('ListItem');
    let descriptionRenderer: any;
    act(() => {
      descriptionRenderer = create(possibleName.props.description);
    });
    await act(async () => {
      await descriptionRenderer.root
        .findAllByType('Button')
        .find((node: any) => node.props.label === 'Search')
        ?.props.onPress();
    });

    expect(mockSetSearchQuery).toHaveBeenCalledWith('Sushi Ginza');
    expect(mockSetIsSearchExpanded).toHaveBeenCalledWith(true);
    expect(mockSearchByText).toHaveBeenCalledWith({ queryOverride: 'Sushi Ginza' });
    expect(renderer.root.findByType('SegmentedControl').props.value).toBe('search');
    expect(renderer.root.findAllByType('VisitRestaurantSearchSection')).toHaveLength(1);
  });

  it('keeps scan results when search results are cleared', async () => {
    mockedExtractRestaurantNamesFromImage.mockResolvedValueOnce({
      found: true,
      options: [
        {
          confidence: 'medium',
          name: 'Cafe Luna',
        },
      ],
    } as never);
    const renderer = renderScreen();

    switchDiscoveryTab(renderer, 'scan');
    act(() => {
      renderer.root.findAllByType('Button').find((node: any) => node.props.label === 'Read a Storefront')?.props.onPress();
    });
    await act(async () => {
      await renderer.root.findByType('PhotoSourceActionCards').props.onGalleryPress();
    });
    expect(renderer.root.findByProps({ title: 'Cafe Luna' })).toBeTruthy();

    switchDiscoveryTab(renderer, 'search');
    const searchSection = renderer.root.findByType('VisitRestaurantSearchSection');
    act(() => {
      searchSection.props.onClearSearchResults();
    });
    expect(mockClearPlacesSearchState).toHaveBeenCalledTimes(1);

    switchDiscoveryTab(renderer, 'scan');
    expect(renderer.root.findByProps({ title: 'Cafe Luna' })).toBeTruthy();
  });
});
