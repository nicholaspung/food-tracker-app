import React from 'react';
import { act, create } from 'react-test-renderer';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  convertVisitItemToFoodProduct,
  createMenuReviewRequest,
  getAuthenticatedUserIdOrNull,
  syncFoodProductMutationCaches,
  syncVisitMutationCaches,
  useMonthlyUsage,
} from '../features';
import { useOfflineAwareFeatureWrite } from '../features/store/useOfflineAwareFeatureWrite';
import { usePhotoPickerPermissions } from '../hooks/usePhotoPickerPermissions';
import { useRestaurantSelectionFlow } from '../hooks/useRestaurantSelectionFlow';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { CreateVisitScreen } from '../screens/CreateVisitScreen';
import { useCreateVisitDraftItems } from '../screens/createVisit/useCreateVisitDraftItems';
import { useCreateVisitSubmission } from '../screens/createVisit/useCreateVisitSubmission';

const mockReact = React;
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
  useQuery: jest.fn(),
  useQueryClient: jest.fn(),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: (props: Record<string, unknown>) => mockReact.createElement('Ionicons', props),
}));

jest.mock('expo-image-picker', () => ({
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

jest.mock('react-native', () => {
  const React = jest.requireActual<typeof import('react')>('react');

  return {
    Linking: {
      openSettings: jest.fn(),
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
  LinkedNoteCard: (props: Record<string, unknown>) => mockReact.createElement('LinkedNoteCard', props),
  LoadingState: (props: Record<string, unknown>) => mockReact.createElement('LoadingState', props),
  OptionList: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('OptionList', props, children),
  OptionListRow: (props: Record<string, unknown>) => mockReact.createElement('OptionListRow', props),
  PageErrorToast: (props: Record<string, unknown>) => mockReact.createElement('PageErrorToast', props),
  StepProgressBar: (props: Record<string, unknown>) => mockReact.createElement('StepProgressBar', props),
  VisitMenuItemOptionRow: (props: Record<string, unknown>) => mockReact.createElement('VisitMenuItemOptionRow', props),
  VisitRestaurantOptionTrailing: (props: Record<string, unknown>) =>
    mockReact.createElement('VisitRestaurantOptionTrailing', props),
  VisitRestaurantSearchSection: (props: Record<string, unknown>) =>
    mockReact.createElement('VisitRestaurantSearchSection', props),
}));

jest.mock('../features', () => ({
  convertVisitItemToFoodProduct: jest.fn(),
  createMenuReviewRequest: jest.fn(),
  getAuthenticatedUserIdOrNull: jest.fn(() => 'user-1'),
  getNoteDetail: jest.fn(),
  getVisitById: jest.fn(),
  resolveDefaultVisitVisibilityFromAuth: jest.fn(() => 'friends'),
  syncFoodProductMutationCaches: jest.fn(() => Promise.resolve()),
  syncVisitMutationCaches: jest.fn(() => Promise.resolve()),
  useMonthlyUsage: jest.fn(),
}));

jest.mock('../features/store/useOfflineAwareFeatureWrite', () => ({
  useOfflineAwareFeatureWrite: jest.fn(),
}));

jest.mock('../hooks/usePhotoPickerPermissions', () => ({
  usePhotoPickerPermissions: jest.fn(),
}));

jest.mock('../hooks/useRestaurantSelectionFlow', () => ({
  useRestaurantSelectionFlow: jest.fn(),
}));

jest.mock('../lib/dateFormatting', () => ({
  formatDateToLocalDateString: jest.fn(() => '2026-04-18'),
  getTodayLocalDateString: jest.fn(() => '2026-04-18'),
  isValidLocalDate: jest.fn(() => true),
}));

jest.mock('../lib/photoFiles', () => ({
  buildLocalPhotoFile: jest.fn(),
}));

jest.mock('../lib/photoMetadata', () => ({
  resolvePhotoCaptureDate: jest.fn(),
}));

jest.mock('../lib/usageUiRules', () => ({
  resolveDisplayPhotoUploadsPerRecordLimit: jest.fn(() => 1),
  shouldShowOfflineUsageWarning: jest.fn(() => false),
}));

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
const mockedUseMonthlyUsage = useMonthlyUsage as jest.MockedFunction<typeof useMonthlyUsage>;
const mockedUseOfflineAwareFeatureWrite = useOfflineAwareFeatureWrite as jest.MockedFunction<
  typeof useOfflineAwareFeatureWrite
>;
const mockedUsePhotoPickerPermissions = usePhotoPickerPermissions as jest.MockedFunction<
  typeof usePhotoPickerPermissions
>;
const mockedUseRestaurantSelectionFlow = useRestaurantSelectionFlow as jest.MockedFunction<
  typeof useRestaurantSelectionFlow
>;
const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockedUseConnectivity = useConnectivity as jest.MockedFunction<typeof useConnectivity>;
const mockedUseCreateVisitDraftItems = useCreateVisitDraftItems as jest.MockedFunction<
  typeof useCreateVisitDraftItems
>;
const mockedUseCreateVisitSubmission = useCreateVisitSubmission as jest.MockedFunction<
  typeof useCreateVisitSubmission
>;

function buildQueryResult<T>(data: T) {
  return {
    data,
    isError: false,
    isLoading: false,
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof useQuery>;
}

describe('CreateVisitScreen', () => {
  let toggleMenuItemSelection: jest.Mock;
  let navigation: {
    canGoBack: jest.Mock;
    goBack: jest.Mock;
    navigate: jest.Mock;
    setParams: jest.Mock;
  };

  beforeEach(() => {
    toggleMenuItemSelection = jest.fn();
    navigation = {
      canGoBack: jest.fn(() => true),
      goBack: jest.fn(),
      navigate: jest.fn(),
      setParams: jest.fn(),
    };

    mockedUseQuery.mockReset();
    mockedUseQuery.mockReturnValue(buildQueryResult(null));
    mockedUseQueryClient.mockReset();
    mockedUseQueryClient.mockReturnValue({
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
    mockedUseOfflineAwareFeatureWrite.mockReset();
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(jest.fn() as ReturnType<typeof useOfflineAwareFeatureWrite>);
    mockedUsePhotoPickerPermissions.mockReset();
    mockedUsePhotoPickerPermissions.mockReturnValue({
      permissionNeedsSettings: false,
      requestPermission: jest.fn(),
      resetPermissionNeedsSettings: jest.fn(),
    } as ReturnType<typeof usePhotoPickerPermissions>);
    mockedUseRestaurantSelectionFlow.mockReset();
    mockedUseRestaurantSelectionFlow.mockReturnValue({
      clearPlacesSearchState: jest.fn(),
      clearSearchErrorMessage: jest.fn(),
      compactSearchLabel: 'Search',
      displayedNearbyRestaurants: [],
      displayedSavedRestaurants: [],
      expandedSearchLabel: 'Search nearby',
      isGettingLocation: false,
      isPlacesQuotaReached: false,
      isSearchExpanded: false,
      isSearchingNearbyRestaurants: false,
      isSearchingRestaurants: false,
      loadedRestaurantRecords: [],
      locationPermissionNeedsSettings: false,
      manualLocation: '',
      menuItemsQuery: {
        data: [editableMenuItem, nonEditableMenuItem],
        isError: false,
        isLoading: false,
        refetch: jest.fn(),
      },
      savedEmptyDescription: 'No saved restaurants',
      savedEmptyTitle: 'No saved restaurants',
      savedRestaurantsErrorMessage: null,
      savedRestaurantsLoading: false,
      savedRestaurantsTitle: 'Saved restaurants',
      searchButtonDisabled: false,
      searchByText: jest.fn().mockResolvedValue({ status: 'success', results: [] }),
      searchErrorMessage: null,
      searchNearby: jest.fn().mockResolvedValue({ status: 'success', results: [] }),
      searchQuery: '',
      setIsSearchExpanded: jest.fn(),
      setManualLocation: jest.fn(),
      setSearchQuery: jest.fn(),
      shouldShowPlacesUpgradePrompt: false,
      showNearbyPlaces: false,
      triggerSavedRestaurantsRefetch: jest.fn(),
    } as unknown as ReturnType<typeof useRestaurantSelectionFlow>);
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
    mockedUseCreateVisitDraftItems.mockReset();
    mockedUseCreateVisitDraftItems.mockReturnValue({
      draftItems: [],
      draftPhotoCount: 0,
      isMenuItemSelected: jest.fn(() => false),
      removeDraftItem: jest.fn(),
      removeDraftItemPhoto: jest.fn(),
      selectedMenuItemCount: 0,
      setDraftItems: jest.fn(),
      toggleMenuItemSelection,
      updateDraftItem: jest.fn(),
    } as ReturnType<typeof useCreateVisitDraftItems>);
    mockedUseCreateVisitSubmission.mockReset();
    mockedUseCreateVisitSubmission.mockReturnValue({
      isSubmitting: false,
      submitVisit: jest.fn(),
    } as ReturnType<typeof useCreateVisitSubmission>);
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
    const menuItemRows = renderer.root.findAllByType('VisitMenuItemOptionRow');
    const editableRow = menuItemRows.find(
      (node: { props: { name?: string } }) => node.props.name === editableMenuItem.name,
    );
    const nonEditableRow = menuItemRows.find(
      (node: { props: { name?: string } }) => node.props.name === nonEditableMenuItem.name,
    );

    expect(scaffold.props.primaryAction.label).toBe('Select Items');
    expect(menuItemRows).toHaveLength(2);
    expect(editableRow).toBeDefined();
    expect(nonEditableRow).toBeDefined();

    if (!editableRow || !nonEditableRow) {
      throw new Error('Expected both editable and non-editable menu item rows to render.');
    }

    expect(editableRow.props.compactActions).toBe(true);
    expect(typeof editableRow.props.onEditPress).toBe('function');
    expect(editableRow.props.friendEatenCount).toBe(2);
    expect(editableRow.props.userEatenCount).toBe(3);
    expect(nonEditableRow.props.compactActions).toBe(false);
    expect(nonEditableRow.props.onEditPress).toBeUndefined();

    await act(async () => {
      editableRow.props.onPress();
    });

    expect(toggleMenuItemSelection).toHaveBeenCalledWith(editableMenuItem);
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

  it('converts an edit visit item through the header overflow conversion flow', async () => {
    const writeFeature = jest.fn().mockResolvedValue({
      status: 'completed',
      result: {
        deletedSourceVisit: false,
        foodProductId: 'food-product-1',
        sourceVisitId: 'visit-1',
      },
    });
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(
      writeFeature as ReturnType<typeof useOfflineAwareFeatureWrite>,
    );
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

    expect(writeFeature).toHaveBeenCalledWith(
      expect.objectContaining({
        operationName: 'visit.item.convert-to-food-product',
        offline: {
          strategy: 'outbox',
          payload: {
            itemId: 'item-1',
          },
        },
      }),
    );
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
