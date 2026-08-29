import React from 'react';
import { act, create } from 'react-test-renderer';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  convertVisitItemToFoodProduct,
  createMenuReviewRequest,
  getAuthenticatedUserIdOrNull,
  syncFoodProductMutationCaches,
  syncVisitMutationCaches,
  useMenuItemCatalogWrites,
  useMonthlyUsage,
  useRestaurantSelectedMenuItemsQuery,
} from '../features';
import { useOfflineAwareFeatureWrite } from '../features/store/useOfflineAwareFeatureWrite';
import { useVisitWrites } from '../features/store/useVisitWrites';
import { usePhotoPickerPermissions } from '../hooks/usePhotoPickerPermissions';
import { useCreateVisitRestaurantSelectionFlow } from '../hooks/useRestaurantSelectionFlow';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { CreateVisitScreen } from '../screens/CreateVisitScreen';
import { useCreateVisitDraftItems } from '../screens/createVisit/useCreateVisitDraftItems';
import { useCreateVisitSubmission } from '../screens/createVisit/useCreateVisitSubmission';
import { trackObservabilityEvent } from '../observability';

const mockReact = React;
const mockUsePreventRemove = jest.fn();
const mockTheme = {
  colors: {
    background: {
      inverse: 'inverse-background',
      muted: 'muted-background',
      overlay: 'overlay-background',
      surface: 'surface-background',
    },
    border: {
      brand: 'brand-border',
      default: 'default-border',
      strong: 'strong-border',
      subtle: 'subtle-border',
    },
    button: {
      primaryBg: 'primary-button-background',
      primaryText: 'primary-button-text',
      secondaryBg: 'secondary-button-background',
      secondaryBorder: 'secondary-button-border',
    },
    status: {
      infoBg: 'info-background',
      infoBorder: 'info-border',
      successBg: 'success-background',
      successBorder: 'success-border',
      warningBg: 'warning-background',
      warningBorder: 'warning-border',
    },
    text: {
      info: 'info-text',
      primary: 'primary-text',
      secondary: 'secondary-text',
      success: 'success-text',
      warning: 'warning-text',
      danger: 'danger-text',
    },
  },
  radii: {
    lg: 16,
    md: 12,
    pill: 999,
  },
  sizes: {
    inputMinHeight: 48,
    secondaryButtonHeight: 48,
  },
  spacing: {
    xxs: 4,
    xs: 8,
    sm: 12,
    md: 16,
    lg: 20,
  },
} as const;

const editableMenuItem = {
  createdBy: 'user-1',
  description: 'Editable item description',
  friendEatenCount: 2,
  id: 'menu-item-1',
  name: 'Editable Item',
  restaurant: 'restaurant-1',
  userEatenCount: 3,
  visibility: 'friends',
};

const nonEditableMenuItem = {
  createdBy: 'user-2',
  description: 'Public menu item description',
  id: 'menu-item-2',
  name: 'Shared Item',
  restaurant: 'restaurant-1',
  visibility: 'friends',
};

jest.mock('@tanstack/react-query', () => ({
  useInfiniteQuery: jest.fn(),
  useQuery: jest.fn(),
  useQueryClient: jest.fn(),
}));

jest.mock('@react-navigation/native', () => ({
  usePreventRemove: (...args: unknown[]) => mockUsePreventRemove(...args),
}));

jest.mock('expo-image-picker', () => ({
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      version: 'test',
    },
    nativeAppVersion: 'test',
    nativeBuildVersion: 'test',
  },
}));

jest.mock('react-native', () => {
  const React = jest.requireActual<typeof import('react')>('react');

  return {
    Linking: {
      openSettings: jest.fn(),
    },
    Platform: {
      OS: 'ios',
      select: (values: Record<string, unknown>) => values.ios ?? values.default,
    },
    Pressable: ({
      children,
      ...props
    }: Record<string, unknown> & {
      children?: React.ReactNode | ((state: { pressed: boolean }) => React.ReactNode);
    }) =>
      React.createElement(
        'Pressable',
        props,
        typeof children === 'function' ? children({ pressed: false }) : children,
      ),
    StyleSheet: {
      absoluteFillObject: {},
    },
    View: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
      React.createElement('View', props, children),
  };
});

jest.mock('../components/shared', () => ({
  ConfirmDestructiveModal: (props: Record<string, unknown>) =>
    mockReact.createElement('ConfirmDestructiveModal', props),
  EmptyState: (props: Record<string, unknown>) => mockReact.createElement('EmptyState', props),
  ErrorState: (props: Record<string, unknown>) => mockReact.createElement('ErrorState', props),
  FeatureFormScreenScaffold: (
    { children, ...props }: Record<string, unknown> & { children?: React.ReactNode },
  ) => mockReact.createElement('FeatureFormScreenScaffold', props, children),
  FeatureFormReadStateScaffold: ({
    empty,
    error,
    loading,
    scaffold,
    state,
  }: Record<string, any>) => {
    const content =
      state === 'loading'
        ? mockReact.createElement('LoadingState', loading)
        : state === 'error'
          ? mockReact.createElement('ErrorState', error)
          : mockReact.createElement('EmptyState', { title: 'Not found', ...empty });

    return mockReact.createElement('FeatureFormScreenScaffold', scaffold, content);
  },
  FocusedRestaurantSearchHeader: (props: Record<string, unknown>) =>
    mockReact.createElement('FocusedRestaurantSearchHeader', props),
  LinkedNoteCard: (props: Record<string, unknown>) => mockReact.createElement('LinkedNoteCard', props),
  LoadingState: (props: Record<string, unknown>) => mockReact.createElement('LoadingState', props),
  OptionList: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('OptionList', props, children),
  OptionListRow: (props: Record<string, unknown>) => mockReact.createElement('OptionListRow', props),
  PageErrorToast: (props: Record<string, unknown>) => mockReact.createElement('PageErrorToast', props),
  RestaurantMenuItemPicker: (props: Record<string, unknown>) =>
    mockReact.createElement('RestaurantMenuItemPicker', props),
  StepProgressBar: (props: Record<string, unknown>) => mockReact.createElement('StepProgressBar', props),
  VisitMenuItemOptionRow: (props: Record<string, unknown>) => mockReact.createElement('VisitMenuItemOptionRow', props),
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
  convertVisitItemToFoodProduct: jest.fn(),
  createMenuReviewRequest: jest.fn(),
  FREE_MONTHLY_PHOTO_UPLOAD_LIMIT: 100,
  formatFreeMonthlyPhotoLimitStatus: jest.fn(
    (remaining: number) =>
      `Free users can upload up to 100 photos per month. Remaining estimate: ${remaining}.`,
  ),
  getAuthenticatedUserIdOrNull: jest.fn(() => 'user-1'),
  getNoteDetail: jest.fn(),
  getVisitById: jest.fn(),
  resolveDefaultVisitVisibilityFromAuth: jest.fn(() => 'friends'),
  syncFoodProductMutationCaches: jest.fn(() => Promise.resolve()),
  syncVisitMutationCaches: jest.fn(() => Promise.resolve()),
  useMenuItemCatalogWrites: jest.fn(),
  useMonthlyUsage: jest.fn(),
  useRestaurantSelectedMenuItemsQuery: jest.fn(),
}));

jest.mock('../features/store/pocketbaseGateway', () => ({
  buildPocketBaseFileUrl: jest.fn(({ recordId, filename, thumb }) =>
    `pb://${recordId}/${filename}${thumb ? `?thumb=${thumb}` : ''}`,
  ),
}));

jest.mock('../features/store/useOfflineAwareFeatureWrite', () => ({
  useOfflineAwareFeatureWrite: jest.fn(),
}));

jest.mock('../features/store/useVisitWrites', () => ({
  useVisitWrites: jest.fn(),
}));

jest.mock('../hooks/usePhotoPickerPermissions', () => ({
  usePhotoPickerPermissions: jest.fn(),
}));

jest.mock('../hooks/useRestaurantSelectionFlow', () => ({
  useCreateVisitRestaurantSelectionFlow: jest.fn(),
}));

jest.mock('../lib/dateFormatting', () => ({
  formatDateToLocalDateString: jest.fn(() => '2026-04-18'),
  getTodayLocalDateString: jest.fn(() => '2026-04-18'),
  isValidLocalDate: jest.fn(() => true),
  formatPhotoAttachmentDateLabel: jest.fn(() => 'Apr 13, 2026'),
  formatStoredCalendarDateLabel: jest.fn(() => 'Apr 12, 2026'),
}));

jest.mock('../lib/photoFiles', () => ({
  buildLocalPhotoFile: jest.fn(),
}));

jest.mock('../lib/photoStaging', () => ({
  cleanupStagedPhotoFiles: jest.fn(() => Promise.resolve()),
  stageLocalPhotoFile: jest.fn((asset, options) => {
    const { buildLocalPhotoFile } = jest.requireMock('../lib/photoFiles');
    return Promise.resolve(buildLocalPhotoFile(asset, options));
  }),
}));

jest.mock('../lib/photoMetadata', () => ({
  resolvePhotoCaptureDate: jest.fn(),
}));

jest.mock('../lib/usageUiRules', () => {
  const actual = jest.requireActual<typeof import('../lib/usageUiRules')>('../lib/usageUiRules');

  return {
    ...actual,
    shouldShowOfflineUsageWarning: jest.fn(() => false),
  };
});

jest.mock('../lib/visitRestaurantSearch', () => ({
  buildVisitRestaurantDescription: jest.fn(() => 'Restaurant description'),
}));

jest.mock('../observability', () => ({
  trackObservabilityEvent: jest.fn(),
}));

jest.mock('../providers/AuthProvider', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../providers/ConnectivityProvider', () => ({
  useConnectivity: jest.fn(),
}));

jest.mock('../screens/createVisit/CreateVisitReviewStep', () => ({
  CreateVisitReviewStep: (props: Record<string, unknown>) =>
    mockReact.createElement('CreateVisitReviewStep', props),
}));

jest.mock('../screens/createVisit/useCreateVisitDraftItems', () => ({
  useCreateVisitDraftItems: jest.fn(),
}));

jest.mock('../screens/createVisit/useCreateVisitSubmission', () => ({
  useCreateVisitSubmission: jest.fn(),
}));

jest.mock('../theme', () => ({
  createThemedStyles:
    (factory: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) =>
      factory(mockTheme, ...args),
  useTheme: () => mockTheme,
}));

jest.mock('../ui', () => ({
  Card: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Card', props, children),
  Input: (props: Record<string, unknown>) => mockReact.createElement('Input', props),
  Modal: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Modal', props, children),
  Text: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Text', props, children),
}));

const mockedUseQuery = useQuery as jest.MockedFunction<typeof useQuery>;
const mockedUseInfiniteQuery = useInfiniteQuery as jest.MockedFunction<typeof useInfiniteQuery>;
const mockedUseQueryClient = useQueryClient as jest.MockedFunction<typeof useQueryClient>;
const mockedCreateMenuReviewRequest = createMenuReviewRequest as jest.MockedFunction<
  typeof createMenuReviewRequest
>;
const mockedConvertVisitItemToFoodProduct = convertVisitItemToFoodProduct as jest.MockedFunction<
  typeof convertVisitItemToFoodProduct
>;
const mockedSyncFoodProductMutationCaches = syncFoodProductMutationCaches as jest.MockedFunction<
  typeof syncFoodProductMutationCaches
>;
const mockedSyncVisitMutationCaches = syncVisitMutationCaches as jest.MockedFunction<
  typeof syncVisitMutationCaches
>;
const mockedGetAuthenticatedUserIdOrNull =
  getAuthenticatedUserIdOrNull as jest.MockedFunction<typeof getAuthenticatedUserIdOrNull>;
const mockedUseMenuItemCatalogWrites = useMenuItemCatalogWrites as jest.MockedFunction<
  typeof useMenuItemCatalogWrites
>;
const mockedUseMonthlyUsage = useMonthlyUsage as jest.MockedFunction<typeof useMonthlyUsage>;
const mockedUseRestaurantSelectedMenuItemsQuery =
  useRestaurantSelectedMenuItemsQuery as jest.MockedFunction<
    typeof useRestaurantSelectedMenuItemsQuery
  >;
const mockedUseOfflineAwareFeatureWrite = useOfflineAwareFeatureWrite as jest.MockedFunction<
  typeof useOfflineAwareFeatureWrite
>;
const mockedUseVisitWrites = useVisitWrites as jest.MockedFunction<typeof useVisitWrites>;
const mockedUsePhotoPickerPermissions = usePhotoPickerPermissions as jest.MockedFunction<
  typeof usePhotoPickerPermissions
>;
const mockedUseRestaurantSelectionFlow = useCreateVisitRestaurantSelectionFlow as jest.MockedFunction<
  typeof useCreateVisitRestaurantSelectionFlow
>;
const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockedUseConnectivity = useConnectivity as jest.MockedFunction<typeof useConnectivity>;
const mockedUseCreateVisitDraftItems = useCreateVisitDraftItems as jest.MockedFunction<
  typeof useCreateVisitDraftItems
>;
const mockedUseCreateVisitSubmission = useCreateVisitSubmission as jest.MockedFunction<
  typeof useCreateVisitSubmission
>;
const mockedTrackObservabilityEvent = trackObservabilityEvent as jest.MockedFunction<
  typeof trackObservabilityEvent
>;

function buildQueryResult<T>(data: T) {
  return {
    data,
    isError: false,
    isLoading: false,
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof useQuery>;
}

function buildMenuItemsInfiniteQueryResult(items = [editableMenuItem, nonEditableMenuItem]) {
  return {
    data: {
      pages: [{
        items,
        page: 1,
        pageSize: 20,
        totalItems: items.length,
        totalPages: items.length > 0 ? 1 : 0,
        hasNextPage: false,
      }],
      pageParams: [1],
    },
    error: null,
    fetchNextPage: jest.fn(),
    hasNextPage: false,
    isError: false,
    isFetchingNextPage: false,
    isPending: false,
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof useInfiniteQuery>;
}

function buildAllLocationsHistory(items: Record<string, unknown>[]) {
  return {
    anchorRestaurant: {
      id: 'restaurant-1',
      name: 'Fire',
    },
    itemCount: items.length,
    items,
    locationCount: 1,
    normalizedName: 'fire',
    restaurants: [],
    visitCount: items.length,
  };
}

function buildGroupMenuSuggestions(suggestions: Record<string, unknown>[]) {
  return {
    restaurantGroupId: 'group-1',
    restaurantId: 'restaurant-1',
    suggestions,
  };
}

function buildDefaultCreateVisitQueryResult(options: { queryKey?: readonly unknown[] }) {
  if (options.queryKey?.includes('menuItems')) {
    return buildQueryResult([editableMenuItem, nonEditableMenuItem]);
  }

  if (options.queryKey?.includes('allLocationsHistory')) {
    return buildQueryResult(buildAllLocationsHistory([]));
  }

  if (options.queryKey?.includes('groupMenuSuggestions')) {
    return buildQueryResult(buildGroupMenuSuggestions([]));
  }

  return buildQueryResult(null);
}

describe('CreateVisitScreen', () => {
  let createMenuItem: jest.Mock;
  let setDraftItems: jest.Mock;
  let toggleMenuItemSelection: jest.Mock;
  let navigation: {
    canGoBack: jest.Mock;
    dispatch: jest.Mock;
    goBack: jest.Mock;
    navigate: jest.Mock;
    setParams: jest.Mock;
  };

  beforeEach(() => {
    createMenuItem = jest.fn();
    setDraftItems = jest.fn();
    toggleMenuItemSelection = jest.fn();
    navigation = {
      canGoBack: jest.fn(() => true),
      dispatch: jest.fn(),
      goBack: jest.fn(),
      navigate: jest.fn(),
      setParams: jest.fn(),
    };

    mockedUseQuery.mockReset();
    mockedUseQuery.mockImplementation(buildDefaultCreateVisitQueryResult);
    mockedUseInfiniteQuery.mockReset();
    mockedUseInfiniteQuery.mockReturnValue(buildMenuItemsInfiniteQueryResult());
    mockedUseQueryClient.mockReset();
    mockedUseQueryClient.mockReturnValue({
      getQueryData: jest.fn(),
      getQueriesData: jest.fn(() => []),
      invalidateQueries: jest.fn(),
      setQueryData: jest.fn(),
    } as unknown as ReturnType<typeof useQueryClient>);
    mockedCreateMenuReviewRequest.mockReset();
    mockedConvertVisitItemToFoodProduct.mockReset();
    mockedConvertVisitItemToFoodProduct.mockResolvedValue({
      deletedSourceVisit: false,
      foodProductId: 'food-product-1',
      sourceVisitId: 'visit-1',
    });
    mockedSyncFoodProductMutationCaches.mockClear();
    mockedSyncVisitMutationCaches.mockClear();
    mockedGetAuthenticatedUserIdOrNull.mockReset();
    mockedGetAuthenticatedUserIdOrNull.mockReturnValue('user-1');
    mockedUseMonthlyUsage.mockReset();
    mockedUseMonthlyUsage.mockReturnValue({
      snapshot: null,
      cachedAt: null,
      isUsingCachedSnapshot: false,
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: jest.fn(),
    });
    mockedUseRestaurantSelectedMenuItemsQuery.mockReset();
    mockedUseRestaurantSelectedMenuItemsQuery.mockReturnValue({
      data: [],
    } as unknown as ReturnType<typeof useRestaurantSelectedMenuItemsQuery>);
    mockedUseMenuItemCatalogWrites.mockReset();
    mockedUseMenuItemCatalogWrites.mockReturnValue({
      applyScannedMenuItems: jest.fn(),
      createMenuItem,
      createMenuItemAndAddToTastingPlan: jest.fn(),
      updateMenuItem: jest.fn(),
    } as unknown as ReturnType<typeof useMenuItemCatalogWrites>);
    mockedUseOfflineAwareFeatureWrite.mockReset();
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(jest.fn() as ReturnType<typeof useOfflineAwareFeatureWrite>);
    mockedUseVisitWrites.mockReset();
    mockedUseVisitWrites.mockReturnValue({
      convertVisitItemToFoodProduct: jest.fn(async ({ itemId, sourceVisitId }) => {
        const result = await mockedConvertVisitItemToFoodProduct({ itemId });
        await mockedSyncVisitMutationCaches({} as never, {
          visitId: sourceVisitId,
          includeVisitPhotos: true,
        });
        await mockedSyncFoodProductMutationCaches({} as never, {
          foodProductId: result.foodProductId,
          includeFoodProductPhotos: true,
        });
        return {
          result,
          status: 'completed',
        };
      }),
      createVisit: jest.fn(),
      deleteVisit: jest.fn(),
      deleteVisitItem: jest.fn(),
      moveVisitItem: jest.fn(),
      updateVisit: jest.fn(),
    } as unknown as ReturnType<typeof useVisitWrites>);
    mockedUsePhotoPickerPermissions.mockReset();
    mockedUsePhotoPickerPermissions.mockReturnValue({
      permissionNeedsSettings: false,
      requestPermission: jest.fn(),
      resetPermissionNeedsSettings: jest.fn(),
    } as ReturnType<typeof usePhotoPickerPermissions>);
    mockedUseRestaurantSelectionFlow.mockReset();
    mockedUseRestaurantSelectionFlow.mockReturnValue({
      menuItems: {
        loadedRestaurantRecords: [],
        query: {
          data: [editableMenuItem, nonEditableMenuItem],
          isError: false,
          isLoading: false,
          refetch: jest.fn(),
        },
      },
      quotaDisplay: {
        isPlacesQuotaReached: false,
        placesQueriesRemaining: null,
        shouldShowPlacesUpgradePrompt: false,
      },
      savedSuggestions: {
        displayedSavedRestaurants: [],
        emptyDescription: 'No saved restaurants',
        emptyTitle: 'No saved restaurants',
        errorMessage: null,
        isLoading: false,
        refetch: jest.fn(),
        title: 'Saved restaurants',
      },
      search: {
        clearErrorMessage: jest.fn(),
        clearPlacesState: jest.fn(),
        compactLabel: 'Search',
        displayedNearbyRestaurants: [],
        expandedLabel: 'Search nearby',
        isExpanded: false,
        isGettingLocation: false,
        isSearchingNearby: false,
        isSearchingText: false,
        locationPermissionNeedsSettings: false,
        manualLocation: '',
        nearby: jest.fn().mockResolvedValue({ status: 'success', results: [] }),
        query: '',
        selectCurrentLocation: jest.fn(),
        searchButtonDisabled: false,
        searchByText: jest.fn().mockResolvedValue({ status: 'success', results: [] }),
        searchErrorMessage: null,
        setExpanded: jest.fn(),
        setManualLocation: jest.fn(),
        setQuery: jest.fn(),
        showNearbyPlaces: false,
      },
    } as unknown as ReturnType<typeof useCreateVisitRestaurantSelectionFlow>);
    mockedUseAuth.mockReset();
    mockedUseAuth.mockReturnValue({
      actualUser: {
        isAdmin: false,
      },
      user: {
        isAdmin: false,
        isSubscriber: true,
      },
    } as ReturnType<typeof useAuth>);
    mockedUseConnectivity.mockReset();
    mockedUseConnectivity.mockReturnValue({
      isOnline: true,
    } as ReturnType<typeof useConnectivity>);
    mockUsePreventRemove.mockReset();
    mockedUseCreateVisitDraftItems.mockReset();
    mockedUseCreateVisitDraftItems.mockReturnValue({
      draftItems: [],
      draftPhotoCount: 0,
      isMenuItemSelected: jest.fn(() => false),
      removeDraftItem: jest.fn(),
      removeDraftItemPhoto: jest.fn(),
      selectedMenuItemCount: 0,
      setDraftItems,
      toggleMenuItemSelection,
      updateDraftItem: jest.fn(),
    } as ReturnType<typeof useCreateVisitDraftItems>);
    mockedUseCreateVisitSubmission.mockReset();
    mockedUseCreateVisitSubmission.mockReturnValue({
      isSubmitting: false,
      submitVisit: jest.fn(),
    } as ReturnType<typeof useCreateVisitSubmission>);
  });

  it('uses a server-provided per-item photo limit for display and enforcement', async () => {
    const requestPermission = jest.fn();
    mockedUseMonthlyUsage.mockReturnValue({
      snapshot: {
        limits: { photoUploadsPerRecord: 3 },
      },
    } as never);
    mockedUsePhotoPickerPermissions.mockReturnValue({
      permissionNeedsSettings: false,
      requestPermission,
      resetPermissionNeedsSettings: jest.fn(),
    } as ReturnType<typeof usePhotoPickerPermissions>);
    mockedUseCreateVisitDraftItems.mockReturnValue({
      draftItems: [
        {
          deletedPhotoIds: [],
          description: '',
          id: 'item-1',
          name: 'Sample',
          notes: '',
          photos: [0, 1, 2].map((index) => ({
            id: `photo-${index}`,
            kind: 'new' as const,
            labelDate: 'Today',
            thumbnailUri: `file:///photo-${index}.jpg`,
            upload: {
              mimeType: 'image/jpeg',
              name: `photo-${index}.jpg`,
              uri: `file:///photo-${index}.jpg`,
            },
            viewerUri: `file:///photo-${index}.jpg`,
          })),
          rating: 3,
        },
      ],
      draftPhotoCount: 3,
      isMenuItemSelected: jest.fn(() => true),
      removeDraftItem: jest.fn(),
      removeDraftItemPhoto: jest.fn(),
      selectedMenuItemCount: 1,
      setDraftItems,
      toggleMenuItemSelection,
      updateDraftItem: jest.fn(),
    } as ReturnType<typeof useCreateVisitDraftItems>);

    let renderer: any;
    await act(async () => {
      renderer = create(
        <CreateVisitScreen
          navigation={navigation as never}
          route={{ params: { returnToStep: 2 } } as never}
        />,
      );
    });

    const reviewStep = renderer.root.findByType('CreateVisitReviewStep');
    expect(reviewStep.props.displayMaxPhotosPerItem).toBe(3);

    await act(async () => {
      await reviewStep.props.onAttachPhoto('item-1', 'gallery');
    });

    expect(requestPermission).not.toHaveBeenCalled();
    expect(renderer.root.findByType('PageErrorToast').props.errorMessage).toBe(
      'You can upload up to 3 photos per item.',
    );
    expect(mockedTrackObservabilityEvent).toHaveBeenCalledWith(
      'USAGE_LIMIT_REACHED',
      expect.objectContaining({
        limit: 3,
        metric: 'photo_uploads_per_record',
        remaining: 0,
        used: 3,
      }),
    );
  });

  it('retains the subscriber per-item photo fallback without a usage snapshot', async () => {
    mockedUseCreateVisitDraftItems.mockReturnValue({
      draftItems: [
        {
          deletedPhotoIds: [],
          description: '',
          id: 'item-1',
          name: 'Sample',
          notes: '',
          photos: [],
          rating: 3,
        },
      ],
      draftPhotoCount: 0,
      isMenuItemSelected: jest.fn(() => true),
      removeDraftItem: jest.fn(),
      removeDraftItemPhoto: jest.fn(),
      selectedMenuItemCount: 1,
      setDraftItems,
      toggleMenuItemSelection,
      updateDraftItem: jest.fn(),
    } as ReturnType<typeof useCreateVisitDraftItems>);

    let renderer: any;
    await act(async () => {
      renderer = create(
        <CreateVisitScreen
          navigation={navigation as never}
          route={{ params: { returnToStep: 2 } } as never}
        />,
      );
    });

    expect(renderer.root.findByType('CreateVisitReviewStep').props.displayMaxPhotosPerItem).toBe(20);
  });

  it('keeps actual administrators unlimited while previewing the free tier', async () => {
    const requestPermission = jest.fn().mockResolvedValue({
      canAskAgain: true,
      granted: false,
      message: 'Picker stopped for test.',
    });
    mockedUseAuth.mockReturnValue({
      actualUser: { isAdmin: true },
      user: { isAdmin: false, isSubscriber: false },
    } as ReturnType<typeof useAuth>);
    mockedUseMonthlyUsage.mockReturnValue({
      snapshot: {
        limits: { photoUploadsPerRecord: 1 },
        remaining: { placesQueriesMonthly: null },
      },
    } as never);
    mockedUsePhotoPickerPermissions.mockReturnValue({
      permissionNeedsSettings: false,
      requestPermission,
      resetPermissionNeedsSettings: jest.fn(),
    } as ReturnType<typeof usePhotoPickerPermissions>);
    mockedUseCreateVisitDraftItems.mockReturnValue({
      draftItems: [
        {
          deletedPhotoIds: [],
          description: '',
          id: 'item-1',
          name: 'Sample',
          notes: '',
          photos: [
            {
              id: 'photo-1',
              kind: 'new',
              labelDate: 'Today',
              thumbnailUri: 'file:///photo-1.jpg',
              upload: {
                mimeType: 'image/jpeg',
                name: 'photo-1.jpg',
                uri: 'file:///photo-1.jpg',
              },
              viewerUri: 'file:///photo-1.jpg',
            },
          ],
          rating: 3,
        },
      ],
      draftPhotoCount: 1,
      isMenuItemSelected: jest.fn(() => true),
      removeDraftItem: jest.fn(),
      removeDraftItemPhoto: jest.fn(),
      selectedMenuItemCount: 1,
      setDraftItems,
      toggleMenuItemSelection,
      updateDraftItem: jest.fn(),
    } as ReturnType<typeof useCreateVisitDraftItems>);

    let renderer: any;
    await act(async () => {
      renderer = create(
        <CreateVisitScreen
          navigation={navigation as never}
          route={{ params: { returnToStep: 2 } } as never}
        />,
      );
    });

    const reviewStep = renderer.root.findByType('CreateVisitReviewStep');
    expect(reviewStep.props.displayMaxPhotosPerItem).toBeNull();

    await act(async () => {
      await reviewStep.props.onAttachPhoto('item-1', 'gallery');
    });

    expect(mockedUseMonthlyUsage).toHaveBeenCalledWith({ viewAsTier: 'free' });
    expect(requestPermission).toHaveBeenCalledWith('gallery');
    expect(renderer.root.findByType('PageErrorToast').props.errorMessage).toBe(
      'Picker stopped for test.',
    );
  });

  it('shows only user-created saved restaurants before search while preserving API search results', async () => {
    mockedUseRestaurantSelectionFlow.mockReturnValue({
      menuItems: {
        loadedRestaurantRecords: [],
        query: {
          data: [editableMenuItem, nonEditableMenuItem],
          isError: false,
          isLoading: false,
          refetch: jest.fn(),
        },
      },
      quotaDisplay: {
        isPlacesQuotaReached: false,
        placesQueriesRemaining: null,
        shouldShowPlacesUpgradePrompt: false,
      },
      savedSuggestions: {
        displayedSavedRestaurants: [
          {
            distance: null,
            restaurant: {
              id: 'restaurant-manual',
              isGooglePlace: false,
              name: 'Manual Noodle House',
            },
          },
          {
            distance: null,
            restaurant: {
              id: 'restaurant-google-saved',
              isGooglePlace: true,
              name: 'Google Saved Ramen',
            },
          },
        ],
        emptyDescription: 'No saved restaurants',
        emptyTitle: 'No saved restaurants',
        errorMessage: null,
        isLoading: false,
        refetch: jest.fn(),
        title: 'Saved restaurants',
      },
      search: {
        clearErrorMessage: jest.fn(),
        clearPlacesState: jest.fn(),
        compactLabel: 'Search',
        displayedNearbyRestaurants: [
          {
            distance: null,
            restaurant: {
              id: 'restaurant-google-result',
              isGooglePlace: true,
              name: 'Google Result Ramen',
            },
          },
        ],
        expandedLabel: 'Search nearby',
        isExpanded: false,
        isGettingLocation: false,
        isSearchingNearby: false,
        isSearchingText: false,
        locationPermissionNeedsSettings: false,
        manualLocation: '',
        nearby: jest.fn().mockResolvedValue({ status: 'success', results: [] }),
        query: '',
        selectCurrentLocation: jest.fn(),
        searchButtonDisabled: false,
        searchByText: jest.fn().mockResolvedValue({ status: 'success', results: [] }),
        searchErrorMessage: null,
        setExpanded: jest.fn(),
        setManualLocation: jest.fn(),
        setQuery: jest.fn(),
        showNearbyPlaces: true,
      },
    } as unknown as ReturnType<typeof useCreateVisitRestaurantSelectionFlow>);
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <CreateVisitScreen
          navigation={navigation as never}
          route={{ params: {} } as never}
        />,
      );
    });

    const searchSection = renderer.root.findByType('VisitRestaurantSearchSection');

    expect(searchSection.props.savedOptions.map((option: any) => option.title)).toEqual([
      'Manual Noodle House',
    ]);
    expect(searchSection.props.searchResultsOptions.map((option: any) => option.title)).toEqual([
      'Google Result Ramen',
    ]);
  });

  it('preselects current location when expanding restaurant search', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <CreateVisitScreen
          navigation={navigation as never}
          route={{ params: {} } as never}
        />,
      );
    });

    const searchSection = renderer.root.findByType('VisitRestaurantSearchSection');
    const toggle = searchSection.props.headerAccessory;
    const selectionFlow = mockedUseRestaurantSelectionFlow.mock.results[0]
      .value as ReturnType<typeof useCreateVisitRestaurantSelectionFlow>;

    await act(async () => {
      toggle.props.onPress();
    });

    expect(selectionFlow.search.setExpanded).toHaveBeenCalledWith(true);
    expect(selectionFlow.search.selectCurrentLocation).toHaveBeenCalledTimes(1);
  });

  it('preselects current location when focusing place search into the full search view', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <CreateVisitScreen
          navigation={navigation as never}
          route={{ params: {} } as never}
        />,
      );
    });

    const searchSection = renderer.root.findByType('VisitRestaurantSearchSection');
    const selectionFlow = mockedUseRestaurantSelectionFlow.mock.results[0]
      .value as ReturnType<typeof useCreateVisitRestaurantSelectionFlow>;

    await act(async () => {
      searchSection.props.onSearchQueryFocus();
    });

    expect(selectionFlow.search.selectCurrentLocation).toHaveBeenCalledTimes(1);
  });

  it('uses compact row actions only for user-created menu items and preserves selection wiring', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <CreateVisitScreen
          navigation={navigation as never}
          route={{
            params: {
              preselectedRestaurantId: 'restaurant-1',
              preselectedRestaurantName: 'Fire',
              returnToStep: 1,
            },
          } as never}
        />,
      );
    });

    const scaffold = renderer.root.findByType('FeatureFormScreenScaffold');
    const picker = renderer.root.findByType('RestaurantMenuItemPicker');

    expect(scaffold.props.primaryAction.label).toBe('Select Items');
    expect(picker.props.items).toEqual([editableMenuItem, nonEditableMenuItem]);
    expect(picker.props.currentUserId).toBe('user-1');
    expect(picker.props.selectedCount).toBe(0);
    expect(typeof picker.props.onEditItem).toBe('function');

    await act(async () => {
      picker.props.onToggleItem(editableMenuItem);
    });

    expect(toggleMenuItemSelection).toHaveBeenCalledWith(editableMenuItem);

    act(() => {
      picker.props.onEditItem(editableMenuItem);
    });

    expect(navigation.navigate).toHaveBeenCalledWith('CreateVisitEditMenuItem', {
      initialName: editableMenuItem.name,
      initialVisibility: editableMenuItem.visibility,
      menuItemId: editableMenuItem.id,
      restaurantId: editableMenuItem.restaurant,
    });
  });

  it('hydrates preselected menu items that are outside the loaded catalog page', async () => {
    mockedUseCreateVisitDraftItems.mockReturnValue({
      draftItems: [
        {
          deletedPhotoIds: [],
          description: '',
          id: 'draft-1',
          name: editableMenuItem.name,
          notes: '',
          photos: [],
          rating: 0,
          sourceMenuItemId: editableMenuItem.id,
        },
      ],
      draftPhotoCount: 0,
      isMenuItemSelected: jest.fn((item) => item.id === editableMenuItem.id),
      removeDraftItem: jest.fn(),
      removeDraftItemPhoto: jest.fn(),
      selectedMenuItemCount: 1,
      setDraftItems,
      toggleMenuItemSelection,
      updateDraftItem: jest.fn(),
    } as ReturnType<typeof useCreateVisitDraftItems>);
    mockedUseRestaurantSelectedMenuItemsQuery.mockReturnValue({
      data: [editableMenuItem],
    } as unknown as ReturnType<typeof useRestaurantSelectedMenuItemsQuery>);

    let renderer: any = null;
    await act(async () => {
      renderer = create(
        <CreateVisitScreen
          navigation={navigation as never}
          route={{
            params: {
              preselectedRestaurantId: 'restaurant-1',
              preselectedRestaurantName: 'Fire',
              returnToStep: 1,
            },
          } as never}
        />,
      );
    });

    expect(mockedUseRestaurantSelectedMenuItemsQuery).toHaveBeenCalledWith({
      enabled: true,
      isOnline: true,
      itemIds: [editableMenuItem.id],
      restaurantId: 'restaurant-1',
    });
    expect(renderer.root.findByType('RestaurantMenuItemPicker').props.selectedItems).toEqual([
      editableMenuItem,
    ]);
  });

  it('passes non-duplicate all locations history items into the menu item picker', async () => {
    mockedUseQuery.mockImplementation((options: { queryKey?: readonly unknown[] }) => {
      if (options.queryKey?.includes('allLocationsHistory')) {
        return buildQueryResult(
          buildAllLocationsHistory([
            {
              averageRating: 5,
              displayName: 'Coconut Yogurt',
              latestRating: 5,
              latestRestaurantId: 'restaurant-2',
              latestRestaurantLocation: 'Venice, CA',
              latestRestaurantName: 'Fire',
              latestVisitedAt: '2026-04-05T18:30:00.000Z',
              normalizedItemName: 'coconut yogurt',
              orderCount: 1,
              restaurants: [],
            },
          ]),
        );
      }

      return buildDefaultCreateVisitQueryResult(options);
    });
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <CreateVisitScreen
          navigation={navigation as never}
          route={{
            params: {
              preselectedRestaurantId: 'restaurant-1',
              preselectedRestaurantName: 'Fire',
              returnToStep: 1,
            },
          } as never}
        />,
      );
    });

    const picker = renderer.root.findByType('RestaurantMenuItemPicker');
    expect(picker.props.crossLocationItems).toEqual([
      {
        id: 'coconut yogurt',
        latestRating: 5,
        latestRestaurantLocation: 'Venice, CA',
        latestRestaurantName: 'Fire',
        name: 'Coconut Yogurt',
        orderCount: 1,
        source: 'allLocationsHistory',
      },
    ]);
  });

  it('passes related-location suggestions before all locations history into the menu item picker', async () => {
    mockedUseQuery.mockImplementation((options: { queryKey?: readonly unknown[] }) => {
      if (options.queryKey?.includes('groupMenuSuggestions')) {
        return buildQueryResult(
          buildGroupMenuSuggestions([
            {
              displayName: 'Coconut Yogurt',
              normalizedItemName: 'coconut yogurt',
              sourceItemCount: 3,
              sourceRestaurantCount: 2,
              sources: [
                {
                  menuItemCount: 3,
                  menuItemIds: ['menu-item-3', 'menu-item-4', 'menu-item-5'],
                  restaurantId: 'restaurant-2',
                  restaurantLocation: 'Venice, CA',
                  restaurantName: 'Fire',
                },
              ],
            },
          ]),
        );
      }

      if (options.queryKey?.includes('allLocationsHistory')) {
        return buildQueryResult(
          buildAllLocationsHistory([
            {
              averageRating: 5,
              displayName: 'Coconut Yogurt',
              latestRating: 5,
              latestRestaurantId: 'restaurant-2',
              latestRestaurantLocation: 'Venice, CA',
              latestRestaurantName: 'Fire',
              latestVisitedAt: '2026-04-05T18:30:00.000Z',
              normalizedItemName: 'coconut yogurt',
              orderCount: 1,
              restaurants: [],
            },
            {
              averageRating: 4,
              displayName: 'Noodle Soup',
              latestRating: 4,
              latestRestaurantId: 'restaurant-3',
              latestRestaurantName: 'Fire',
              latestVisitedAt: '2026-04-06T18:30:00.000Z',
              normalizedItemName: 'noodle soup',
              orderCount: 2,
              restaurants: [],
            },
          ]),
        );
      }

      return buildDefaultCreateVisitQueryResult(options);
    });
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <CreateVisitScreen
          navigation={navigation as never}
          route={{
            params: {
              preselectedRestaurantId: 'restaurant-1',
              preselectedRestaurantName: 'Fire',
              returnToStep: 1,
            },
          } as never}
        />,
      );
    });

    const picker = renderer.root.findByType('RestaurantMenuItemPicker');
    expect(picker.props.crossLocationLabel).toBe('All Locations History');
    expect(picker.props.crossLocationItems).toEqual([
      expect.objectContaining({
        name: 'Coconut Yogurt',
        source: 'relatedLocationSuggestion',
        sourceItemCount: 3,
        sourceRestaurantCount: 2,
      }),
      expect.objectContaining({
        name: 'Noodle Soup',
        source: 'allLocationsHistory',
      }),
    ]);
  });

  it('filters all locations history items already on the current restaurant menu', async () => {
    mockedUseQuery.mockImplementation((options: { queryKey?: readonly unknown[] }) => {
      if (options.queryKey?.includes('allLocationsHistory')) {
        return buildQueryResult(
          buildAllLocationsHistory([
            {
              averageRating: 5,
              displayName: 'Editable Item',
              latestRating: 5,
              latestRestaurantId: 'restaurant-2',
              latestRestaurantName: 'Fire',
              latestVisitedAt: '2026-04-05T18:30:00.000Z',
              normalizedItemName: 'editable item',
              orderCount: 1,
              restaurants: [],
            },
          ]),
        );
      }

      return buildDefaultCreateVisitQueryResult(options);
    });
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <CreateVisitScreen
          navigation={navigation as never}
          route={{
            params: {
              preselectedRestaurantId: 'restaurant-1',
              preselectedRestaurantName: 'Fire',
              returnToStep: 1,
            },
          } as never}
        />,
      );
    });

    expect(renderer.root.findByType('RestaurantMenuItemPicker').props.crossLocationItems).toEqual([]);
  });

  it('reuses a current restaurant menu item when a same-name cross-location item is selected', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <CreateVisitScreen
          navigation={navigation as never}
          route={{
            params: {
              preselectedRestaurantId: 'restaurant-1',
              preselectedRestaurantName: 'Fire',
              returnToStep: 1,
            },
          } as never}
        />,
      );
    });

    await act(async () => {
      await renderer.root.findByType('RestaurantMenuItemPicker').props.onToggleCrossLocationItem({
        id: 'editable item',
        latestRating: 5,
        latestRestaurantName: 'Fire',
        name: 'Editable Item',
        orderCount: 1,
      });
    });

    expect(toggleMenuItemSelection).toHaveBeenCalledWith(editableMenuItem);
    expect(createMenuItem).not.toHaveBeenCalled();
  });

  it('creates and selects a current restaurant menu item from a cross-location item', async () => {
    const createdMenuItem = {
      createdBy: 'user-1',
      id: 'menu-item-created',
      name: 'Coconut Yogurt',
      restaurant: 'restaurant-1',
      visibility: 'friends',
    };
    createMenuItem.mockResolvedValue({
      result: createdMenuItem,
      status: 'completed',
    });
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <CreateVisitScreen
          navigation={navigation as never}
          route={{
            params: {
              preselectedRestaurantId: 'restaurant-1',
              preselectedRestaurantName: 'Fire',
              returnToStep: 1,
            },
          } as never}
        />,
      );
    });

    await act(async () => {
      await renderer.root.findByType('RestaurantMenuItemPicker').props.onToggleCrossLocationItem({
        id: 'coconut yogurt',
        latestRating: 5,
        latestRestaurantName: 'Fire',
        name: 'Coconut Yogurt',
        orderCount: 1,
      });
    });

    expect(createMenuItem).toHaveBeenCalledWith({
      createdBy: 'user-1',
      isFromOCR: false,
      name: 'Coconut Yogurt',
      restaurantId: 'restaurant-1',
      visibility: 'friends',
    });
    expect(toggleMenuItemSelection).toHaveBeenCalledWith(createdMenuItem);
  });

  it('adds a related-location suggestion directly to the visit draft without creating a menu item', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <CreateVisitScreen
          navigation={navigation as never}
          route={{
            params: {
              preselectedRestaurantId: 'restaurant-1',
              preselectedRestaurantName: 'Fire',
              returnToStep: 1,
            },
          } as never}
        />,
      );
    });

    await act(async () => {
      await renderer.root.findByType('RestaurantMenuItemPicker').props.onToggleCrossLocationItem({
        id: 'related-location:coconut yogurt',
        name: 'Coconut Yogurt',
        source: 'relatedLocationSuggestion',
        sourceItemCount: 3,
        sourceRestaurantCount: 2,
      });
    });

    expect(createMenuItem).not.toHaveBeenCalled();
    expect(toggleMenuItemSelection).not.toHaveBeenCalled();
    expect(setDraftItems).toHaveBeenCalledWith(expect.any(Function));

    const updater = setDraftItems.mock.calls[0][0];
    expect(updater([])).toEqual([
      {
        deletedPhotoIds: [],
        description: '',
        id: 'related-location:coconut yogurt',
        name: 'Coconut Yogurt',
        notes: '',
        photos: [],
        rating: 3,
      },
    ]);
  });

  it('keeps cached related-location suggestions selectable offline', async () => {
    mockedUseConnectivity.mockReturnValue({
      isOnline: false,
    } as ReturnType<typeof useConnectivity>);
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <CreateVisitScreen
          navigation={navigation as never}
          route={{
            params: {
              preselectedRestaurantId: 'restaurant-1',
              preselectedRestaurantName: 'Fire',
              returnToStep: 1,
            },
          } as never}
        />,
      );
    });

    await act(async () => {
      await renderer.root.findByType('RestaurantMenuItemPicker').props.onToggleCrossLocationItem({
        id: 'related-location:coconut yogurt',
        name: 'Coconut Yogurt',
        source: 'relatedLocationSuggestion',
        sourceItemCount: 3,
        sourceRestaurantCount: 2,
      });
    });

    expect(createMenuItem).not.toHaveBeenCalled();
    expect(setDraftItems).toHaveBeenCalledWith(expect.any(Function));
    expect(
      renderer.root.findAllByType('PageErrorToast').some(
        (node: any) =>
          node.props.errorMessage ===
          'Adding menu items from matching locations requires internet connection.',
      ),
    ).toBe(false);
  });

  it('shows an online-only error when selecting a missing cross-location item offline', async () => {
    mockedUseConnectivity.mockReturnValue({
      isOnline: false,
    } as ReturnType<typeof useConnectivity>);
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <CreateVisitScreen
          navigation={navigation as never}
          route={{
            params: {
              preselectedRestaurantId: 'restaurant-1',
              preselectedRestaurantName: 'Fire',
              returnToStep: 1,
            },
          } as never}
        />,
      );
    });

    await act(async () => {
      await renderer.root.findByType('RestaurantMenuItemPicker').props.onToggleCrossLocationItem({
        id: 'coconut yogurt',
        latestRating: 5,
        latestRestaurantName: 'Fire',
        name: 'Coconut Yogurt',
        orderCount: 1,
      });
    });

    expect(createMenuItem).not.toHaveBeenCalled();
    expect(
      renderer.root.findAllByType('PageErrorToast').some(
        (node: any) =>
          node.props.errorMessage ===
          'Adding menu items from matching locations requires internet connection.',
      ),
    ).toBe(true);
  });

  it('exits directly to the source list when the header back is pressed from an I went review flow', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <CreateVisitScreen
          navigation={navigation as never}
          route={{
            params: {
              preselectedRestaurantId: 'restaurant-1',
              preselectedRestaurantName: 'Fire',
              preselectedMenuItemId: 'bookmark-list-item-1',
              preselectedMenuItemName: 'Noodles',
              sourceListId: 'list-1',
              sourceListItemId: 'list-item-1',
              returnToStep: 2,
            },
          } as never}
        />,
      );
    });

    const scaffold = renderer.root.findByType('FeatureFormScreenScaffold');

    expect(scaffold.props.primaryAction.label).toBe('Save Visit');

    await act(async () => {
      scaffold.props.onBackPress();
    });

    expect(navigation.goBack).toHaveBeenCalledTimes(1);
    expect(navigation.navigate).not.toHaveBeenCalled();
    expect(renderer.root.findByType('FeatureFormScreenScaffold').props.primaryAction.label).toBe('Save Visit');
  });

  it('falls back to the source list detail when an I went flow cannot go back', async () => {
    navigation.canGoBack.mockReturnValue(false);
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <CreateVisitScreen
          navigation={navigation as never}
          route={{
            params: {
              preselectedRestaurantId: 'restaurant-1',
              preselectedRestaurantName: 'Fire',
              preselectedMenuItemId: 'bookmark-list-item-1',
              preselectedMenuItemName: 'Noodles',
              sourceListId: 'list-1',
              sourceListItemId: 'list-item-1',
              returnToStep: 2,
            },
          } as never}
        />,
      );
    });

    const scaffold = renderer.root.findByType('FeatureFormScreenScaffold');

    await act(async () => {
      scaffold.props.onBackPress();
    });

    expect(navigation.goBack).not.toHaveBeenCalled();
    expect(navigation.navigate).toHaveBeenCalledWith('ListDetail', { listId: 'list-1' });
  });

  it('keeps normal add visit header back behavior as wizard step navigation', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <CreateVisitScreen
          navigation={navigation as never}
          route={{
            params: {
              preselectedRestaurantId: 'restaurant-1',
              preselectedRestaurantName: 'Fire',
              preselectedMenuItemId: 'menu-item-1',
              preselectedMenuItemName: 'Noodles',
              returnToStep: 2,
            },
          } as never}
        />,
      );
    });

    const findScaffold = () => renderer.root.findByType('FeatureFormScreenScaffold');

    expect(findScaffold().props.primaryAction.label).toBe('Save Visit');

    await act(async () => {
      findScaffold().props.onBackPress();
    });

    expect(navigation.goBack).not.toHaveBeenCalled();
    expect(findScaffold().props.primaryAction.label).toBe('Select Items');
  });

  it('prompts before removing an unsaved create visit draft and replays confirmed navigation', async () => {
    const blockedBackAction = { source: 'CreateVisit-route', target: 'root-stack', type: 'GO_BACK' };
    const completeNavigation = jest.fn();
    navigation.dispatch.mockImplementation((action) => {
      const [shouldPreventRemoval, preventRemoval] = mockUsePreventRemove.mock.calls.at(-1) ?? [];

      if (shouldPreventRemoval) {
        preventRemoval({
          data: {
            action,
          },
        });
        return;
      }

      completeNavigation(action);
    });
    mockedUseCreateVisitDraftItems.mockReturnValue({
      draftItems: [
        {
          deletedPhotoIds: [],
          description: '',
          id: 'draft-item-1',
          name: 'Noodles',
          notes: '',
          photos: [],
          rating: 4,
        },
      ],
      draftPhotoCount: 0,
      isMenuItemSelected: jest.fn(() => false),
      removeDraftItem: jest.fn(),
      removeDraftItemPhoto: jest.fn(),
      selectedMenuItemCount: 1,
      setDraftItems,
      toggleMenuItemSelection,
      updateDraftItem: jest.fn(),
    } as ReturnType<typeof useCreateVisitDraftItems>);

    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <CreateVisitScreen
          navigation={navigation as never}
          route={{ params: {} } as never}
        />,
      );
    });

    expect(mockUsePreventRemove).toHaveBeenLastCalledWith(true, expect.any(Function));

    await act(async () => {
      mockUsePreventRemove.mock.calls.at(-1)?.[1]({
        data: {
          action: blockedBackAction,
        },
      });
    });

    const modal = renderer.root.findByProps({
      testID: 'create-visit-discard-draft-confirmation-modal',
    });
    expect(modal.props.visible).toBe(true);
    expect(navigation.dispatch).not.toHaveBeenCalled();

    await act(async () => {
      modal.props.onCancel();
    });

    expect(
      renderer.root.findByProps({
        testID: 'create-visit-discard-draft-confirmation-modal',
      }).props.visible,
    ).toBe(false);
    expect(mockUsePreventRemove).toHaveBeenLastCalledWith(true, expect.any(Function));
    expect(completeNavigation).not.toHaveBeenCalled();

    await act(async () => {
      mockUsePreventRemove.mock.calls.at(-1)?.[1]({
        data: {
          action: blockedBackAction,
        },
      });
    });
    await act(async () => {
      renderer.root
        .findByProps({ testID: 'create-visit-discard-draft-confirmation-modal' })
        .props.onConfirm();
    });

    expect(navigation.dispatch).toHaveBeenCalledWith(blockedBackAction);
    expect(completeNavigation).toHaveBeenCalledWith(blockedBackAction);
  });

  it('hydrates related-location preselected items without treating the suggestion id as a menu item id', async () => {
    await act(async () => {
      create(
        <CreateVisitScreen
          navigation={navigation as never}
          route={{
            params: {
              preselectedRestaurantId: 'restaurant-1',
              preselectedRestaurantName: 'Fire',
              preselectedMenuItemId: 'related-location:coconut yogurt',
              preselectedMenuItemName: 'Coconut Yogurt',
              preselectedMenuItemSuggestionSource: {
                normalizedItemName: 'coconut yogurt',
                restaurantGroupId: 'group-1',
                sourceMenuItemId: 'menu-item-3',
                sourceRestaurantId: 'restaurant-2',
                type: 'groupMenuSuggestion',
              },
              returnToStep: 1,
            },
          } as never}
        />,
      );
    });

    const draftItemsUpdater = setDraftItems.mock.calls.find(
      ([updater]) => typeof updater === 'function',
    )?.[0];

    expect(draftItemsUpdater).toBeTruthy();
    expect(draftItemsUpdater([])).toEqual([
      {
        id: 'related-location:coconut yogurt',
        name: 'Coconut Yogurt',
        rating: 3,
        description: '',
        notes: '',
        photos: [],
        deletedPhotoIds: [],
        suggestionSource: {
          normalizedItemName: 'coconut yogurt',
          restaurantGroupId: 'group-1',
          sourceMenuItemId: 'menu-item-3',
          sourceRestaurantId: 'restaurant-2',
          type: 'groupMenuSuggestion',
        },
      },
    ]);
    expect(draftItemsUpdater([])[0]).not.toHaveProperty('sourceMenuItemId');
    expect(navigation.setParams).toHaveBeenCalledWith(
      expect.objectContaining({
        preselectedMenuItemSuggestionSource: undefined,
      }),
    );
  });

  it('exits directly to the source list when footer back is pressed from an I went review flow', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <CreateVisitScreen
          navigation={navigation as never}
          route={{
            params: {
              preselectedRestaurantId: 'restaurant-1',
              preselectedRestaurantName: 'Fire',
              preselectedMenuItemId: 'bookmark-list-item-1',
              preselectedMenuItemName: 'Noodles',
              sourceListId: 'list-1',
              sourceListItemId: 'list-item-1',
              returnToStep: 2,
            },
          } as never}
        />,
      );
    });

    const scaffold = renderer.root.findByType('FeatureFormScreenScaffold');

    expect(scaffold.props.secondaryAction.label).toBe('Back');

    await act(async () => {
      scaffold.props.secondaryAction.onPress();
    });

    expect(navigation.goBack).toHaveBeenCalledTimes(1);
    expect(navigation.navigate).not.toHaveBeenCalled();
    expect(renderer.root.findByType('FeatureFormScreenScaffold').props.primaryAction.label).toBe('Save Visit');
  });

  it('opens the edit visit conversion picker from the header actions menu', async () => {
    mockedUseQuery.mockImplementation((options: { queryKey?: readonly unknown[] }) => {
      if (options.queryKey?.[0] === 'feature' && options.queryKey?.[1] === 'visit') {
        return buildQueryResult({
          id: 'visit-1',
          restaurantId: 'restaurant-1',
          restaurantName: 'Corner Market',
          visitedAt: '2026-04-05T18:00:00Z',
          visibility: 'friends',
          items: [
            {
              id: 'item-1',
              menuItemId: 'menu-item-1',
              name: 'Bottled Tea',
              rating: 4,
            },
            {
              id: 'item-2',
              name: 'Cookie',
              rating: 5,
            },
          ],
        });
      }

      return buildQueryResult({});
    });
    mockedUseCreateVisitDraftItems.mockReturnValue({
      draftItems: [
        {
          deletedPhotoIds: [],
          description: '',
          id: 'item-1',
          name: 'Bottled Tea',
          notes: '',
          photos: [],
          rating: 4,
        },
        {
          deletedPhotoIds: [],
          description: '',
          id: 'item-2',
          name: 'Cookie',
          notes: '',
          photos: [],
          rating: 5,
        },
      ],
      draftPhotoCount: 0,
      isMenuItemSelected: jest.fn(() => false),
      removeDraftItem: jest.fn(),
      removeDraftItemPhoto: jest.fn(),
      selectedMenuItemCount: 2,
      setDraftItems: jest.fn(),
      toggleMenuItemSelection,
      updateDraftItem: jest.fn(),
    } as ReturnType<typeof useCreateVisitDraftItems>);

    let renderer: any = null;
    await act(async () => {
      renderer = create(
        <CreateVisitScreen
          navigation={navigation as never}
          route={{
            params: {
              editVisitId: 'visit-1',
              returnToStep: 2,
            },
          } as never}
        />,
      );
    });

    const reviewStep = renderer.root.findByType('CreateVisitReviewStep');
    const scaffold = renderer.root.findByType('FeatureFormScreenScaffold');
    const actionsButton = scaffold.props.rightAccessory;
    expect(actionsButton.props.testID).toBe('edit-visit-actions-button');
    expect(reviewStep.props.showAdvancedConversion).toBeUndefined();

    await act(async () => {
      actionsButton.props.onPress();
    });

    const actionsModal = renderer.root.findByProps({ testID: 'edit-visit-actions-modal' });
    expect(actionsModal.props.visible).toBe(true);

    await act(async () => {
      renderer.root.findByProps({ testID: 'edit-visit-actions-convert-button' }).props.onPress();
    });

    const pickerModal = renderer.root.findByProps({ testID: 'edit-visit-conversion-picker-modal' });
    expect(renderer.root.findByProps({ testID: 'edit-visit-actions-modal' }).props.visible).toBe(false);
    expect(pickerModal.props.visible).toBe(true);
    expect(pickerModal.props.primaryAction).toBeUndefined();

    await act(async () => {
      renderer.root.findByProps({ testID: 'edit-visit-convert-item-option-0' }).props.onPress();
    });

    expect(renderer.root.findByProps({ testID: 'edit-visit-conversion-picker-modal' }).props.visible).toBe(false);
    expect(renderer.root.findByProps({ testID: 'edit-visit-convert-item-confirmation-modal' }).props.visible).toBe(true);
  });

  it('labels existing edit visit photos with the visit date instead of the upload date', async () => {
    const setDraftItems = jest.fn();
    mockedUseQuery.mockImplementation((options: { queryKey?: readonly unknown[] }) => {
      if (options.queryKey?.[0] === 'feature' && options.queryKey?.[1] === 'visit') {
        return buildQueryResult({
          id: 'visit-1',
          restaurantId: 'restaurant-1',
          restaurantName: 'Corner Market',
          visitedAt: '2026-04-12T18:00:00Z',
          visibility: 'friends',
          items: [
            {
              id: 'item-1',
              menuItemId: 'menu-item-1',
              name: 'Bottled Tea',
              rating: 4,
            },
          ],
        });
      }

      if (options.queryKey?.[0] === 'feature' && options.queryKey?.[1] === 'visitPhotos') {
        return buildQueryResult({
          'item-1': [
            {
              id: 'photo-1',
              food_item: 'item-1',
              photo: 'bottled-tea.jpg',
              collectionName: 'visit_photos',
              created: '2026-04-13T18:31:00.000Z',
            },
          ],
        });
      }

      return buildDefaultCreateVisitQueryResult(options);
    });
    mockedUseCreateVisitDraftItems.mockReturnValue({
      draftItems: [],
      draftPhotoCount: 0,
      isMenuItemSelected: jest.fn(() => false),
      removeDraftItem: jest.fn(),
      removeDraftItemPhoto: jest.fn(),
      selectedMenuItemCount: 0,
      setDraftItems,
      toggleMenuItemSelection,
      updateDraftItem: jest.fn(),
    } as ReturnType<typeof useCreateVisitDraftItems>);

    await act(async () => {
      create(
        <CreateVisitScreen
          navigation={navigation as never}
          route={{
            params: {
              editVisitId: 'visit-1',
              returnToStep: 2,
            },
          } as never}
        />,
      );
    });

    expect(setDraftItems).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'item-1',
        sourceMenuItemId: 'menu-item-1',
        photos: [
          expect.objectContaining({
            id: 'photo-1',
            labelDate: 'Apr 12, 2026',
            thumbnailUri: 'pb://photo-1/bottled-tea.jpg?thumb=100x100',
            viewerUri: 'pb://photo-1/bottled-tea.jpg',
          }),
        ],
      }),
    ]);
  });

  it('converts an edit visit item through the header overflow conversion flow', async () => {
    mockedUseQuery.mockImplementation((options: { queryKey?: readonly unknown[] }) => {
      if (options.queryKey?.[0] === 'feature' && options.queryKey?.[1] === 'visit') {
        return buildQueryResult({
          id: 'visit-1',
          restaurantId: 'restaurant-1',
          restaurantName: 'Corner Market',
          visitedAt: '2026-04-05T18:00:00Z',
          visibility: 'friends',
          items: [
            {
              id: 'item-1',
              name: 'Bottled Tea',
              rating: 4,
            },
          ],
        });
      }

      return buildQueryResult({});
    });
    mockedUseCreateVisitDraftItems.mockReturnValue({
      draftItems: [
        {
          deletedPhotoIds: [],
          description: '',
          id: 'item-1',
          name: 'Bottled Tea',
          notes: '',
          photos: [],
          rating: 4,
        },
      ],
      draftPhotoCount: 0,
      isMenuItemSelected: jest.fn(() => false),
      removeDraftItem: jest.fn(),
      removeDraftItemPhoto: jest.fn(),
      selectedMenuItemCount: 1,
      setDraftItems: jest.fn(),
      toggleMenuItemSelection,
      updateDraftItem: jest.fn(),
    } as ReturnType<typeof useCreateVisitDraftItems>);

    let renderer: any = null;
    await act(async () => {
      renderer = create(
        <CreateVisitScreen
          navigation={navigation as never}
          route={{
            params: {
              editVisitId: 'visit-1',
              returnToStep: 2,
            },
          } as never}
        />,
      );
    });

    const actionsButton = renderer.root.findByType('FeatureFormScreenScaffold').props.rightAccessory;
    await act(async () => {
      actionsButton.props.onPress();
    });
    await act(async () => {
      renderer.root.findByProps({ testID: 'edit-visit-actions-convert-button' }).props.onPress();
    });
    await act(async () => {
      renderer.root.findByProps({ testID: 'edit-visit-convert-item-option-0' }).props.onPress();
    });
    const confirmModal = renderer.root.findByProps({ testID: 'edit-visit-convert-item-confirmation-modal' });
    expect(confirmModal.props.visible).toBe(true);

    await act(async () => {
      await confirmModal.props.onConfirm();
    });

    expect(mockedConvertVisitItemToFoodProduct).toHaveBeenCalledWith({ itemId: 'item-1' });
    expect(mockedSyncVisitMutationCaches).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        visitId: 'visit-1',
        includeVisitPhotos: true,
      }),
    );
    expect(mockedSyncFoodProductMutationCaches).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        foodProductId: 'food-product-1',
        includeFoodProductPhotos: true,
      }),
    );
    expect(navigation.navigate).toHaveBeenCalledWith('EditFoodProduct', {
      exitToHomeOnClose: true,
      foodProductId: 'food-product-1',
    });
  });
});
