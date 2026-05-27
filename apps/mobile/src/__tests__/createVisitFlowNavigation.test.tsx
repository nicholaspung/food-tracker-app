import { CommonActions, StackActions, StackRouter } from '@react-navigation/routers';
import { useQueryClient } from '@tanstack/react-query';
import React from 'react';
import { act, create } from 'react-test-renderer';

import {
  createCollectionRecord,
  createMenuItemsFromScan,
  getAuthenticatedUserIdOrNull,
  parseMenuImage,
  resolveDefaultRestaurantVisibilityFromAuth,
  upsertRestaurantRecord,
  useMenuItemCatalogWrites,
} from '../features';
import { useImageSourcePicker } from '../hooks/useImageSourcePicker';
import { trackObservabilityEvent } from '../observability';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { CreateVisitAddMenuItemScreen } from '../screens/CreateVisitAddMenuItemScreen';
import { CreateVisitAddRestaurantScreen } from '../screens/CreateVisitAddRestaurantScreen';
import { MenuScanPhotoProcessingScreen } from '../screens/MenuScanPhotoProcessingScreen';

const mockReact = React;
const mockUseMenuScanFlow = jest.fn();

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: jest.fn(),
}));

jest.mock('../features', () => ({
  createCollectionRecord: jest.fn(),
  createMenuItemsFromScan: jest.fn(),
  formatLimitExceededMessage: jest.fn(() => 'Limit exceeded'),
  parseLimitExceededError: jest.fn(() => null),
  parseMenuImage: jest.fn(),
  useMenuScanFlow: (...args: unknown[]) => mockUseMenuScanFlow(...args),
  useMonthlyUsage: jest.fn(() => ({
    isLoading: false,
    snapshot: {
      limits: {
        menuScansMonthly: 5,
      },
      usage: {
        menuScans: 1,
      },
    },
  })),
  getAuthenticatedUserIdOrNull: jest.fn(),
  resolveDefaultRestaurantVisibilityFromAuth: jest.fn(() => 'friends'),
  upsertRestaurantRecord: jest.fn(),
  useMenuItemCatalogWrites: jest.fn(),
}));

jest.mock('../hooks/useImageSourcePicker', () => ({
  useImageSourcePicker: jest.fn(),
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

jest.mock('../theme', () => ({
  createThemedStyles: () => () => ({}),
  useTheme: () => ({
    colors: {
      background: {
        surface: 'white',
      },
      status: {
        dangerBorder: 'red',
        infoBg: 'aliceblue',
        infoBorder: 'skyblue',
        successBorder: 'green',
      },
      text: {
        primary: 'black',
        secondary: 'gray',
        warning: 'orange',
      },
    },
    spacing: {
      sm: 12,
      xs: 8,
    },
  }),
}));

jest.mock('../ui', () => ({
  Button: (props: Record<string, unknown>) => mockReact.createElement('Button', props),
  Card: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Card', props, children),
  Input: (props: Record<string, unknown>) => mockReact.createElement('Input', props),
  Text: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Text', props, children),
}));

jest.mock('../components/shared', () => ({
  FeatureFormScreenScaffold: (
    { children, ...props }: Record<string, unknown> & { children?: React.ReactNode },
  ) => mockReact.createElement('FeatureFormScreenScaffold', props, children),
  LinearProgressBar: (props: Record<string, unknown>) =>
    mockReact.createElement('LinearProgressBar', props),
  PageErrorToast: (props: Record<string, unknown>) => mockReact.createElement('PageErrorToast', props),
  PhotoSourceActionCards: (props: Record<string, unknown>) =>
    mockReact.createElement('PhotoSourceActionCards', props),
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
  VisibilityOptionSelector: (props: Record<string, unknown>) =>
    mockReact.createElement('VisibilityOptionSelector', props),
}));

jest.mock('../lib/photoFiles', () => ({
  buildLocalPhotoFile: jest.fn(),
}));

jest.mock('../features/photoProcessing/menuItemCsvParsing', () => ({
  parseMenuItemNamesFromCsv: jest.fn(() => []),
}));

const mockedUseQueryClient = useQueryClient as jest.MockedFunction<typeof useQueryClient>;
const mockedCreateCollectionRecord = createCollectionRecord as jest.MockedFunction<
  typeof createCollectionRecord
>;
const mockedUseMenuItemCatalogWrites = useMenuItemCatalogWrites as jest.MockedFunction<
  typeof useMenuItemCatalogWrites
>;
const mockedCreateMenuItemsFromScan = createMenuItemsFromScan as jest.MockedFunction<
  typeof createMenuItemsFromScan
>;
const mockedGetAuthenticatedUserIdOrNull =
  getAuthenticatedUserIdOrNull as jest.MockedFunction<typeof getAuthenticatedUserIdOrNull>;
const mockedParseMenuImage = parseMenuImage as jest.MockedFunction<typeof parseMenuImage>;
const mockedResolveDefaultRestaurantVisibilityFromAuth =
  resolveDefaultRestaurantVisibilityFromAuth as jest.MockedFunction<
    typeof resolveDefaultRestaurantVisibilityFromAuth
  >;
const mockedUpsertRestaurantRecord = upsertRestaurantRecord as jest.MockedFunction<
  typeof upsertRestaurantRecord
>;
const mockedUseImageSourcePicker = useImageSourcePicker as jest.MockedFunction<
  typeof useImageSourcePicker
>;
const mockedTrackObservabilityEvent = trackObservabilityEvent as jest.MockedFunction<
  typeof trackObservabilityEvent
>;
const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockedUseConnectivity = useConnectivity as jest.MockedFunction<typeof useConnectivity>;

function buildStackOptions() {
  return {
    routeGetIdList: {},
    routeNames: ['AddVisit', 'CreateVisit', 'ProcessPhotos'],
    routeParamList: {},
  };
}

describe('create visit flow navigation', () => {
  let invalidateQueries: jest.Mock;
  let setQueryData: jest.Mock;

  beforeEach(() => {
    invalidateQueries = jest.fn().mockResolvedValue(undefined);
    setQueryData = jest.fn();

    mockedUseQueryClient.mockReset();
    mockedCreateCollectionRecord.mockReset();
    mockedUseMenuItemCatalogWrites.mockReset();
    mockedCreateMenuItemsFromScan.mockReset();
    mockedGetAuthenticatedUserIdOrNull.mockReset();
    mockedParseMenuImage.mockReset();
    mockedResolveDefaultRestaurantVisibilityFromAuth.mockReset();
    mockedUpsertRestaurantRecord.mockReset();
    mockedUseImageSourcePicker.mockReset();
    mockedTrackObservabilityEvent.mockReset();
    mockedUseAuth.mockReset();
    mockedUseConnectivity.mockReset();
    mockUseMenuScanFlow.mockReset();

    mockedUseQueryClient.mockReturnValue({
      invalidateQueries,
      setQueryData,
    } as unknown as ReturnType<typeof useQueryClient>);
    mockedResolveDefaultRestaurantVisibilityFromAuth.mockReturnValue('friends');
    mockedUseImageSourcePicker.mockReturnValue({
      permissionNeedsSettings: false,
      pickImageAssets: jest.fn(),
      requestSourcePermission: jest.fn(),
      resetPermissionNeedsSettings: jest.fn(),
    } as unknown as ReturnType<typeof useImageSourcePicker>);
    mockedUseAuth.mockReturnValue({
      user: {
        id: 'user_1',
        isAdmin: false,
        isSubscriber: true,
      },
    } as ReturnType<typeof useAuth>);
    mockedUseConnectivity.mockReturnValue({
      isOnline: true,
    } as ReturnType<typeof useConnectivity>);
    mockedGetAuthenticatedUserIdOrNull.mockReturnValue('user_1');
    mockedUseMenuItemCatalogWrites.mockReturnValue({
      applyScannedMenuItems: jest.fn(),
      createMenuItemAndAddToTastingPlan: jest.fn().mockResolvedValue({
        id: 'item_9',
        name: 'Miso Ramen',
      }),
      createMenuItem: jest.fn().mockResolvedValue({
        id: 'item_9',
        name: 'Miso Ramen',
      }),
      updateMenuItem: jest.fn(),
    } as unknown as ReturnType<typeof useMenuItemCatalogWrites>);
    mockUseMenuScanFlow.mockReturnValue({
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
    });
  });

  it('shows how navigate appends another CreateVisit while popTo unwinds to the existing draft', () => {
    const router = StackRouter({ initialRouteName: 'AddVisit' });
    const options = buildStackOptions();

    let navigateState: any = router.getInitialState(options);
    navigateState = router.getStateForAction(
      navigateState,
      CommonActions.navigate('CreateVisit'),
      options,
    )!;
    navigateState = router.getStateForAction(
      navigateState,
      CommonActions.navigate('ProcessPhotos', { mode: 'menu_scan' }),
      options,
    )!;
    navigateState = router.getStateForAction(
      navigateState,
      CommonActions.navigate('CreateVisit', { returnToStep: 1 }),
      options,
    )!;

    expect(navigateState.routes.map((route: { name: string }) => route.name)).toEqual([
      'AddVisit',
      'CreateVisit',
      'ProcessPhotos',
      'CreateVisit',
    ]);

    let popState: any = router.getInitialState(options);
    popState = router.getStateForAction(
      popState,
      CommonActions.navigate('CreateVisit'),
      options,
    )!;
    popState = router.getStateForAction(
      popState,
      CommonActions.navigate('ProcessPhotos', { mode: 'menu_scan' }),
      options,
    )!;
    popState = router.getStateForAction(
      popState,
      StackActions.popTo('CreateVisit', { returnToStep: 1 }),
      options,
    )!;

    expect(popState.routes.map((route: { name: string }) => route.name)).toEqual([
      'AddVisit',
      'CreateVisit',
    ]);
    expect(popState.routes[1]?.params).toEqual({ returnToStep: 1 });
  });

  it('uses popTo when leaving the menu scan helper screen', async () => {
    const navigation = {
      goBack: jest.fn(),
      popTo: jest.fn(),
    };
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <MenuScanPhotoProcessingScreen
          navigation={navigation as never}
          route={{
            params: {
              mode: 'menu_scan',
              restaurantId: 'restaurant_1',
              restaurantName: 'Cafe Test',
              sourceNoteId: 'note_1',
            },
          } as never}
        />,
      );
    });

    await act(async () => {
      renderer!.root.findByType('FeatureFormScreenScaffold').props.onBackPress();
    });

    expect(navigation.popTo).toHaveBeenCalledWith('CreateVisit', {
      preselectedRestaurantId: 'restaurant_1',
      preselectedRestaurantName: 'Cafe Test',
      returnToStep: 1,
      sourceNoteId: 'note_1',
    });
    expect(mockUseMenuScanFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        analyticsSource: 'CreateVisitMenuScan',
        restaurantId: 'restaurant_1',
        restaurantName: 'Cafe Test',
      }),
    );
  });

  it('returns from the menu scan helper screen to food discovery restaurant detail', async () => {
    const navigation = {
      goBack: jest.fn(),
      popTo: jest.fn(),
    };
    const detailParams = {
      cuisineType: 'Cafe',
      location: 'West Hollywood, CA',
      restaurantId: 'restaurant_1',
      restaurantName: 'Cafe Test',
      userVisitCount: 2,
    };
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <MenuScanPhotoProcessingScreen
          navigation={navigation as never}
          route={{
            params: {
              mode: 'menu_scan',
              restaurantId: 'restaurant_1',
              restaurantName: 'Cafe Test',
              returnTo: 'RestaurantDiscoveryRestaurant',
              returnToRestaurantDiscoveryRestaurantParams: detailParams,
            },
          } as never}
        />,
      );
    });

    await act(async () => {
      renderer!.root.findByType('FeatureFormScreenScaffold').props.onBackPress();
    });

    expect(navigation.popTo).toHaveBeenCalledWith(
      'RestaurantDiscoveryRestaurant',
      detailParams,
    );
    expect(mockUseMenuScanFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        analyticsSource: 'FoodDiscoveryRestaurant',
        restaurantId: 'restaurant_1',
        restaurantName: 'Cafe Test',
      }),
    );
  });

  it('keeps the photo source picker visible after a non-menu scan rejection', async () => {
    const navigation = {
      goBack: jest.fn(),
      popTo: jest.fn(),
    };
    mockUseMenuScanFlow.mockReturnValue({
      createdItemNames: [],
      errorMessage: 'Image is not a menu',
      existingItemNames: [],
      lastRequestedSource: 'gallery',
      permissionNeedsSettings: false,
      reset: jest.fn(),
      scanMenu: jest.fn(),
      selectedImageName: '',
      status: 'idle',
      verification: null,
    });

    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <MenuScanPhotoProcessingScreen
          navigation={navigation as never}
          route={{
            params: {
              mode: 'menu_scan',
              restaurantId: 'restaurant_1',
              restaurantName: 'Cafe Test',
            },
          } as never}
        />,
      );
    });

    expect(renderer!.root.findAllByType('PhotoSourceActionCards')).toHaveLength(1);
    expect(
      renderer!.root.findAllByType('Text').some((textNode: any) =>
        textNode.props.children === 'Tip: clear, well-lit menu photos produce better item extraction.',
      ),
    ).toBe(true);
    expect(
      renderer!.root.findAllByType('PageErrorToast').some((toast: any) =>
        toast.props.errorMessage === 'Image is not a menu' && toast.props.title === 'Menu scan failed',
      ),
    ).toBe(true);
  });

  it('keeps the photo source picker visible after a recoverable menu scan failure', async () => {
    const navigation = {
      goBack: jest.fn(),
      popTo: jest.fn(),
    };
    mockUseMenuScanFlow.mockReturnValue({
      createdItemNames: [],
      errorMessage: 'Something went wrong.',
      existingItemNames: [],
      lastRequestedSource: 'gallery',
      permissionNeedsSettings: false,
      reset: jest.fn(),
      scanMenu: jest.fn(),
      selectedImageName: '',
      status: 'error',
      verification: null,
    });

    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <MenuScanPhotoProcessingScreen
          navigation={navigation as never}
          route={{
            params: {
              mode: 'menu_scan',
              restaurantId: 'restaurant_1',
              restaurantName: 'Cafe Test',
            },
          } as never}
        />,
      );
    });

    expect(renderer!.root.findAllByType('PhotoSourceActionCards')).toHaveLength(1);
    expect(
      renderer!.root.findAllByType('Text').some((textNode: any) =>
        textNode.props.children === 'Tip: clear, well-lit menu photos produce better item extraction.',
      ),
    ).toBe(true);
    expect(
      renderer!.root.findAllByType('PageErrorToast').some((toast: any) =>
        toast.props.errorMessage === 'Something went wrong.' &&
        toast.props.title === 'Menu scan failed' &&
        toast.props.actionLabel === 'Try Again',
      ),
    ).toBe(true);
  });

  it('uses popTo after adding a restaurant from the create visit flow', async () => {
    const navigation = {
      goBack: jest.fn(),
      popTo: jest.fn(),
    };
    mockedUpsertRestaurantRecord.mockResolvedValue({
      id: 'restaurant_42',
      name: 'Cafe Test',
    } as Awaited<ReturnType<typeof upsertRestaurantRecord>>);

    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <CreateVisitAddRestaurantScreen
          navigation={navigation as never}
          route={{
            params: {
              editVisitId: 'visit_7',
              sourceNoteId: 'note_1',
            },
          } as never}
        />,
      );
    });

    const inputs = renderer!.root.findAllByType('Input');

    await act(async () => {
      inputs[0]!.props.onChangeText('Cafe Test');
      inputs[1]!.props.onChangeText('San Francisco, CA');
    });

    await act(async () => {
      renderer!.root.findByType('FeatureFormScreenScaffold').props.primaryAction.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(navigation.popTo).toHaveBeenCalledWith('CreateVisit', {
      editVisitId: 'visit_7',
      preselectedRestaurantId: 'restaurant_42',
      preselectedRestaurantName: 'Cafe Test',
      sourceNoteId: 'note_1',
    });
  });

  it('uses popTo after adding a menu item from the create visit flow', async () => {
    const navigation = {
      goBack: jest.fn(),
      popTo: jest.fn(),
    };
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <CreateVisitAddMenuItemScreen
          navigation={navigation as never}
          route={{
            params: {
              editVisitId: 'visit_7',
              restaurantId: 'restaurant_42',
              restaurantName: 'Cafe Test',
              sourceNoteId: 'note_1',
            },
          } as never}
        />,
      );
    });

    await act(async () => {
      renderer!.root.findByType('Input').props.onChangeText('Miso Ramen');
    });

    await act(async () => {
      renderer!.root.findByType('FeatureFormScreenScaffold').props.primaryAction.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(navigation.popTo).toHaveBeenCalledWith('CreateVisit', {
      editVisitId: 'visit_7',
      preselectedRestaurantId: 'restaurant_42',
      preselectedRestaurantName: 'Cafe Test',
      preselectedMenuItemId: 'item_9',
      preselectedMenuItemName: 'Miso Ramen',
      returnToStep: 1,
      sourceNoteId: 'note_1',
    });
  });

  it('uses the catalog write handoff after adding a menu item for a Tasting Plan', async () => {
    const createMenuItemAndAddToTastingPlan = jest.fn().mockResolvedValue({
      id: 'item_10',
      name: 'Tonkotsu Ramen',
    });
    mockedUseMenuItemCatalogWrites.mockReturnValue({
      applyScannedMenuItems: jest.fn(),
      createMenuItem: jest.fn(),
      createMenuItemAndAddToTastingPlan,
      updateMenuItem: jest.fn(),
    } as unknown as ReturnType<typeof useMenuItemCatalogWrites>);
    const navigation = {
      goBack: jest.fn(),
      popTo: jest.fn(),
    };
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <CreateVisitAddMenuItemScreen
          navigation={navigation as never}
          route={{
            params: {
              restaurantId: 'restaurant_42',
              restaurantName: 'Cafe Test',
              returnTo: 'TastingSessionPlanning',
              tastingRestaurantSuggestionId: 'restaurant_suggestion_1',
              tastingSessionId: 'session_1',
            },
          } as never}
        />,
      );
    });

    await act(async () => {
      renderer!.root.findByType('Input').props.onChangeText('Tonkotsu Ramen');
    });

    await act(async () => {
      renderer!.root.findByType('FeatureFormScreenScaffold').props.primaryAction.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(createMenuItemAndAddToTastingPlan).toHaveBeenCalledWith({
      createdBy: 'user_1',
      isFromOCR: false,
      name: 'Tonkotsu Ramen',
      restaurantId: 'restaurant_42',
      tastingRestaurantSuggestionId: 'restaurant_suggestion_1',
      tastingSessionId: 'session_1',
      visibility: 'friends',
    });
    expect(navigation.popTo).toHaveBeenCalledWith('TastingSessionPlanning', {
      sessionId: 'session_1',
    });
  });
});
