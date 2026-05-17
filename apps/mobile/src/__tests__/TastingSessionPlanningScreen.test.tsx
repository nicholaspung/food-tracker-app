import React from 'react';
import { act, create } from 'react-test-renderer';
import { useQueryClient } from '@tanstack/react-query';

import { suggestTastingRestaurant } from '../features';
import { useRestaurantSelectionFlow } from '../hooks/useRestaurantSelectionFlow';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { TastingSessionPlanningScreen } from '../screens/TastingSessionPlanningScreen';
import { useTastingSessionDetail } from '../screens/tastingSessions/useTastingSessionDetail';

const mockReact = React;
const mockNavigate = jest.fn();
const mockReplace = jest.fn();
const mockInvalidateQueries = jest.fn();
const mockClearPlacesSearchState = jest.fn();
const mockSearchByText = jest.fn();
const mockSearchNearby = jest.fn();
const mockSetIsSearchExpanded = jest.fn();
const mockSetManualLocation = jest.fn();
const mockSetSearchQuery = jest.fn();
const mockTriggerSavedRestaurantsRefetch = jest.fn();

jest.mock('react-native', () => ({
  Linking: {
    openSettings: jest.fn(),
  },
  View: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('View', props, children),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: jest.fn(),
}));

jest.mock('../components/shared', () => ({
  EmptyState: (props: Record<string, unknown>) => mockReact.createElement('EmptyState', props),
  FeatureDetailScreenScaffold: (
    { children, ...props }: Record<string, unknown> & { children?: React.ReactNode },
  ) => mockReact.createElement('FeatureDetailScreenScaffold', props, children),
  PageErrorToast: (props: Record<string, unknown>) => mockReact.createElement('PageErrorToast', props),
  StatusPill: (props: Record<string, unknown>) => mockReact.createElement('StatusPill', props),
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
  setTastingMenuItemSuggestionStatus: jest.fn(),
  setTastingRestaurantSuggestionStatus: jest.fn(),
  startTastingSession: jest.fn(),
  suggestTastingMenuItem: jest.fn(),
  suggestTastingRestaurant: jest.fn(),
  tastingSessionsQueryKeys: {
    detail: jest.fn((sessionId: string) => ['feature', 'tastingSessions', sessionId]),
  },
  useMonthlyUsage: jest.fn(() => ({
    snapshot: {
      remaining: {
        placesQueriesMonthly: 10,
      },
    },
  })),
}));

jest.mock('../hooks/useRestaurantSelectionFlow', () => ({
  useRestaurantSelectionFlow: jest.fn(),
}));

jest.mock('../providers/AuthProvider', () => ({
  useAuth: jest.fn(() => ({
    actualUser: { isAdmin: false },
    user: {
      id: 'user-1',
      isAdmin: false,
      isSubscriber: false,
    },
  })),
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
          spacing: {
            sm: 8,
          },
        },
        ...args,
      ),
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

jest.mock('../screens/tastingSessions/useTastingSessionDetail', () => ({
  useTastingSessionDetail: jest.fn(),
}));

const mockedSuggestTastingRestaurant = suggestTastingRestaurant as jest.MockedFunction<
  typeof suggestTastingRestaurant
>;
const mockedUseConnectivity = useConnectivity as jest.MockedFunction<typeof useConnectivity>;
const mockedUseQueryClient = useQueryClient as jest.MockedFunction<typeof useQueryClient>;
const mockedUseRestaurantSelectionFlow = useRestaurantSelectionFlow as jest.MockedFunction<
  typeof useRestaurantSelectionFlow
>;
const mockedUseTastingSessionDetail = useTastingSessionDetail as jest.MockedFunction<
  typeof useTastingSessionDetail
>;

const savedRestaurant = {
  distance: null,
  restaurant: {
    id: 'restaurant-1',
    name: 'Corner Ramen',
    location: 'Los Angeles, CA',
    cuisineType: 'Ramen',
    userVisitCount: 2,
  },
};

const planningSession = {
  id: 'session-1',
  createdAt: '2026-05-16T10:00:00.000Z',
  invites: [],
  joinExpiresAt: '2026-05-16T11:00:00.000Z',
  joinedCount: 1,
  leaderUserId: 'user-1',
  maxApprovedItems: 6,
  maxParticipants: 4,
  maxRestaurants: 3,
  name: 'Test',
  participants: [],
  restaurants: [],
  status: 'planning',
  updatedAt: '2026-05-16T10:00:00.000Z',
};

function buildRestaurantSelectionFlowResult(
  overrides: Partial<ReturnType<typeof useRestaurantSelectionFlow>> = {},
): ReturnType<typeof useRestaurantSelectionFlow> {
  return {
    clearPlacesSearchState: mockClearPlacesSearchState,
    compactSearchLabel: 'Search',
    displayedNearbyRestaurants: [],
    displayedSavedRestaurants: [savedRestaurant],
    expandedSearchLabel: 'Search Food Places',
    isGettingLocation: false,
    isPlacesQuotaReached: false,
    isSearchExpanded: true,
    isSearchingNearbyRestaurants: false,
    isSearchingRestaurants: false,
    loadedRestaurantRecords: [],
    locationPermissionNeedsSettings: false,
    manualLocation: '',
    menuItemsQuery: {} as never,
    placesQueriesRemaining: 10,
    resetLocationPermissionNeedsSettings: jest.fn(),
    resetRestaurantSelectionFlow: jest.fn(),
    savedEmptyDescription: 'Search nearby places to build the tasting plan.',
    savedEmptyTitle: 'No restaurants yet',
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
    setManualLocation: mockSetManualLocation,
    setSearchQuery: mockSetSearchQuery,
    shouldEnforceUsageLimitsClientSide: true,
    shouldQuerySavedRestaurantsBySearch: false,
    shouldShowPlacesUpgradePrompt: false,
    showNearbyPlaces: false,
    triggerSavedRestaurantsRefetch: mockTriggerSavedRestaurantsRefetch,
    ...overrides,
  } as unknown as ReturnType<typeof useRestaurantSelectionFlow>;
}

describe('TastingSessionPlanningScreen', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockReplace.mockReset();
    mockInvalidateQueries.mockReset();
    mockClearPlacesSearchState.mockReset();
    mockSearchByText.mockReset();
    mockSearchByText.mockResolvedValue({ results: [], status: 'success' });
    mockSearchNearby.mockReset();
    mockSearchNearby.mockResolvedValue({ results: [], status: 'success' });
    mockSetIsSearchExpanded.mockReset();
    mockSetManualLocation.mockReset();
    mockSetSearchQuery.mockReset();
    mockTriggerSavedRestaurantsRefetch.mockReset();
    mockedSuggestTastingRestaurant.mockReset();
    mockedSuggestTastingRestaurant.mockResolvedValue(planningSession as never);
    mockedUseConnectivity.mockReturnValue({ isOnline: true } as never);
    mockedUseQueryClient.mockReturnValue({
      invalidateQueries: mockInvalidateQueries,
    } as never);
    mockedUseTastingSessionDetail.mockReturnValue({
      data: planningSession,
    } as never);
    mockedUseRestaurantSelectionFlow.mockReturnValue(buildRestaurantSelectionFlowResult());
  });

  function renderScreen() {
    let renderer: any;
    act(() => {
      renderer = create(
        <TastingSessionPlanningScreen
          navigation={{ navigate: mockNavigate, replace: mockReplace } as never}
          route={{
            key: 'planning',
            name: 'TastingSessionPlanning',
            params: { sessionId: 'session-1' },
          } as never}
        />,
      );
    });

    return renderer;
  }

  it('renders the shared restaurant search section instead of a restaurant name input', () => {
    const renderer = renderScreen();

    expect(renderer.root.findAllByType('VisitRestaurantSearchSection')).toHaveLength(1);
    expect(
      renderer.root.findAllByType('Input').some((node: any) => node.props.label === 'Restaurant name'),
    ).toBe(false);
  });

  it('selects a saved restaurant and submits it with the restaurant id', async () => {
    const renderer = renderScreen();

    act(() => {
      renderer.root.findByType('VisitRestaurantSearchSection').props.savedOptions[0].onPress();
    });

    const searchSection = renderer.root.findByType('VisitRestaurantSearchSection');
    expect(searchSection.props.savedOptions[0].selected).toBe(true);

    let footerRenderer: any;
    act(() => {
      footerRenderer = create(searchSection.props.footerContent);
    });

    await act(async () => {
      await footerRenderer.root.findByType('Button').props.onPress();
    });

    expect(mockedSuggestTastingRestaurant).toHaveBeenCalledWith('session-1', {
      restaurantId: 'restaurant-1',
      restaurantName: 'Corner Ramen',
    });
    expect(mockSetSearchQuery).toHaveBeenCalledWith('');
    expect(mockClearPlacesSearchState).toHaveBeenCalledTimes(1);
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ['feature', 'tastingSessions', 'session-1'],
    });
  });

  it('passes offline state and search errors through to restaurant search', () => {
    mockedUseConnectivity.mockReturnValue({ isOnline: false } as never);
    mockedUseRestaurantSelectionFlow.mockReturnValueOnce(buildRestaurantSelectionFlowResult({
      searchErrorMessage: 'Could not search restaurants.',
    }));

    const renderer = renderScreen();
    const searchSection = renderer.root.findByType('VisitRestaurantSearchSection');

    expect(searchSection.props.connectivityWarningMessage).toBe('Restaurant search requires internet connection.');
    expect(searchSection.props.currentLocationDisabled).toBe(true);
    expect(searchSection.props.searchErrorMessage).toBe('Could not search restaurants.');
  });

  it('renders newly suggested restaurants when the API returns null items', () => {
    mockedUseTastingSessionDetail.mockReturnValue({
      data: {
        ...planningSession,
        restaurants: [
          {
            createdAt: '2026-05-16T10:05:00.000Z',
            id: 'suggestion-1',
            items: null,
            restaurantId: 'restaurant-1',
            restaurantName: 'Corner Ramen',
            status: 'pending',
            suggestedByParticipantId: 'participant-1',
          },
        ],
      },
    } as never);

    const renderer = renderScreen();

    expect(renderer.root.findByProps({ title: 'Corner Ramen' }).props.description).toBe('0 suggested items');
  });
});
