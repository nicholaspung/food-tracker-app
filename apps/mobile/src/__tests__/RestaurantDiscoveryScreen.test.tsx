import React from 'react';
import { act, create } from 'react-test-renderer';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { RestaurantDiscoveryScreen } from '../screens/RestaurantDiscoveryScreen';
import { extractRestaurantNamesFromImage, parseLimitExceededError } from '../features';
import { useRestaurantDiscoverySelectionFlow } from '../hooks/useRestaurantSelectionFlow';
import { useImageSourcePicker } from '../hooks/useImageSourcePicker';
import { cleanupStagedPhotoFiles, stageLocalPhotoFile } from '../lib/photoStaging';
import { captureObservabilityError, trackObservabilityEvent } from '../observability';
import { useConnectivity } from '../providers/ConnectivityProvider';

const mockReact = React;
const mockNavigate = jest.fn();
const mockSearchNearby = jest.fn();
const mockSearchNearbyAt = jest.fn();
const mockClearPlacesSearchState = jest.fn();
const mockSearchByText = jest.fn();
const mockSetIsSearchExpanded = jest.fn();
const mockSetSearchQuery = jest.fn();
const mockPickImageAssets = jest.fn();
const mockInvalidateQueries = jest.fn();
const mockSaveRestaurantToDefaultList = jest.fn();
const mockSetRestaurantListWriteErrorMessage = jest.fn();

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
  useQuery: jest.fn(() => ({
    data: [],
    error: null,
    isPending: false,
  })),
  useQueryClient: jest.fn(() => ({
    invalidateQueries: mockInvalidateQueries,
  })),
}));

jest.mock('../components/shared', () => ({
  BackHeaderScreenScaffold: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('BackHeaderScreenScaffold', props, children),
  CurrentLocationButton: (props: Record<string, unknown>) => mockReact.createElement('CurrentLocationButton', props),
  LoadingState: (props: Record<string, unknown>) => mockReact.createElement('LoadingState', props),
  PageErrorToast: (props: Record<string, unknown>) => mockReact.createElement('PageErrorToast', props),
  PhotoSourceActionCards: (props: Record<string, unknown>) => mockReact.createElement('PhotoSourceActionCards', props),
  PhotoSourcePicker: (props: Record<string, unknown>) =>
    mockReact.createElement(
      'PhotoSourcePicker',
      props,
      props.hideSourceActions ? null : mockReact.createElement('PhotoSourceActionCards', props),
      props.footer as React.ReactNode,
    ),
  PhotoSourcePickerCard: (props: Record<string, unknown>) =>
    mockReact.createElement(
      'Card',
      { style: props.cardStyle, tone: props.cardTone },
      props.title as React.ReactNode,
      props.description as React.ReactNode,
      props.hideSourceActions ? null : mockReact.createElement('PhotoSourceActionCards', props),
      props.footer as React.ReactNode,
    ),
  SegmentedControl: (props: Record<string, unknown>) => mockReact.createElement('SegmentedControl', props),
  UpgradePromptCard: (props: Record<string, unknown>) => mockReact.createElement('UpgradePromptCard', props),
  VisitRestaurantOptionTrailing: (props: Record<string, unknown>) =>
    mockReact.createElement('VisitRestaurantOptionTrailing', props),
  VisitRestaurantSearchHeaderToggle: (props: Record<string, unknown>) =>
    mockReact.createElement('VisitRestaurantSearchHeaderToggle', props),
  VisitRestaurantSearchOptionDescription: (props: Record<string, unknown>) =>
    mockReact.createElement('VisitRestaurantSearchOptionDescription', props),
  VisitRestaurantSearchSection: (props: Record<string, unknown>) =>
    mockReact.createElement('VisitRestaurantSearchSection', props),
  WantToTryBookmarkButton: (props: Record<string, unknown>) =>
    mockReact.createElement('WantToTryBookmarkButton', props),
}));

jest.mock('../components/maps', () => ({
  RestaurantMapView: (props: Record<string, unknown>) => mockReact.createElement('RestaurantMapView', props),
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
  useRestaurantDiscoverySelectionFlow: jest.fn(),
}));

jest.mock('../features/store/useRestaurantListWrites', () => ({
  useRestaurantListWrites: jest.fn(() => ({
    errorMessage: null,
    isSubmitting: false,
    saveRestaurantToDefaultList: mockSaveRestaurantToDefaultList,
    setErrorMessage: mockSetRestaurantListWriteErrorMessage,
  })),
}));

jest.mock('../lib/photoStaging', () => ({
  cleanupStagedPhotoFiles: jest.fn(),
  stageLocalPhotoFile: jest.fn(),
}));

jest.mock('../lib/googlePlaces', () => ({
  calculateDistance: jest.fn((lat1: number, lng1: number, lat2: number, lng2: number) =>
    Math.hypot(lat2 - lat1, lng2 - lng1),
  ),
  formatDistance: jest.fn((miles: number) => `${miles.toFixed(1)} mi`),
}));

jest.mock('../observability', () => ({
  captureObservabilityError: jest.fn(),
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
            background: {
              app: 'app-background',
              inverse: 'inverse-background',
              muted: 'muted-background',
              surface: 'surface-background',
            },
            border: {
              default: 'default-border',
            },
            status: {
              warningBg: 'warning-bg',
              warningBorder: 'warning-border',
            },
            text: {
              info: 'info',
              muted: 'muted',
              primary: 'primary',
              secondary: 'secondary',
            },
          },
          radii: { md: 8 },
          sizes: { inputMinHeight: 48 },
          spacing: { md: 16, sm: 8, xs: 4, xxs: 2 },
        },
        ...args,
      ),
  useTheme: jest.fn(() => ({
    colors: {
      text: {
        info: 'info',
        secondary: 'secondary',
      },
    },
    spacing: { lg: 24, sm: 8 },
  })),
}));

jest.mock('../ui', () => ({
  Button: (props: Record<string, unknown>) => mockReact.createElement('Button', props),
  Card: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Card', props, children),
  Input: (props: Record<string, unknown>) => mockReact.createElement('Input', props),
  ListItem: (props: Record<string, unknown>) => mockReact.createElement('ListItem', props),
  Text: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Text', props, children),
}));

const mockedUseRestaurantSelectionFlow = useRestaurantDiscoverySelectionFlow as jest.MockedFunction<
  typeof useRestaurantDiscoverySelectionFlow
>;
const mockedUseImageSourcePicker = useImageSourcePicker as jest.MockedFunction<typeof useImageSourcePicker>;
const mockedExtractRestaurantNamesFromImage = extractRestaurantNamesFromImage as jest.MockedFunction<
  typeof extractRestaurantNamesFromImage
>;
const mockedParseLimitExceededError = parseLimitExceededError as jest.MockedFunction<typeof parseLimitExceededError>;
const mockedStageLocalPhotoFile = stageLocalPhotoFile as jest.MockedFunction<typeof stageLocalPhotoFile>;
const mockedCleanupStagedPhotoFiles = cleanupStagedPhotoFiles as jest.MockedFunction<typeof cleanupStagedPhotoFiles>;
const mockedCaptureObservabilityError = captureObservabilityError as jest.MockedFunction<
  typeof captureObservabilityError
>;
const mockedTrackObservabilityEvent = trackObservabilityEvent as jest.MockedFunction<typeof trackObservabilityEvent>;
const mockedUseConnectivity = useConnectivity as jest.MockedFunction<typeof useConnectivity>;
const mockedUseQueryClient = useQueryClient as jest.MockedFunction<typeof useQueryClient>;
const mockedUseQuery = useQuery as jest.MockedFunction<typeof useQuery>;

describe('RestaurantDiscoveryScreen', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockSearchNearby.mockReset();
    mockSearchNearby.mockResolvedValue({ results: [], status: 'success' });
    mockSearchNearbyAt.mockReset();
    mockSearchNearbyAt.mockResolvedValue({ results: [], status: 'success' });
    mockClearPlacesSearchState.mockReset();
    mockSearchByText.mockReset();
    mockSearchByText.mockResolvedValue(undefined);
    mockSetIsSearchExpanded.mockReset();
    mockSetSearchQuery.mockReset();
    mockPickImageAssets.mockReset();
    mockPickImageAssets.mockResolvedValue({
      assets: [{ uri: 'file:///storefront.jpg' }],
      status: 'success',
    });
    mockInvalidateQueries.mockReset();
    mockSaveRestaurantToDefaultList.mockReset();
    mockSaveRestaurantToDefaultList.mockResolvedValue({ status: 'completed', result: [] });
    mockSetRestaurantListWriteErrorMessage.mockReset();
    mockedUseQuery.mockReset();
    mockedUseQuery.mockReturnValue({
      data: [],
      error: null,
      isPending: false,
    } as never);
    mockedUseQueryClient.mockReturnValue({
      invalidateQueries: mockInvalidateQueries,
    } as never);
    mockedUseImageSourcePicker.mockReturnValue({
      permissionNeedsSettings: false,
      pickImageAssets: mockPickImageAssets,
    } as never);
    mockedExtractRestaurantNamesFromImage.mockReset();
    mockedParseLimitExceededError.mockReset();
    mockedParseLimitExceededError.mockReturnValue(null);
    mockedStageLocalPhotoFile.mockReset();
    mockedStageLocalPhotoFile.mockResolvedValue({
      mimeType: 'image/jpeg',
      name: 'staged-storefront.jpg',
      uri: 'file:///staged-storefront.jpg',
    } as never);
    mockedCleanupStagedPhotoFiles.mockReset();
    mockedCleanupStagedPhotoFiles.mockResolvedValue(undefined);
    mockedCaptureObservabilityError.mockReset();
    mockedTrackObservabilityEvent.mockReset();
    mockedUseConnectivity.mockReturnValue({
      isOnline: true,
    } as never);
    mockedUseRestaurantSelectionFlow.mockReturnValue({
      quotaDisplay: {
        isPlacesQuotaReached: false,
        placesQueriesRemaining: 10,
        shouldShowPlacesUpgradePrompt: false,
      },
      savedSuggestions: {
        displayedSavedRestaurants: [
          {
            distance: null,
            restaurant: {
              id: 'restaurant-1',
              name: 'Erewhon West Hollywood',
              location: 'West Hollywood, CA',
              cuisineType: 'Cafe',
              latitude: 34.09,
              longitude: -118.36,
              userVisitCount: 1,
            },
          },
        ],
        emptyDescription: 'No restaurants.',
        emptyTitle: 'No restaurants',
        errorMessage: null,
        isLoading: false,
        refetch: jest.fn(),
        title: 'Recent restaurants',
      },
      search: {
        clearErrorMessage: jest.fn(),
        clearPlacesState: mockClearPlacesSearchState,
        compactLabel: 'Search',
        displayedNearbyRestaurants: [],
        expandedLabel: 'Search Food Places',
        gpsReferenceCoords: null,
        isExpanded: true,
        isGettingLocation: false,
        isSearchingNearby: false,
        isSearchingText: false,
        locationPermissionNeedsSettings: false,
        manualLocation: 'Tokyo',
        nearby: mockSearchNearby,
        nearbyAt: mockSearchNearbyAt,
        query: 'ramen',
        referenceCoords: null,
        searchButtonDisabled: false,
        searchByText: mockSearchByText,
        searchErrorMessage: null,
        setExpanded: mockSetIsSearchExpanded,
        setManualLocation: jest.fn(),
        setQuery: mockSetSearchQuery,
        showNearbyPlaces: false,
      },
    } as unknown as ReturnType<typeof useRestaurantDiscoverySelectionFlow>);
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

  function mockDiscoverySelectionFlow({
    displayedNearbyRestaurants = [],
    displayedSavedRestaurants = [],
    gpsReferenceCoords = null,
    isOnlineSearchDisabled = false,
    referenceCoords = null,
    searchButtonDisabled = isOnlineSearchDisabled,
    searchErrorMessage = null,
    showNearbyPlaces = false,
  }: {
    displayedNearbyRestaurants?: any[];
    displayedSavedRestaurants?: any[];
    gpsReferenceCoords?: { lat: number; lng: number } | null;
    isOnlineSearchDisabled?: boolean;
    referenceCoords?: { lat: number; lng: number } | null;
    searchButtonDisabled?: boolean;
    searchErrorMessage?: string | null;
    showNearbyPlaces?: boolean;
  }) {
    mockedUseRestaurantSelectionFlow.mockReturnValue({
      quotaDisplay: {
        isPlacesQuotaReached: false,
        placesQueriesRemaining: 10,
        shouldShowPlacesUpgradePrompt: false,
      },
      savedSuggestions: {
        displayedSavedRestaurants,
        emptyDescription: 'No restaurants.',
        emptyTitle: 'No restaurants',
        errorMessage: null,
        isLoading: false,
        refetch: jest.fn(),
        title: 'Recent restaurants',
      },
      search: {
        clearErrorMessage: jest.fn(),
        clearPlacesState: mockClearPlacesSearchState,
        compactLabel: 'Search',
        displayedNearbyRestaurants,
        expandedLabel: 'Search Food Places',
        gpsReferenceCoords,
        isExpanded: true,
        isGettingLocation: false,
        isSearchingNearby: false,
        isSearchingText: false,
        locationPermissionNeedsSettings: false,
        manualLocation: 'Tokyo',
        nearby: mockSearchNearby,
        nearbyAt: mockSearchNearbyAt,
        query: 'ramen',
        referenceCoords,
        searchButtonDisabled,
        searchByText: mockSearchByText,
        searchErrorMessage,
        setExpanded: mockSetIsSearchExpanded,
        setManualLocation: jest.fn(),
        setQuery: mockSetSearchQuery,
        showNearbyPlaces,
      },
    } as unknown as ReturnType<typeof useRestaurantDiscoverySelectionFlow>);
  }

  function switchDiscoveryTab(renderer: any, tab: 'search' | 'scan') {
    act(() => {
      renderer.root
        .findAllByType('SegmentedControl')
        .find((node: any) => node.props.getOptionTestID?.('search') === 'restaurant-discovery-tab-search')
        ?.props.onChange(tab);
    });
  }

  function switchDiscoverySearchViewMode(renderer: any, viewMode: 'list' | 'map') {
    act(() => {
      renderer.root
        .findAllByType('SegmentedControl')
        .find((node: any) =>
          node.props.getOptionTestID?.('list') === 'restaurant-discovery-search-view-mode-list')
        ?.props.onChange(viewMode);
    });
  }

  function getDiscoveryTabControl(renderer: any) {
    return renderer.root
      .findAllByType('SegmentedControl')
      .find((node: any) => node.props.getOptionTestID?.('search') === 'restaurant-discovery-tab-search');
  }

  function getSearchViewModeControl(renderer: any) {
    return renderer.root
      .findAllByType('SegmentedControl')
      .find((node: any) => node.props.getOptionTestID?.('list') === 'restaurant-discovery-search-view-mode-list');
  }

  function moveDiscoveryMap(renderer: any, latitude = 34.1, longitude = -118.2) {
    act(() => {
      renderer.root.findByType('RestaurantMapView').props.onUserRegionChangeComplete({
        latitude,
        latitudeDelta: 0.1,
        longitude,
        longitudeDelta: 0.1,
      });
    });
  }

  function findSearchHereButton(renderer: any) {
    return renderer.root
      .findAllByType('Button')
      .find((node: any) => node.props.testID === 'restaurant-discovery-map-search-here');
  }

  async function runGalleryStorefrontScan(renderer: any) {
    switchDiscoveryTab(renderer, 'scan');
    act(() => {
      renderer.root
        .findAllByType('Button')
        .find((node: any) => node.props.label === 'Read a Storefront')
        ?.props.onPress();
    });
    await act(async () => {
      await renderer.root.findByType('PhotoSourceActionCards').props.onGalleryPress();
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

  it('saves a discovery restaurant to Want to Try', async () => {
    const renderer = renderScreen();

    let trailingRenderer: any;
    act(() => {
      trailingRenderer = create(
        renderer.root.findByType('VisitRestaurantSearchSection').props.savedOptions[0].trailing,
      );
    });

    const bookmarkButton = trailingRenderer.root.findByType('WantToTryBookmarkButton');
    expect(bookmarkButton.props.saved).toBe(false);

    await act(async () => {
      await bookmarkButton.props.onPress();
    });

    expect(mockSetRestaurantListWriteErrorMessage).toHaveBeenCalledWith(null);
    expect(mockSaveRestaurantToDefaultList).toHaveBeenCalledWith({
      restaurant: {
        restaurantId: 'restaurant-1',
      },
      sourceListId: 'default',
    });

    expect(mockSaveRestaurantToDefaultList).toHaveBeenCalledTimes(1);
  });

  it('shows existing default-list restaurant bookmarks as saved', () => {
    mockedUseQuery.mockImplementation((options: any) => {
      const queryKey = options.queryKey as readonly unknown[];
      if (queryKey.includes('default')) {
        return {
          data: { id: 'default_list', isDefault: true },
          error: null,
          isPending: false,
          refetch: jest.fn(),
        } as never;
      }
      if (queryKey.includes('restaurantListDetail')) {
        return {
          data: {
            items: [
              {
                restaurantId: 'restaurant-1',
                bookmarkedItems: [],
              },
            ],
          },
          error: null,
          isPending: false,
          refetch: jest.fn(),
        } as never;
      }
      return {
        data: [],
        error: null,
        isPending: false,
        refetch: jest.fn(),
      } as never;
    });
    const renderer = renderScreen();

    let trailingRenderer: any;
    act(() => {
      trailingRenderer = create(
        renderer.root.findByType('VisitRestaurantSearchSection').props.savedOptions[0].trailing,
      );
    });

    expect(trailingRenderer.root.findByType('WantToTryBookmarkButton').props.saved).toBe(true);

    act(() => {
      trailingRenderer.root.findByType('WantToTryBookmarkButton').props.onPress();
    });

    expect(mockSaveRestaurantToDefaultList).not.toHaveBeenCalled();
  });

  it('places add new restaurant in the expanded search footer with detail return target', () => {
    const renderer = renderScreen();

    const searchSection = renderer.root.findByType('VisitRestaurantSearchSection');
    const footer = searchSection.props.footerContent as React.ReactElement;
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

    expect(getDiscoveryTabControl(renderer)?.props.value).toBe('search');
    expect(getSearchViewModeControl(renderer)?.props.value).toBe('list');
    expect(renderer.root.findAllByType('VisitRestaurantSearchSection')).toHaveLength(1);
    expect(renderer.root.findAllByType('PhotoSourceActionCards')).toHaveLength(0);
    expect(renderer.root.findAllByType('Button').some((node: any) => node.props.label === 'Read a Storefront')).toBe(false);
  });

  it('switches the search tab from list to map', () => {
    const renderer = renderScreen();

    switchDiscoverySearchViewMode(renderer, 'map');

    expect(getSearchViewModeControl(renderer)?.props.value).toBe('map');
    expect(renderer.root.findAllByType('VisitRestaurantSearchSection')).toHaveLength(0);
    expect(renderer.root.findAllByType('RestaurantMapView')).toHaveLength(1);
    expect(renderer.root.findByType('BackHeaderScreenScaffold').props.scroll).toBe(false);
    expect(renderer.root.findByProps({ testID: 'restaurant-discovery-map-search-panel' })).toBeTruthy();
    expect(renderer.root.findByProps({
      testID: 'restaurant-discovery-map-search-panel-toggle',
    }).props.accessibilityState).toEqual({ expanded: false });
    expect(renderer.root.findByType('RestaurantMapView').props).toMatchObject({
      mapTestID: 'restaurant-discovery-map',
      style: expect.objectContaining({ flex: 1 }),
      testID: 'restaurant-discovery-map-view',
    });
    expect(findSearchHereButton(renderer)).toBeUndefined();
  });

  it('shows search here after the user pans the map', () => {
    const renderer = renderScreen();

    switchDiscoverySearchViewMode(renderer, 'map');
    moveDiscoveryMap(renderer);

    expect(findSearchHereButton(renderer)?.props.label).toBe('Search Here');
    expect(mockedTrackObservabilityEvent).toHaveBeenCalledWith(
      'FOOD_DISCOVERY_MAP_SEARCH_HERE_SHOWN',
      { source: 'RestaurantDiscoveryScreen' },
    );
  });

  it('searches the map center and hides search here on success', async () => {
    mockSearchNearbyAt.mockResolvedValueOnce({
      results: [
        {
          id: 'new-restaurant',
          latitude: 34.11,
          longitude: -118.21,
          name: 'New Restaurant',
        },
      ],
      status: 'success',
    });
    const renderer = renderScreen();

    switchDiscoverySearchViewMode(renderer, 'map');
    moveDiscoveryMap(renderer, 34.1, -118.2);
    await act(async () => {
      await findSearchHereButton(renderer)?.props.onPress();
    });

    expect(mockSearchNearbyAt).toHaveBeenCalledWith(
      { lat: 34.1, lng: -118.2 },
      { appendResults: true },
    );
    expect(renderer.root.findByType('RestaurantMapView').props.preserveRegionOnGroupsChange).toBe(true);
    expect(findSearchHereButton(renderer)).toBeUndefined();
    expect(mockedTrackObservabilityEvent).toHaveBeenCalledWith(
      'FOOD_DISCOVERY_MAP_SEARCH_HERE_STARTED',
      expect.objectContaining({
        existingResultCount: 0,
        source: 'RestaurantDiscoveryScreen',
      }),
    );
    expect(mockedTrackObservabilityEvent).toHaveBeenCalledWith(
      'FOOD_DISCOVERY_MAP_SEARCH_HERE_SUCCEEDED',
      expect.objectContaining({
        resultCount: 1,
        totalResultCount: 1,
      }),
    );
  });

  it('keeps current map groups visible when search here fails', async () => {
    mockSearchNearbyAt.mockResolvedValueOnce({
      message: 'Could not load nearby restaurants.',
      status: 'error',
    });
    const renderer = renderScreen();

    switchDiscoverySearchViewMode(renderer, 'map');
    const initialGroups = renderer.root.findByType('RestaurantMapView').props.groups;
    moveDiscoveryMap(renderer, 34.1, -118.2);
    await act(async () => {
      await findSearchHereButton(renderer)?.props.onPress();
    });

    expect(renderer.root.findByType('RestaurantMapView').props.groups).toBe(initialGroups);
    expect(renderer.root.findByType('RestaurantMapView').props.preserveRegionOnGroupsChange).toBe(false);
    expect(mockedTrackObservabilityEvent).toHaveBeenCalledWith(
      'FOOD_DISCOVERY_MAP_SEARCH_HERE_FAILED',
      expect.objectContaining({ status: 'error' }),
    );
  });

  it('does not show search here while offline', () => {
    mockedUseConnectivity.mockReturnValue({
      isOnline: false,
    } as never);
    const renderer = renderScreen();

    switchDiscoverySearchViewMode(renderer, 'map');
    moveDiscoveryMap(renderer);

    expect(findSearchHereButton(renderer)).toBeUndefined();
  });

  it('disables search here when search is quota-disabled', () => {
    mockDiscoverySelectionFlow({
      displayedSavedRestaurants: [
        {
          distance: null,
          restaurant: {
            id: 'restaurant-1',
            latitude: 34.09,
            longitude: -118.36,
            name: 'Erewhon West Hollywood',
          },
        },
      ],
      searchButtonDisabled: true,
    });
    const renderer = renderScreen();

    switchDiscoverySearchViewMode(renderer, 'map');
    moveDiscoveryMap(renderer);

    expect(findSearchHereButton(renderer)?.props.disabled).toBe(true);
  });

  it('passes accumulated active results to the map and keeps query-filtered groups', () => {
    mockDiscoverySelectionFlow({
      displayedNearbyRestaurants: [
        {
          distance: 0.2,
          restaurant: {
            cuisineType: 'Ramen',
            id: 'nearby-ramen',
            latitude: 34.1,
            longitude: -118.2,
            name: 'Ramen House',
          },
        },
        {
          distance: 0.3,
          restaurant: {
            cuisineType: 'Ramen',
            id: 'search-ramen',
            latitude: 34.11,
            longitude: -118.21,
            name: 'Ramen Annex',
          },
        },
      ],
      showNearbyPlaces: true,
    });
    const renderer = renderScreen();

    switchDiscoverySearchViewMode(renderer, 'map');

    expect(renderer.root.findByType('RestaurantMapView').props.groups.map((group: any) => group.id)).toEqual([
      'nearby-ramen',
      'search-ramen',
    ]);
  });

  it('expands and collapses the floating map search panel', () => {
    const renderer = renderScreen();

    switchDiscoverySearchViewMode(renderer, 'map');
    expect(renderer.root.findAllByProps({
      testID: 'restaurant-discovery-map-search-panel-expanded-content',
    })).toHaveLength(0);
    expect(renderer.root.findAllByType('Input')).toHaveLength(0);

    act(() => {
      renderer.root.findByProps({
        testID: 'restaurant-discovery-map-search-panel-toggle',
      }).props.onPress();
    });

    expect(renderer.root.findByProps({
      testID: 'restaurant-discovery-map-search-panel-toggle',
    }).props.accessibilityState).toEqual({ expanded: true });
    expect(renderer.root.findAllByProps({
      testID: 'restaurant-discovery-map-search-panel-expanded-content',
    }).length).toBeGreaterThan(0);
    expect(renderer.root.findAllByType('Input')).toHaveLength(2);
    expect(renderer.root.findAllByType('CurrentLocationButton')).toHaveLength(1);
    expect(renderer.root.findAllByType('Button').some((node: any) => node.props.label === 'Search Food Places')).toBe(true);

    act(() => {
      renderer.root.findByProps({
        testID: 'restaurant-discovery-map-search-panel-toggle',
      }).props.onPress();
    });

    expect(renderer.root.findByProps({
      testID: 'restaurant-discovery-map-search-panel-toggle',
    }).props.accessibilityState).toEqual({ expanded: false });
    expect(renderer.root.findAllByType('Input')).toHaveLength(0);
  });

  it('passes the floating search panel height as a map control inset', () => {
    const renderer = renderScreen();

    switchDiscoverySearchViewMode(renderer, 'map');
    act(() => {
      renderer.root.findByProps({
        testID: 'restaurant-discovery-map-search-panel',
      }).props.onLayout({
        nativeEvent: {
          layout: {
            height: 88,
          },
        },
      });
    });

    expect(renderer.root.findByType('RestaurantMapView').props.externalTopInset).toBe(96);
  });

  it('hides discovery map overlays and GPS control while restaurant sheet is open', () => {
    const renderer = renderScreen();

    switchDiscoverySearchViewMode(renderer, 'map');
    act(() => {
      renderer.root.findByProps({
        testID: 'restaurant-discovery-map-search-panel',
      }).props.onLayout({
        nativeEvent: {
          layout: {
            height: 88,
          },
        },
      });
    });
    moveDiscoveryMap(renderer, 34.2, -118.3);
    expect(findSearchHereButton(renderer)).toBeTruthy();

    act(() => {
      renderer.root.findByType('RestaurantMapView').props.onSelectedGroupChange('restaurant-1');
    });

    const map = renderer.root.findByType('RestaurantMapView');
    expect(renderer.root.findAllByProps({
      testID: 'restaurant-discovery-map-search-panel',
    })).toHaveLength(0);
    expect(findSearchHereButton(renderer)).toBeUndefined();
    expect(map.props.showCurrentLocationControl).toBe(false);
    expect(map.props.externalTopInset).toBe(0);
  });

  it('auto searches nearby once when map opens without active results', () => {
    mockDiscoverySelectionFlow({
      displayedNearbyRestaurants: [],
      displayedSavedRestaurants: [],
      showNearbyPlaces: false,
    });
    const renderer = renderScreen();

    switchDiscoverySearchViewMode(renderer, 'map');
    switchDiscoverySearchViewMode(renderer, 'list');
    switchDiscoverySearchViewMode(renderer, 'map');

    expect(mockSearchNearby).toHaveBeenCalledTimes(1);
    expect(mockedTrackObservabilityEvent).toHaveBeenCalledWith(
      'FOOD_DISCOVERY_MAP_AUTO_NEARBY_STARTED',
      { source: 'RestaurantDiscoveryScreen' },
    );
  });

  it('does not auto search nearby while offline', () => {
    mockedUseConnectivity.mockReturnValue({
      isOnline: false,
    } as never);
    mockDiscoverySelectionFlow({
      displayedNearbyRestaurants: [],
      displayedSavedRestaurants: [],
      showNearbyPlaces: false,
    });
    const renderer = renderScreen();

    switchDiscoverySearchViewMode(renderer, 'map');

    expect(mockSearchNearby).not.toHaveBeenCalled();
  });

  it('maps active search results without rendering a manual location as GPS', () => {
    mockDiscoverySelectionFlow({
      displayedNearbyRestaurants: [
        {
          distance: 1.2,
          restaurant: {
            cuisineType: 'Ramen',
            friendCount: 2,
            id: 'nearby-1',
            isGooglePlace: true,
            latitude: 35.67,
            location: 'Shibuya, Tokyo',
            longitude: 139.7,
            name: 'Ramen Bar',
            userVisitCount: 1,
          },
        },
      ],
      displayedSavedRestaurants: [],
      referenceCoords: { lat: 35.66, lng: 139.69 },
      showNearbyPlaces: true,
    });
    const renderer = renderScreen();

    switchDiscoverySearchViewMode(renderer, 'map');

    const map = renderer.root.findByType('RestaurantMapView');
    expect(map.props.initialUserCoordinates).toBeNull();
    expect(map.props.groups).toEqual([
      expect.objectContaining({
        id: 'nearby-1',
        latitude: 35.67,
        longitude: 139.7,
        restaurantLocation: 'Shibuya, Tokyo',
        restaurantName: 'Ramen Bar',
        summary: 'Ramen • 1.2 mi • 1 visit • 2 friends',
      }),
    ]);
    expect(map.props.groups[0].items[0]).toMatchObject({
      meta: [{ label: 'Google Place' }, { label: '1 visit' }, { label: '2 friends' }],
      name: 'Ramen',
    });
  });

  it('passes device GPS coordinates to the discovery map user location', () => {
    mockDiscoverySelectionFlow({
      displayedNearbyRestaurants: [
        {
          distance: 1.2,
          restaurant: {
            id: 'nearby-1',
            latitude: 35.67,
            longitude: 139.7,
            name: 'Ramen Bar',
          },
        },
      ],
      gpsReferenceCoords: { lat: 35.66, lng: 139.69 },
      referenceCoords: { lat: 35.66, lng: 139.69 },
      showNearbyPlaces: true,
    });
    const renderer = renderScreen();

    switchDiscoverySearchViewMode(renderer, 'map');

    expect(renderer.root.findByType('RestaurantMapView').props.initialUserCoordinates).toEqual({
      latitude: 35.66,
      longitude: 139.69,
    });
  });

  it('shows saved restaurants as fallback while starting nearby search', () => {
    const renderer = renderScreen();

    switchDiscoverySearchViewMode(renderer, 'map');

    expect(renderer.root.findByType('RestaurantMapView').props.groups).toEqual([
      expect.objectContaining({
        id: 'restaurant-1',
        restaurantName: 'Erewhon West Hollywood',
      }),
    ]);
    expect(mockSearchNearby).toHaveBeenCalledTimes(1);
  });

  it('omits restaurants without usable coordinates from map groups', () => {
    mockDiscoverySelectionFlow({
      displayedNearbyRestaurants: [
        {
          distance: null,
          restaurant: {
            id: 'valid-restaurant',
            latitude: 34.1,
            longitude: -118.2,
            name: 'Valid Restaurant',
          },
        },
        {
          distance: null,
          restaurant: {
            id: 'missing-coordinates',
            name: 'Missing Coordinates',
          },
        },
        {
          distance: null,
          restaurant: {
            id: 'zero-island',
            latitude: 0,
            longitude: 0,
            name: 'Zero Island',
          },
        },
      ],
      showNearbyPlaces: true,
    });
    const renderer = renderScreen();

    switchDiscoverySearchViewMode(renderer, 'map');

    const map = renderer.root.findByType('RestaurantMapView');
    expect(map.props.groups).toHaveLength(1);
    expect(map.props.omittedWithoutCoordinates).toBe(2);
  });

  it('opens selected map restaurants in discovery detail', () => {
    const renderer = renderScreen();

    switchDiscoverySearchViewMode(renderer, 'map');
    const map = renderer.root.findByType('RestaurantMapView');
    act(() => {
      map.props.onSelectedGroupChange('restaurant-1');
      map.props.onOpenSelectedGroup(map.props.groups[0]);
    });

    expect(mockNavigate).toHaveBeenCalledWith(
      'RestaurantDiscoveryRestaurant',
      expect.objectContaining({
        restaurantId: 'restaurant-1',
        restaurantName: 'Erewhon West Hollywood',
      }),
    );
    expect(mockedTrackObservabilityEvent).toHaveBeenCalledWith(
      'FOOD_DISCOVERY_MAP_MARKER_SELECTED',
      expect.objectContaining({
        isGooglePlace: false,
        source: 'RestaurantDiscoveryScreen',
      }),
    );
    expect(mockedTrackObservabilityEvent).toHaveBeenCalledWith(
      'FOOD_DISCOVERY_MAP_RESTAURANT_OPENED',
      expect.objectContaining({
        isGooglePlace: false,
        source: 'RestaurantDiscoveryScreen',
      }),
    );
  });

  it('passes Food Discovery-only sheet tabs for the selected map restaurant', () => {
    mockedUseQuery.mockImplementation((options: any) => {
      const queryKey = options.queryKey as readonly string[];
      if (queryKey.includes('allLocationsHistory')) {
        return {
          data: {
            anchorRestaurant: { id: 'restaurant-1', name: 'Erewhon West Hollywood' },
            itemCount: 1,
            items: [
              {
                averageRating: 4.5,
                displayName: 'Double Double',
                latestRating: 5,
                latestRestaurantId: 'restaurant-2',
                latestRestaurantLocation: '333 Jefferson St',
                latestRestaurantName: 'In-N-Out Burger',
                latestVisitedAt: '2026-04-03T18:30:00.000Z',
                normalizedItemName: 'double double',
                orderCount: 2,
                restaurants: [],
              },
            ],
            locationCount: 2,
            normalizedName: 'in n out burger',
            restaurants: [],
            visitCount: 2,
          },
          error: null,
          isPending: false,
        } as never;
      }

      if (queryKey.includes('menuItems')) {
        return {
          data: [
            { id: 'menu-b', name: 'Ziti', restaurant: 'restaurant-1' },
            { id: 'menu-a', name: 'Aguachile', restaurant: 'restaurant-1' },
          ],
          error: null,
          isPending: false,
        } as never;
      }

      return {
        data: [],
        error: null,
        isPending: false,
      } as never;
    });
    const renderer = renderScreen();

    switchDiscoverySearchViewMode(renderer, 'map');
    act(() => {
      renderer.root.findByType('RestaurantMapView').props.onSelectedGroupChange('restaurant-1');
    });

    const tabs = renderer.root.findByType('RestaurantMapView').props.selectedGroupTabs;
    expect(tabs.activeTab).toBe('location');
    expect(tabs.allLocations.items[0]).toMatchObject({
      name: 'Double Double',
      meta: [
        {
          dateLabel: 'Latest at In-N-Out Burger • 333 Jefferson St',
          label: '2 orders',
          rating: 5,
        },
      ],
    });
    expect(tabs.location.items.map((item: any) => item.name)).toEqual(['Aguachile', 'Ziti']);
  });

  it('clears map selection and resets map when search results are cleared', () => {
    mockDiscoverySelectionFlow({
      displayedNearbyRestaurants: [
        {
          distance: null,
          restaurant: {
            id: 'nearby-1',
            latitude: 34.1,
            longitude: -118.2,
            name: 'Nearby Restaurant',
          },
        },
      ],
      showNearbyPlaces: true,
    });
    const renderer = renderScreen();

    switchDiscoverySearchViewMode(renderer, 'map');
    act(() => {
      renderer.root.findByProps({
        testID: 'restaurant-discovery-map-search-panel-toggle',
      }).props.onPress();
    });
    const initialResetSignal = renderer.root.findByType('RestaurantMapView').props.resetSignal;
    moveDiscoveryMap(renderer, 34.2, -118.3);
    expect(findSearchHereButton(renderer)).toBeTruthy();
    act(() => {
      renderer.root.findAllByType('Button').find((node: any) => node.props.label === 'Clear Search Results')?.props.onPress();
    });

    const map = renderer.root.findByType('RestaurantMapView');
    expect(mockClearPlacesSearchState).toHaveBeenCalledTimes(1);
    expect(map.props.selectedGroupId).toBeNull();
    expect(map.props.resetSignal).toBe(initialResetSignal + 1);
    expect(map.props.preserveRegionOnGroupsChange).toBe(false);
    expect(findSearchHereButton(renderer)).toBeUndefined();
  });

  it('clears map-region preservation when switching away from map mode', async () => {
    mockSearchNearbyAt.mockResolvedValueOnce({
      results: [
        {
          id: 'new-restaurant',
          latitude: 34.11,
          longitude: -118.21,
          name: 'New Restaurant',
        },
      ],
      status: 'success',
    });
    const renderer = renderScreen();

    switchDiscoverySearchViewMode(renderer, 'map');
    moveDiscoveryMap(renderer, 34.1, -118.2);
    await act(async () => {
      await findSearchHereButton(renderer)?.props.onPress();
    });
    expect(renderer.root.findByType('RestaurantMapView').props.preserveRegionOnGroupsChange).toBe(true);

    switchDiscoverySearchViewMode(renderer, 'list');
    switchDiscoverySearchViewMode(renderer, 'map');

    expect(renderer.root.findByType('RestaurantMapView').props.preserveRegionOnGroupsChange).toBe(false);
    expect(findSearchHereButton(renderer)).toBeUndefined();
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
    expect(getDiscoveryTabControl(renderer)?.props.value).toBe('search');
    expect(renderer.root.findAllByType('VisitRestaurantSearchSection')).toHaveLength(1);
  });

  it('tracks successful storefront extraction with request correlation', async () => {
    mockedExtractRestaurantNamesFromImage.mockResolvedValueOnce({
      found: true,
      language: 'ja',
      options: [
        {
          confidence: 'high',
          name: 'Sushi Ginza',
          reason: 'The storefront sign is visible.',
        },
      ],
    } as never);
    const renderer = renderScreen();

    await runGalleryStorefrontScan(renderer);

    expect(mockedExtractRestaurantNamesFromImage).toHaveBeenCalledWith(
      expect.objectContaining({
        mimeType: 'image/jpeg',
        name: 'staged-storefront.jpg',
        requestCorrelation: expect.stringMatching(/^mobile-storefront-/),
        uri: 'file:///staged-storefront.jpg',
      }),
    );
    expect(mockedTrackObservabilityEvent).toHaveBeenCalledWith(
      'FOOD_DISCOVERY_STOREFRONT_EXTRACTION_STARTED',
      expect.objectContaining({
        analyticsSource: 'RestaurantDiscoveryStorefront',
        photoSource: 'gallery',
        requestCorrelation: expect.stringMatching(/^mobile-storefront-/),
      }),
    );
    expect(mockedTrackObservabilityEvent).toHaveBeenCalledWith(
      'FOOD_DISCOVERY_STOREFRONT_EXTRACTION_SUCCEEDED',
      expect.objectContaining({
        analyticsSource: 'RestaurantDiscoveryStorefront',
        found: true,
        language: 'ja',
        optionCount: 1,
        photoSource: 'gallery',
        requestCorrelation: expect.stringMatching(/^mobile-storefront-/),
        resultType: 'found',
      }),
    );
    expect(mockedCleanupStagedPhotoFiles).toHaveBeenCalledWith([
      expect.objectContaining({ uri: 'file:///staged-storefront.jpg' }),
    ]);
  });

  it('tracks storefront API failures and captures the exception', async () => {
    const error = new Error('Gemini failed');
    mockedExtractRestaurantNamesFromImage.mockRejectedValueOnce(error);
    const renderer = renderScreen();

    await runGalleryStorefrontScan(renderer);

    expect(renderer.root.findByType('PageErrorToast').props.errorMessage).toBe('Gemini failed');
    expect(mockedTrackObservabilityEvent).toHaveBeenCalledWith(
      'FOOD_DISCOVERY_STOREFRONT_EXTRACTION_FAILED',
      expect.objectContaining({
        analyticsSource: 'RestaurantDiscoveryStorefront',
        errorMessage: 'Gemini failed',
        errorType: 'Error',
        photoSource: 'gallery',
        requestCorrelation: expect.stringMatching(/^mobile-storefront-/),
        statusCode: null,
      }),
    );
    expect(mockedCaptureObservabilityError).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        analyticsSource: 'RestaurantDiscoveryStorefront',
        errorMessage: 'Gemini failed',
        photoSource: 'gallery',
        requestCorrelation: expect.stringMatching(/^mobile-storefront-/),
        source: 'RestaurantDiscoveryStorefront',
      }),
    );
    expect(mockedCleanupStagedPhotoFiles).toHaveBeenCalledWith([
      expect.objectContaining({ uri: 'file:///staged-storefront.jpg' }),
    ]);
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ['feature', 'usage', 'monthly'],
    });
  });

  it('tracks storefront permission denial without calling the API', async () => {
    mockPickImageAssets.mockResolvedValueOnce({
      canAskAgain: false,
      message: 'Photo library permission is blocked.',
      status: 'permission_denied',
    });
    const renderer = renderScreen();

    await runGalleryStorefrontScan(renderer);

    expect(mockedTrackObservabilityEvent).toHaveBeenCalledWith(
      'FOOD_DISCOVERY_STOREFRONT_IMAGE_PERMISSION_DENIED',
      expect.objectContaining({
        analyticsSource: 'RestaurantDiscoveryStorefront',
        canAskAgain: false,
        photoSource: 'gallery',
        requestCorrelation: expect.stringMatching(/^mobile-storefront-/),
      }),
    );
    expect(renderer.root.findByType('PageErrorToast').props.errorMessage).toBe('Photo library permission is blocked.');
    expect(mockedExtractRestaurantNamesFromImage).not.toHaveBeenCalled();
    expect(mockedCaptureObservabilityError).not.toHaveBeenCalled();
  });

  it('tracks storefront picker cancellation without showing an error', async () => {
    mockPickImageAssets.mockResolvedValueOnce({
      status: 'canceled',
    });
    const renderer = renderScreen();

    await runGalleryStorefrontScan(renderer);

    expect(mockedTrackObservabilityEvent).toHaveBeenCalledWith(
      'FOOD_DISCOVERY_STOREFRONT_IMAGE_PICK_CANCELED',
      expect.objectContaining({
        analyticsSource: 'RestaurantDiscoveryStorefront',
        photoSource: 'gallery',
        requestCorrelation: expect.stringMatching(/^mobile-storefront-/),
      }),
    );
    expect(renderer.root.findByType('PageErrorToast').props.errorMessage).toBeNull();
    expect(mockedExtractRestaurantNamesFromImage).not.toHaveBeenCalled();
    expect(mockedCaptureObservabilityError).not.toHaveBeenCalled();
  });

  it('tracks storefront usage limits without capturing an exception', async () => {
    const error = new Error('Limit reached');
    mockedParseLimitExceededError.mockReturnValueOnce({
      limit: 5,
      message: 'You have reached your monthly AI scan limit.',
      metric: 'aiScansMonthly',
      monthKey: '2026-05',
      remaining: 0,
      used: 5,
      userTier: 'free',
    } as never);
    mockedExtractRestaurantNamesFromImage.mockRejectedValueOnce(error);
    const renderer = renderScreen();

    await runGalleryStorefrontScan(renderer);

    expect(renderer.root.findByType('PageErrorToast').props.errorMessage).toBe(
      'You have reached your monthly AI scan limit.',
    );
    expect(mockedTrackObservabilityEvent).toHaveBeenCalledWith(
      'USAGE_LIMIT_REACHED',
      {
        enforcement: 'server',
        limit: 5,
        metric: 'aiScansMonthly',
        monthKey: '2026-05',
        remaining: 0,
        source: 'RestaurantDiscoveryStorefront',
        used: 5,
        userTier: 'free',
      },
    );
    expect(mockedTrackObservabilityEvent).toHaveBeenCalledWith(
      'FOOD_DISCOVERY_STOREFRONT_EXTRACTION_FAILED',
      expect.objectContaining({
        analyticsSource: 'RestaurantDiscoveryStorefront',
        errorMessage: 'You have reached your monthly AI scan limit.',
        photoSource: 'gallery',
        requestCorrelation: expect.stringMatching(/^mobile-storefront-/),
      }),
    );
    expect(mockedCaptureObservabilityError).not.toHaveBeenCalled();
  });

  it('tracks storefront offline blocking without opening the picker', async () => {
    mockedUseConnectivity.mockReturnValue({
      isOnline: false,
    } as never);
    const renderer = renderScreen();

    await runGalleryStorefrontScan(renderer);

    expect(renderer.root.findByType('PageErrorToast').props.errorMessage).toBe(
      'Restaurant name extraction requires internet connection.',
    );
    expect(mockedTrackObservabilityEvent).toHaveBeenCalledWith(
      'FOOD_DISCOVERY_STOREFRONT_OFFLINE_BLOCKED',
      expect.objectContaining({
        analyticsSource: 'RestaurantDiscoveryStorefront',
        photoSource: 'gallery',
        requestCorrelation: expect.stringMatching(/^mobile-storefront-/),
      }),
    );
    expect(mockPickImageAssets).not.toHaveBeenCalled();
    expect(mockedExtractRestaurantNamesFromImage).not.toHaveBeenCalled();
    expect(mockedCaptureObservabilityError).not.toHaveBeenCalled();
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
