import React from 'react';
import { act, create } from 'react-test-renderer';

import {
  type TastingSessionRecord,
  useTastingPlanMenuCatalog,
  useTastingPlanWrites,
  useTastingSessionWrites,
} from '../features';
import { useTastingPlanRestaurantSelectionFlow } from '../hooks/useRestaurantSelectionFlow';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { TastingSessionPlanningScreen } from '../screens/TastingSessionPlanningScreen';
import { useTastingSessionLifecycleReadState } from '../screens/tastingSessions/useTastingSessionLifecycleReadState';

const mockReact = React;
const mockNavigate = jest.fn();
const mockReplace = jest.fn();
const mockClearPlacesSearchState = jest.fn();
const mockSearchByText = jest.fn();
const mockSearchNearby = jest.fn();
const mockSetIsSearchExpanded = jest.fn();
const mockSetManualLocation = jest.fn();
const mockSetSearchQuery = jest.fn();
const mockTriggerSavedRestaurantsRefetch = jest.fn();
const mockAddMenuItem = jest.fn();
const mockAddRestaurant = jest.fn();
const mockRemoveMenuItem = jest.fn();
const mockRemoveRestaurant = jest.fn();
const mockStartTasting = jest.fn();
const mockDeleteSession = jest.fn();

jest.mock('react-native', () => ({
  Linking: {
    openSettings: jest.fn(),
  },
  Pressable: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Pressable', props, children),
  View: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('View', props, children),
}));

jest.mock('../components/shared', () => ({
  ConfirmDestructiveModal: (props: Record<string, unknown>) =>
    mockReact.createElement('ConfirmDestructiveModal', props),
  EmptyState: (props: Record<string, unknown>) => mockReact.createElement('EmptyState', props),
  FeatureDetailScreenScaffold: (
    { children, ...props }: Record<string, unknown> & { children?: React.ReactNode },
  ) => mockReact.createElement('FeatureDetailScreenScaffold', props, children),
  PageErrorToast: (props: Record<string, unknown>) => mockReact.createElement('PageErrorToast', props),
  RestaurantMenuItemPicker: (props: Record<string, unknown>) =>
    mockReact.createElement('RestaurantMenuItemPicker', props),
  StatusPill: (props: Record<string, unknown>) => mockReact.createElement('StatusPill', props),
  StepProgressBar: (props: Record<string, unknown>) => mockReact.createElement('StepProgressBar', props),
  VisitRestaurantOptionTrailing: (props: Record<string, unknown>) =>
    mockReact.createElement('VisitRestaurantOptionTrailing', props),
  VisitRestaurantSearchHeaderToggle: (props: Record<string, unknown>) =>
    mockReact.createElement('VisitRestaurantSearchHeaderToggle', props),
  VisitRestaurantSearchOptionDescription: (props: Record<string, unknown>) =>
    mockReact.createElement('VisitRestaurantSearchOptionDescription', props),
  VisitRestaurantSearchSection: (props: Record<string, unknown>) =>
    mockReact.createElement('VisitRestaurantSearchSection', props),
}));

jest.mock('../features', () => {
  const planningState = jest.requireActual('../features/store/useTastingPlanPlanningState');

  return {
    menuItemsQueryKeys: {
      restaurant: jest.fn((restaurantId: string) => ['feature', 'menuItems', restaurantId]),
    },
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
    useMenuScanFlow: jest.fn(() => ({
      createdItemNames: [],
      errorMessage: null,
      existingItemNames: [],
      lastRequestedSource: 'gallery',
      permissionNeedsSettings: false,
      reset: jest.fn(),
      scanMenu: jest.fn(),
      selectedImageName: '',
      status: 'idle',
      verification: null,
    })),
    useTastingPlanMenuCatalog: jest.fn(),
    useTastingPlanPlanningState: planningState.useTastingPlanPlanningState,
    useTastingPlanWrites: jest.fn(),
    useTastingSessionWrites: jest.fn(),
  };
});

jest.mock('../hooks/useRestaurantSelectionFlow', () => ({
  useTastingPlanRestaurantSelectionFlow: jest.fn(),
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
          colors: {
            background: {
              app: '#appBackground',
            },
            border: {
              subtle: '#borderSubtle',
            },
            button: {
              secondaryBorder: '#secondaryBorder',
            },
            status: {
              successBg: '#successBg',
              successBorder: '#successBorder',
              warningBg: '#warningBg',
              warningBorder: '#warningBorder',
            },
            text: {
              danger: '#dangerText',
              primary: '#primaryText',
            },
          },
          radii: {
            md: 8,
          },
          sizes: {
            secondaryButtonHeight: 36,
          },
          spacing: {
            md: 16,
            sm: 8,
            xs: 4,
          },
        },
        ...args,
      ),
  useTheme: () => ({
    colors: {
      text: {
        danger: '#dangerText',
        primary: '#primaryText',
      },
    },
  }),
}));

jest.mock('../ui', () => ({
  Button: (props: Record<string, unknown>) => mockReact.createElement('Button', props),
  Card: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Card', props, children),
  Input: (props: Record<string, unknown>) => mockReact.createElement('Input', props),
  ListItem: (props: Record<string, unknown>) => mockReact.createElement('ListItem', props),
  Modal: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Modal', props, children),
  Text: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Text', props, children),
}));

jest.mock('../screens/tastingSessions/useTastingSessionLifecycleReadState', () => ({
  useTastingSessionLifecycleReadState: jest.fn(),
}));

const mockedUseTastingPlanWrites = useTastingPlanWrites as jest.MockedFunction<typeof useTastingPlanWrites>;
const mockedUseTastingSessionWrites = useTastingSessionWrites as jest.MockedFunction<typeof useTastingSessionWrites>;
const mockedUseTastingPlanMenuCatalog = useTastingPlanMenuCatalog as jest.MockedFunction<
  typeof useTastingPlanMenuCatalog
>;
const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockedUseConnectivity = useConnectivity as jest.MockedFunction<typeof useConnectivity>;
const mockedUseRestaurantSelectionFlow = useTastingPlanRestaurantSelectionFlow as jest.MockedFunction<
  typeof useTastingPlanRestaurantSelectionFlow
>;
const mockedUseTastingSessionLifecycleReadState = useTastingSessionLifecycleReadState as jest.MockedFunction<
  typeof useTastingSessionLifecycleReadState
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

const planningSession: TastingSessionRecord = {
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

const sessionWithRestaurant: TastingSessionRecord = {
  ...planningSession,
  restaurants: [
    {
      createdAt: '2026-05-16T10:05:00.000Z',
      id: 'suggestion-1',
      items: [
        {
          createdAt: '2026-05-16T10:06:00.000Z',
          id: 'item-1',
          menuItemId: 'menu-item-1',
          name: 'Shoyu Ramen',
          ratings: [],
          restaurantSuggestionId: 'suggestion-1',
          status: 'approved',
          suggestedByParticipantId: 'participant-1',
        },
      ],
      restaurantId: 'restaurant-1',
      restaurantName: 'Corner Ramen',
      status: 'approved',
      suggestedByParticipantId: 'participant-1',
    },
  ],
};

const sessionWithPartialRestaurantItems: TastingSessionRecord = {
  ...planningSession,
  restaurants: [
    ...sessionWithRestaurant.restaurants,
    {
      createdAt: '2026-05-16T10:06:00.000Z',
      id: 'suggestion-2',
      items: [],
      restaurantId: 'restaurant-2',
      restaurantName: 'Sushi Stand',
      status: 'approved',
      suggestedByParticipantId: 'participant-1',
    },
  ],
};

function buildRestaurantSelectionFlowResult(
  overrides: Partial<ReturnType<typeof useTastingPlanRestaurantSelectionFlow>> = {},
): ReturnType<typeof useTastingPlanRestaurantSelectionFlow> {
  return {
    quotaDisplay: {
      isPlacesQuotaReached: false,
      placesQueriesRemaining: 10,
      shouldShowPlacesUpgradePrompt: false,
    },
    savedSuggestions: {
      displayedSavedRestaurants: [savedRestaurant],
      emptyDescription: 'Search nearby places to build the tasting plan.',
      emptyTitle: 'No restaurants yet',
      errorMessage: null,
      isLoading: false,
      refetch: mockTriggerSavedRestaurantsRefetch,
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
      manualLocation: '',
      nearby: mockSearchNearby,
      query: 'ramen',
      searchButtonDisabled: false,
      searchByText: mockSearchByText,
      searchErrorMessage: null,
      setExpanded: mockSetIsSearchExpanded,
      setManualLocation: mockSetManualLocation,
      setQuery: mockSetSearchQuery,
      showNearbyPlaces: false,
    },
    ...overrides,
  } as unknown as ReturnType<typeof useTastingPlanRestaurantSelectionFlow>;
}

describe('TastingSessionPlanningScreen', () => {
  function mockLifecycleSession(session: TastingSessionRecord | null) {
    mockedUseTastingSessionLifecycleReadState.mockReturnValue({
      applyMissingAccessPolicy: jest.fn(),
      missingAccess: {
        message: 'Your invite was revoked.',
        redirectDestination: { name: 'TastingSessions', params: { errorMessage: 'Your invite was revoked.' } },
        shouldHandle: false,
      },
      onlineOnly: {
        actionsDisabled: !mockedUseConnectivity().isOnline,
        isOnline: mockedUseConnectivity().isOnline,
        warningMessage: mockedUseConnectivity().isOnline ? null : 'Planning actions require a connection.',
      },
      query: {
        data: session,
        isError: false,
        isLoading: false,
      },
      redirectDestination: session?.status === 'tasting' || session?.status === 'rating'
        ? { name: 'TastingSessionTasting', params: { sessionId: session.id } }
        : session?.status === 'completed'
          ? { name: 'TastingSessionResults', params: { sessionId: session.id } }
          : null,
      roles: {
        currentParticipant: null,
        isInvitee: false,
        isLeader: Boolean(session && mockedUseAuth().user?.id === session.leaderUserId),
        isParticipant: false,
      },
      shouldPoll: true,
      step: {
        currentStep: 1,
        label: 'Plan',
        stage: 'plan',
      },
    } as unknown as ReturnType<typeof useTastingSessionLifecycleReadState>);
  }

  beforeEach(() => {
    mockNavigate.mockReset();
    mockReplace.mockReset();
    mockClearPlacesSearchState.mockReset();
    mockSearchByText.mockReset();
    mockSearchByText.mockResolvedValue({ results: [], status: 'success' });
    mockSearchNearby.mockReset();
    mockSearchNearby.mockResolvedValue({ results: [], status: 'success' });
    mockSetIsSearchExpanded.mockReset();
    mockSetManualLocation.mockReset();
    mockSetSearchQuery.mockReset();
    mockTriggerSavedRestaurantsRefetch.mockReset();
    mockAddMenuItem.mockReset();
    mockAddMenuItem.mockResolvedValue({ result: sessionWithRestaurant, status: 'completed' });
    mockAddRestaurant.mockReset();
    mockAddRestaurant.mockResolvedValue({ result: planningSession, status: 'completed' });
    mockRemoveMenuItem.mockReset();
    mockRemoveMenuItem.mockResolvedValue({ result: sessionWithRestaurant, status: 'completed' });
    mockRemoveRestaurant.mockReset();
    mockRemoveRestaurant.mockResolvedValue({ result: planningSession, status: 'completed' });
    mockStartTasting.mockReset();
    mockStartTasting.mockResolvedValue({ result: sessionWithRestaurant, status: 'completed' });
    mockDeleteSession.mockReset();
    mockDeleteSession.mockResolvedValue({ result: { success: true }, status: 'completed' });
    mockedUseTastingPlanWrites.mockReturnValue({
      addMenuItem: mockAddMenuItem,
      addRestaurant: mockAddRestaurant,
      removeMenuItem: mockRemoveMenuItem,
      removeRestaurant: mockRemoveRestaurant,
      startTasting: mockStartTasting,
    } as unknown as ReturnType<typeof useTastingPlanWrites>);
    mockedUseTastingSessionWrites.mockReturnValue({
      deleteSession: mockDeleteSession,
    } as unknown as ReturnType<typeof useTastingSessionWrites>);
    mockedUseAuth.mockReturnValue({
      actualUser: { isAdmin: false },
      user: {
        id: 'user-1',
        isAdmin: false,
        isSubscriber: false,
      },
    } as never);
    mockedUseConnectivity.mockReturnValue({ isOnline: true } as never);
    mockedUseTastingPlanMenuCatalog.mockReturnValue({
      menuItemsQuery: {
        data: [],
        isError: false,
        isLoading: false,
        refetch: jest.fn(),
      },
      menuReviewSubmitted: false,
      requestMenuReview: jest.fn().mockResolvedValue({ status: 'completed' }),
    } as unknown as ReturnType<typeof useTastingPlanMenuCatalog>);
    mockLifecycleSession(planningSession);
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

  it('renders the shared restaurant search section for the leader instead of a restaurant name input', () => {
    const renderer = renderScreen();

    expect(renderer.root.findAllByType('VisitRestaurantSearchSection')).toHaveLength(1);
    expect(
      renderer.root.findAllByType('Input').some((node: any) => node.props.label === 'Restaurant name'),
    ).toBe(false);
  });

  it('adds a saved restaurant immediately with the restaurant id', async () => {
    const renderer = renderScreen();

    await act(async () => {
      await renderer.root.findByType('VisitRestaurantSearchSection').props.savedOptions[0].onPress();
    });

    const searchSection = renderer.root.findByType('VisitRestaurantSearchSection');
    expect(searchSection.props.footerContent).toBeUndefined();

    expect(mockAddRestaurant).toHaveBeenCalledWith({
      isOnline: true,
      restaurant: savedRestaurant.restaurant,
      sessionId: 'session-1',
    });
    expect(mockSetSearchQuery).toHaveBeenCalledWith('');
    expect(mockClearPlacesSearchState).toHaveBeenCalledTimes(1);
  });

  it('passes offline state and search errors through to restaurant search', () => {
    mockedUseConnectivity.mockReturnValue({ isOnline: false } as never);
    mockLifecycleSession(planningSession);
    mockedUseRestaurantSelectionFlow.mockReturnValueOnce(buildRestaurantSelectionFlowResult({
      search: {
        ...buildRestaurantSelectionFlowResult().search,
        searchErrorMessage: 'Could not search restaurants.',
      },
    }));

    const renderer = renderScreen();
    const searchSection = renderer.root.findByType('VisitRestaurantSearchSection');

    expect(searchSection.props.connectivityWarningMessage).toBe('Restaurant search requires internet connection.');
    expect(searchSection.props.currentLocationDisabled).toBe(true);
    expect(searchSection.props.searchErrorMessage).toBe('Could not search restaurants.');
  });

  it('renders newly added restaurants when the API returns null items', () => {
    mockLifecycleSession({
        ...planningSession,
        restaurants: [
          {
            createdAt: '2026-05-16T10:05:00.000Z',
            id: 'suggestion-1',
            items: null,
            restaurantId: 'restaurant-1',
            restaurantName: 'Corner Ramen',
            status: 'approved',
            suggestedByParticipantId: 'participant-1',
          },
        ],
      } as unknown as TastingSessionRecord);

    const renderer = renderScreen();

    expect(renderer.root.findAllByType('Text').some((node: any) => node.props.children === 'Corner Ramen')).toBe(true);
    expect(
      renderer.root.findAllByType('Text').some((node: any) => node.props.children?.join?.('') === '0 selected items'),
    ).toBe(true);
  });

  it('renders add item controls for leaders on non-rejected restaurants', async () => {
    mockLifecycleSession(sessionWithRestaurant);
    mockedUseTastingPlanMenuCatalog.mockReturnValue({
      menuItemsQuery: {
        data: [
          {
            id: 'menu-item-2',
            name: 'Tonkotsu Ramen',
            restaurant: 'restaurant-1',
          },
        ],
        isError: false,
        isLoading: false,
        refetch: jest.fn(),
      },
      menuReviewSubmitted: false,
      requestMenuReview: jest.fn().mockResolvedValue({ status: 'completed' }),
    } as unknown as ReturnType<typeof useTastingPlanMenuCatalog>);

    const renderer = renderScreen();

    act(() => {
      renderer.root.findByType('FeatureDetailScreenScaffold').props.primaryAction.onPress();
    });

    const picker = renderer.root.findByType('RestaurantMenuItemPicker');
    expect(picker.props.selectedCount).toBe(1);

    act(() => {
      picker.props.onScanMenuPhoto();
    });

    expect(mockNavigate).toHaveBeenCalledWith('ProcessPhotos', {
      autoStartSourcePicker: false,
      mode: 'menu_scan',
      restaurantId: 'restaurant-1',
      restaurantName: 'Corner Ramen',
      returnTo: 'TastingSessionPlanning',
      tastingSessionId: 'session-1',
    });

    await act(async () => {
      await picker.props.onToggleItem({
        id: 'menu-item-2',
        name: 'Tonkotsu Ramen',
        restaurant: 'restaurant-1',
      });
    });

    expect(mockAddMenuItem).toHaveBeenCalledWith({
      existingSuggestionId: undefined,
      isOnline: true,
      menuItem: {
        id: 'menu-item-2',
        name: 'Tonkotsu Ramen',
        restaurant: 'restaurant-1',
      },
      restaurantSuggestionId: 'suggestion-1',
      sessionId: 'session-1',
    });
  });

  it('asks the leader to confirm before starting when a selected restaurant has no menu items', async () => {
    mockLifecycleSession(sessionWithPartialRestaurantItems);

    const renderer = renderScreen();

    act(() => {
      renderer.root.findByType('FeatureDetailScreenScaffold').props.primaryAction.onPress();
    });

    act(() => {
      renderer.root.findByType('FeatureDetailScreenScaffold').props.primaryAction.onPress();
    });

    const modal = renderer.root.findByType('Modal');
    expect(modal.props.visible).toBe(true);
    expect(modal.props.title).toBe('Continue without menu items?');
    expect(modal.props.description).toBe(
      'Are you sure you want to continue? Sushi Stand does not have a menu item to rate.',
    );
    expect(mockStartTasting).not.toHaveBeenCalled();

    await act(async () => {
      await modal.props.primaryAction.onPress();
    });

    expect(mockStartTasting).toHaveBeenCalledWith({
      isOnline: true,
      sessionId: 'session-1',
    });
    expect(mockReplace).toHaveBeenCalledWith('TastingSessionTasting', {
      sessionId: 'session-1',
    });
  });

  it('lets the leader delete the session from the planning header', async () => {
    const renderer = renderScreen();
    const scaffold = renderer.root.findByType('FeatureDetailScreenScaffold');
    const deleteButton = scaffold.props.rightAccessory;

    expect(deleteButton.props.testID).toBe('delete-tasting-session-header-button');

    act(() => {
      deleteButton.props.onPress();
    });

    const deleteModal = renderer.root.findAllByType('ConfirmDestructiveModal').find(
      (node: any) => node.props.title === 'Delete Tasting Session?',
    );

    expect(deleteModal?.props.visible).toBe(true);
    expect(deleteModal?.props.confirmLabel).toBe('Delete Session');

    await act(async () => {
      await deleteModal?.props.onConfirm();
    });

    expect(mockDeleteSession).toHaveBeenCalledWith({
      isOnline: true,
      sessionId: 'session-1',
    });
    expect(mockNavigate).toHaveBeenCalledWith('TastingSessions');
  });

  it('does not show the planning delete action to non-leaders', () => {
    mockedUseAuth.mockReturnValue({
      actualUser: { isAdmin: false },
      user: {
        id: 'user-2',
        isAdmin: false,
        isSubscriber: false,
      },
    } as never);
    mockLifecycleSession(sessionWithRestaurant);

    const renderer = renderScreen();

    expect(renderer.root.findByType('FeatureDetailScreenScaffold').props.rightAccessory).toBeUndefined();
  });

  it('renders the plan read-only for non-leaders', () => {
    mockedUseAuth.mockReturnValue({
      actualUser: { isAdmin: false },
      user: {
        id: 'user-2',
        isAdmin: false,
        isSubscriber: false,
      },
    } as never);
    mockLifecycleSession(sessionWithRestaurant);

    const renderer = renderScreen();

    expect(renderer.root.findAllByType('VisitRestaurantSearchSection')).toHaveLength(0);
    expect(renderer.root.findAllByType('Input').some((node: any) => node.props.label === 'New menu item')).toBe(false);
    expect(renderer.root.findAllByType('Button').some((node: any) => node.props.label === 'Add New Item')).toBe(false);
    expect(renderer.root.findAllByType('Text').some((node: any) => node.props.children === 'Corner Ramen')).toBe(true);
    expect(renderer.root.findByType('FeatureDetailScreenScaffold').props.subtitle).toBe(
      'Waiting for the leader to choose restaurants and menu items for the tasting plan.',
    );
  });

  it('moves invitees from planning to tasting when the leader starts rating', () => {
    mockedUseAuth.mockReturnValue({
      actualUser: { isAdmin: false },
      user: {
        id: 'user-2',
        isAdmin: false,
        isSubscriber: false,
      },
    } as never);
    mockLifecycleSession({
        ...sessionWithRestaurant,
        status: 'tasting',
      });

    renderScreen();

    expect(mockReplace).toHaveBeenCalledWith('TastingSessionTasting', {
      sessionId: 'session-1',
    });
  });
});
