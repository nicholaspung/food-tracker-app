import React from 'react';
import { act, create } from 'react-test-renderer';
import { useQueryClient } from '@tanstack/react-query';

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
const mockClearPlacesSearchState = jest.fn();
const mockSearchByText = jest.fn();
const mockSetIsSearchExpanded = jest.fn();
const mockSetSearchQuery = jest.fn();
const mockPickImageAssets = jest.fn();
const mockInvalidateQueries = jest.fn();

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
    invalidateQueries: mockInvalidateQueries,
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
  useRestaurantDiscoverySelectionFlow: jest.fn(),
}));

jest.mock('../lib/photoStaging', () => ({
  cleanupStagedPhotoFiles: jest.fn(),
  stageLocalPhotoFile: jest.fn(),
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
      status: 'success',
    });
    mockInvalidateQueries.mockReset();
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
        isExpanded: true,
        isGettingLocation: false,
        isSearchingNearby: false,
        isSearchingText: false,
        locationPermissionNeedsSettings: false,
        manualLocation: 'Tokyo',
        nearby: mockSearchNearby,
        query: 'ramen',
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

  function switchDiscoveryTab(renderer: any, tab: 'search' | 'scan') {
    act(() => {
      renderer.root.findByType('SegmentedControl').props.onChange(tab);
    });
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
