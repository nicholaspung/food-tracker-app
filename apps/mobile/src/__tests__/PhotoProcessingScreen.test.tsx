import React from 'react';
import { act, create } from 'react-test-renderer';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useMenuItemCatalogWrites, useMonthlyUsage } from '../features';
import { useOfflineAwareFeatureWrite } from '../features/store/useOfflineAwareFeatureWrite';
import { useImageSourcePicker } from '../hooks/useImageSourcePicker';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { PhotoProcessingScreen } from '../screens/PhotoProcessingScreen';
import { usePhotoProcessingRestaurantSelectionFlow } from '../hooks/useRestaurantSelectionFlow';
import { usePhotoProcessingDraftState } from '../screens/photoProcessing/usePhotoProcessingDraftState';
import { usePhotoProcessingReviewData } from '../screens/photoProcessing/usePhotoProcessingReviewData';
import { usePhotoProcessingSubmission } from '../screens/photoProcessing/usePhotoProcessingSubmission';

const mockReact = React;
const theme = {
  colors: {
    background: {
      app: 'app-background',
      muted: 'muted-background',
      surface: 'surface-background',
    },
    border: {
      default: 'default-border',
    },
    fill: {
      info: 'info-fill',
      success: 'success-fill',
    },
    status: {
      infoBg: 'info-background',
      infoBorder: 'info-border',
      successBg: 'success-background',
      successBorder: 'success-border',
    },
    text: {
      info: 'info-text',
      inverse: 'inverse-text',
      muted: 'muted-text',
      secondary: 'secondary-text',
      success: 'success-text',
    },
  },
  radii: {
    md: 12,
    pill: 999,
  },
  sizes: {
    inputMinHeight: 50,
  },
  spacing: {
    xxs: 4,
    xs: 8,
    sm: 12,
    md: 16,
    xl: 32,
  },
} as const;

jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn(),
  useQueryClient: jest.fn(),
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
    Image: (props: Record<string, unknown>) => React.createElement('Image', props),
    Keyboard: {
      dismiss: jest.fn(),
    },
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
    ScrollView: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
      React.createElement('ScrollView', props, children),
    View: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
      React.createElement('View', props, children),
  };
});

jest.mock('../components/shared', () => ({
  EmptyState: (props: Record<string, unknown>) => mockReact.createElement('EmptyState', props),
  ErrorState: (props: Record<string, unknown>) => mockReact.createElement('ErrorState', props),
  FeatureActionCard: (props: Record<string, unknown>) => mockReact.createElement('IconActionCard', props),
  FeatureFormScreenScaffold: (
    { children, ...props }: Record<string, unknown> & { children?: React.ReactNode },
  ) => mockReact.createElement('FeatureFormScreenScaffold', props, children),
  IconActionCard: (props: Record<string, unknown>) => mockReact.createElement('IconActionCard', props),
  LinkedNoteCard: (props: Record<string, unknown>) => mockReact.createElement('LinkedNoteCard', props),
  LightweightStatusCard: ({ message, ...props }: Record<string, unknown> & { message?: React.ReactNode }) =>
    mockReact.createElement(
      'LightweightStatusCard',
      props,
      mockReact.createElement('Text', { tone: 'warning' }, message),
    ),
  LoadingState: (props: Record<string, unknown>) => mockReact.createElement('LoadingState', props),
  OFFLINE_USAGE_WARNING_MESSAGE: 'Offline estimate may be stale. Backend limits are enforced when sync runs.',
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
  PhotoViewerModal: (props: Record<string, unknown>) => mockReact.createElement('PhotoViewerModal', props),
  FoodProductFormFields: (props: Record<string, unknown>) => mockReact.createElement('FoodProductFormFields', props),
  RatingLegend: (props: Record<string, unknown>) => mockReact.createElement('RatingLegend', props),
  RatingSelector: (props: Record<string, unknown>) => mockReact.createElement('RatingSelector', props),
  ScreenHeader: (props: Record<string, unknown>) => mockReact.createElement('ScreenHeader', props),
  SegmentedControl: (props: Record<string, unknown>) => mockReact.createElement('SegmentedControl', props),
  StatusPill: (props: Record<string, unknown>) => mockReact.createElement('StatusPill', props),
  StepProgressBar: (props: Record<string, unknown>) => mockReact.createElement('StepProgressBar', props),
  UpgradePromptCard: (props: Record<string, unknown>) => mockReact.createElement('UpgradePromptCard', props),
  VisitMenuItemOptionRow: (props: Record<string, unknown>) => mockReact.createElement('VisitMenuItemOptionRow', props),
  VisitMetadataCard: (props: Record<string, unknown>) => mockReact.createElement('VisitMetadataCard', props),
  VisitRestaurantOptionTrailing: (props: Record<string, unknown>) =>
    mockReact.createElement('VisitRestaurantOptionTrailing', props),
  VisitRestaurantSearchSection: (props: Record<string, unknown>) =>
    mockReact.createElement('VisitRestaurantSearchSection', props),
}));

jest.mock('../features', () => ({
  getAuthenticatedUserIdOrNull: jest.fn(() => 'user-1'),
  getNoteDetail: jest.fn(),
  useMenuItemCatalogWrites: jest.fn(),
  useMonthlyUsage: jest.fn(),
}));

jest.mock('../features/store/useOfflineAwareFeatureWrite', () => ({
  useOfflineAwareFeatureWrite: jest.fn(),
}));

jest.mock('../features/store/notesQuery', () => ({
  notesQueryKeys: {
    detail: (noteId: string) => ['feature', 'notes', 'detail', noteId],
  },
}));

jest.mock('../hooks/useImageSourcePicker', () => ({
  useImageSourcePicker: jest.fn(),
}));

jest.mock('../hooks/useRestaurantSelectionFlow', () => ({
  usePhotoProcessingRestaurantSelectionFlow: jest.fn(),
}));

jest.mock('../lib/dateFormatting', () => ({
  getTodayLocalDateString: jest.fn(() => '2026-04-18'),
}));

jest.mock('../lib/foodProductForm', () => ({
  buildDefaultFoodProductForm: jest.fn(() => ({
    category: 'dish',
    date: '2026-04-18',
    itemName: '',
    locationText: '',
    notes: '',
    rating: 3,
    visibility: 'friends',
  })),
  resolveDefaultFoodProductVisibility: jest.fn(() => 'friends'),
}));

jest.mock('../lib/usageUiRules', () => ({
  resolveDisplayPhotoUploadsPerRecordLimit: jest.fn(() => 20),
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

jest.mock('../screens/MenuScanPhotoProcessingScreen', () => ({
  MenuScanPhotoProcessingScreen: (props: Record<string, unknown>) =>
    mockReact.createElement('MenuScanPhotoProcessingScreen', props),
}));

jest.mock('../screens/photoProcessing/notePhotoHydration', () => ({
  cleanupHydratedNotePhotos: jest.fn(),
  hydrateDraftPhotosFromNote: jest.fn(),
}));

jest.mock('../screens/photoProcessing/usePhotoProcessingDraftState', () => ({
  usePhotoProcessingDraftState: jest.fn(),
}));

jest.mock('../screens/photoProcessing/usePhotoProcessingReviewData', () => ({
  usePhotoProcessingReviewData: jest.fn(),
}));

jest.mock('../screens/photoProcessing/usePhotoProcessingSubmission', () => ({
  usePhotoProcessingSubmission: jest.fn(),
}));

jest.mock('../theme', () => ({
  createThemedStyles:
    (factory: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) =>
      factory(theme, ...args),
  useTheme: () => theme,
}));

jest.mock('../ui', () => ({
  Button: (props: Record<string, unknown>) => mockReact.createElement('Button', props),
  Card: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Card', props, children),
  Input: (props: Record<string, unknown>) => mockReact.createElement('Input', props),
  Screen: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Screen', props, children),
  Text: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Text', props, children),
}));

jest.mock('../screens/photoProcessing/shared', () => ({
  buildDefaultRestaurantForm: jest.fn(() => ({
    date: '2026-04-18',
  })),
  buildDefaultRestaurantPhotoGroups: jest.fn((photos: { id: string }[]) =>
    photos.map((photo) => ({
      id: `restaurant-photo-group-${photo.id}`,
      photoIds: [photo.id],
    })),
  ),
  collapseRestaurantOptionsToSelection: jest.fn(
    ({
      savedRestaurants,
      searchRestaurants,
    }: {
      savedRestaurants: unknown[];
      searchRestaurants: unknown[];
    }) => ({
      savedRestaurants,
      searchRestaurants,
    }),
  ),
  formatCoordinatesForDisplay: jest.fn(() => '37.7749, -122.4194'),
  formatDraftPhotoMetadataLabel: jest.fn((photo: { name: string }) => photo.name),
  FREE_MONTHLY_PHOTO_LIMIT: 100,
  normalizeSelectionLabel: jest.fn((value: string) => value.trim().toLowerCase()),
  resolveDraftPhotoDetectedDateValue: jest.fn(() => null),
  resolveProgressSteps: jest.fn(() => []),
  resolveWizardStepIndex: jest.fn(() => 1),
}));

const mockedUseQuery = useQuery as jest.MockedFunction<typeof useQuery>;
const mockedUseQueryClient = useQueryClient as jest.MockedFunction<typeof useQueryClient>;
const mockedUseMonthlyUsage = useMonthlyUsage as jest.MockedFunction<typeof useMonthlyUsage>;
const mockedUseMenuItemCatalogWrites = useMenuItemCatalogWrites as jest.MockedFunction<
  typeof useMenuItemCatalogWrites
>;
const mockedUseOfflineAwareFeatureWrite = useOfflineAwareFeatureWrite as jest.MockedFunction<
  typeof useOfflineAwareFeatureWrite
>;
const mockedUseImageSourcePicker = useImageSourcePicker as jest.MockedFunction<typeof useImageSourcePicker>;
const mockedUseRestaurantSelectionFlow = usePhotoProcessingRestaurantSelectionFlow as jest.MockedFunction<
  typeof usePhotoProcessingRestaurantSelectionFlow
>;
const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockedUseConnectivity = useConnectivity as jest.MockedFunction<typeof useConnectivity>;
const mockedUsePhotoProcessingDraftState = usePhotoProcessingDraftState as jest.MockedFunction<
  typeof usePhotoProcessingDraftState
>;
const mockedUsePhotoProcessingReviewData = usePhotoProcessingReviewData as jest.MockedFunction<
  typeof usePhotoProcessingReviewData
>;
const mockedUsePhotoProcessingSubmission = usePhotoProcessingSubmission as jest.MockedFunction<
  typeof usePhotoProcessingSubmission
>;

function collectText(node: { children?: unknown[]; props?: { children?: unknown } } | string): string {
  if (typeof node === 'string') {
    return node;
  }

  const children = node.children ?? node.props?.children;
  const normalizedChildren = Array.isArray(children) ? children : children ? [children] : [];

  return normalizedChildren
    .map((child) =>
      typeof child === 'string'
        ? child
        : collectText(child as { children?: unknown[]; props?: { children?: unknown } }),
    )
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildQueryResult<T>(data: T) {
  return {
    data,
    isError: false,
    isLoading: false,
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof useQuery>;
}

async function renderPhotoProcessingScreen(routeParams: Record<string, unknown> = {}) {
  let renderer: any = null;

  await act(async () => {
    renderer = create(
      <PhotoProcessingScreen
        navigation={{
          goBack: jest.fn(),
          navigate: jest.fn(),
        } as never}
        route={{
          params: routeParams,
        } as never}
      />,
    );
  });

  return renderer;
}

describe('PhotoProcessingScreen', () => {
  beforeEach(() => {
    mockedUseQuery.mockReturnValue({
      data: null,
      isError: false,
      isLoading: false,
      refetch: jest.fn(),
    } as unknown as ReturnType<typeof useQuery>);
    mockedUseQueryClient.mockReturnValue({
      invalidateQueries: jest.fn(),
      setQueryData: jest.fn(),
    } as unknown as ReturnType<typeof useQueryClient>);
    mockedUseMonthlyUsage.mockReturnValue({
      snapshot: null,
      cachedAt: null,
      isUsingCachedSnapshot: false,
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: jest.fn(),
    });
    mockedUseMenuItemCatalogWrites.mockReturnValue({
      applyScannedMenuItems: jest.fn(),
      createMenuItem: jest.fn(),
      updateMenuItem: jest.fn(),
    } as unknown as ReturnType<typeof useMenuItemCatalogWrites>);
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(jest.fn() as ReturnType<typeof useOfflineAwareFeatureWrite>);
    mockedUseImageSourcePicker.mockReturnValue({
      permissionNeedsSettings: false,
      pickImageAssets: jest.fn().mockResolvedValue({
        assets: [],
        permissionDenied: false,
      }),
      requestSourcePermission: jest.fn(),
      resetPermissionNeedsSettings: jest.fn(),
    } as ReturnType<typeof useImageSourcePicker>);
    mockedUseRestaurantSelectionFlow.mockReturnValue({
      menuItems: {
        loadedRestaurantRecords: [],
        query: {
          data: [],
          isError: false,
          isLoading: false,
        },
      },
      quotaDisplay: {
        isPlacesQuotaReached: false,
        placesQueriesRemaining: null,
        shouldShowPlacesUpgradePrompt: false,
      },
      reset: jest.fn(),
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
        searchButtonDisabled: false,
        searchByText: jest.fn().mockResolvedValue({ status: 'success', results: [] }),
        searchErrorMessage: null,
        setExpanded: jest.fn(),
        setManualLocation: jest.fn(),
        setQuery: jest.fn(),
        showNearbyPlaces: false,
      },
    } as unknown as ReturnType<typeof usePhotoProcessingRestaurantSelectionFlow>);
    mockedUseAuth.mockReturnValue({
      actualUser: {
        isAdmin: false,
      },
      user: {
        isAdmin: false,
        isSubscriber: true,
        name: 'Test User',
      },
    } as ReturnType<typeof useAuth>);
    mockedUseConnectivity.mockReturnValue({
      isOnline: true,
    } as ReturnType<typeof useConnectivity>);
    mockedUsePhotoProcessingDraftState.mockReturnValue({
      appendAssets: jest.fn(),
      currentPhoto: null,
      currentPhotoIndex: 0,
      currentFoodProductForm: null,
      currentRestaurantForm: null,
      dismissCurrentPhotoLocationHint: jest.fn(),
      locationMetadataHintDismissedByPhotoId: {},
      photos: [
        {
          id: 'photo-1',
          name: 'first.jpg',
          uri: 'file:///first.jpg',
        },
        {
          id: 'photo-2',
          name: 'second.jpg',
          uri: 'file:///second.jpg',
        },
      ],
      foodProductForms: {},
      removePhoto: jest.fn(),
      replacePhotos: jest.fn(),
      resetDraftState: jest.fn(),
      resetProcessingForms: jest.fn(),
      restaurantForms: {
        'restaurant-photo-group-photo-1': {
          date: '2026-04-18',
          description: '',
          menuItemId: '',
          menuItemName: '',
          notes: '',
          rating: 3,
          restaurantId: '',
          restaurantName: '',
        },
      },
      setCurrentPhotoIndex: jest.fn(),
      setFoodProductForms: jest.fn(),
      setRestaurantForms: jest.fn(),
      updateCurrentFoodProductForm: jest.fn(),
      updateCurrentRestaurantForm: jest.fn(),
    } as unknown as ReturnType<typeof usePhotoProcessingDraftState>);
    mockedUsePhotoProcessingReviewData.mockReturnValue({
      foodProductReviewEntries: [],
      restaurantReviewGroups: [],
      reviewFoodProductCards: [],
      reviewVisitCards: [],
    } as ReturnType<typeof usePhotoProcessingReviewData>);
    mockedUsePhotoProcessingSubmission.mockReturnValue({
      handleProcessNext: jest.fn(),
      handleSubmitAll: jest.fn(),
      isSubmitting: false,
    } as ReturnType<typeof usePhotoProcessingSubmission>);
  });

  it('shows selected photos before muted add-more controls once photos exist', async () => {
    const renderer = await renderPhotoProcessingScreen();

    await act(async () => {
      renderer.root.findAllByType('IconActionCard')[1].props.onPress();
    });

    const cards = renderer.root.findAllByType('Card');
    const sourceActions = renderer.root.findByType('PhotoSourceActionCards');

    expect(collectText(cards[0])).toContain('2 photos selected');
    expect(collectText(cards[1])).toContain('Add more photos');
    expect(collectText(cards[1])).toContain('Take another photo or upload more saved photos.');
    expect(cards[1].props.tone).toBe('muted');
    expect(sourceActions.props.tone).toBe('muted');
  });

  it('hides upload source actions at the free monthly photo limit while keeping selected drafts', async () => {
    const pickImageAssets = jest.fn();
    mockedUseAuth.mockReturnValue({
      actualUser: {
        isAdmin: false,
      },
      user: {
        isAdmin: false,
        isSubscriber: false,
        name: 'Test User',
      },
    } as ReturnType<typeof useAuth>);
    mockedUseMonthlyUsage.mockReturnValue({
      snapshot: {
        remaining: {
          placesQueriesMonthly: 5,
        },
        usage: {
          photoUploads: 98,
        },
      },
    } as never);
    mockedUseImageSourcePicker.mockReturnValue({
      permissionNeedsSettings: false,
      pickImageAssets,
      requestSourcePermission: jest.fn(),
      resetPermissionNeedsSettings: jest.fn(),
    } as ReturnType<typeof useImageSourcePicker>);

    const renderer = await renderPhotoProcessingScreen();

    await act(async () => {
      renderer.root.findAllByType('IconActionCard')[1].props.onPress();
    });

    expect(renderer.root.findAllByType('PhotoSourceActionCards')).toHaveLength(0);
    const cardText: string[] = renderer.root.findAllByType('Card').map(collectText);
    expect(cardText.some((text) => text.includes('2 photos selected'))).toBe(true);
    expect(cardText.some((text) =>
      text.includes('Free users can upload up to 100 photos per month. Remaining estimate: 0.'),
    )).toBe(true);
    expect(cardText.some((text) => text.includes('Monthly photo estimate'))).toBe(false);
    expect(renderer.root.findAllByType('UpgradePromptCard')).toHaveLength(0);
    expect(renderer.root.findByType('FeatureFormScreenScaffold').props.primaryAction.disabled).toBe(false);
    expect(pickImageAssets).not.toHaveBeenCalled();
  });

  it('limits added gallery photos to the remaining monthly free slots', async () => {
    const appendAssets = jest.fn();
    const pickImageAssets = jest.fn().mockResolvedValue({
      status: 'success',
      assets: [
        { uri: 'file:///third.jpg' },
        { uri: 'file:///fourth.jpg' },
      ],
    });
    mockedUseAuth.mockReturnValue({
      actualUser: {
        isAdmin: false,
      },
      user: {
        isAdmin: false,
        isSubscriber: false,
        name: 'Test User',
      },
    } as ReturnType<typeof useAuth>);
    mockedUseMonthlyUsage.mockReturnValue({
      snapshot: {
        remaining: {
          placesQueriesMonthly: 5,
        },
        usage: {
          photoUploads: 97,
        },
      },
    } as never);
    mockedUseImageSourcePicker.mockReturnValue({
      permissionNeedsSettings: false,
      pickImageAssets,
      requestSourcePermission: jest.fn(),
      resetPermissionNeedsSettings: jest.fn(),
    } as ReturnType<typeof useImageSourcePicker>);
    mockedUsePhotoProcessingDraftState.mockReturnValue({
      appendAssets,
      currentPhoto: null,
      currentPhotoIndex: 0,
      currentFoodProductForm: null,
      currentRestaurantForm: null,
      dismissCurrentPhotoLocationHint: jest.fn(),
      locationMetadataHintDismissedByPhotoId: {},
      photos: [
        {
          id: 'photo-1',
          name: 'first.jpg',
          uri: 'file:///first.jpg',
        },
        {
          id: 'photo-2',
          name: 'second.jpg',
          uri: 'file:///second.jpg',
        },
      ],
      foodProductForms: {},
      removePhoto: jest.fn(),
      replacePhotos: jest.fn(),
      resetDraftState: jest.fn(),
      resetProcessingForms: jest.fn(),
      restaurantForms: {},
      setCurrentPhotoIndex: jest.fn(),
      setFoodProductForms: jest.fn(),
      setRestaurantForms: jest.fn(),
      updateCurrentFoodProductForm: jest.fn(),
      updateCurrentRestaurantForm: jest.fn(),
    } as unknown as ReturnType<typeof usePhotoProcessingDraftState>);

    const renderer = await renderPhotoProcessingScreen();

    await act(async () => {
      renderer.root.findAllByType('IconActionCard')[1].props.onPress();
    });
    await act(async () => {
      await renderer.root.findByType('PhotoSourceActionCards').props.onGalleryPress();
    });

    expect(pickImageAssets).toHaveBeenCalledWith(
      expect.objectContaining({
        selectionLimit: 1,
      }),
    );
    expect(appendAssets).toHaveBeenCalledWith([{ uri: 'file:///third.jpg' }]);
    expect(renderer.root.findByType('PageErrorToast').props.errorMessage).toBe(
      'Only 1 photo upload left this month.',
    );
  });

  it.each([
    ['restaurant', 'note-use-choice-restaurant'],
    ['food product', 'note-use-choice-food-product'],
  ])('opens the photo viewer from the %s process step preview', async (_label, actionTestId) => {
    mockedUseQuery.mockReturnValue(
      buildQueryResult({
        note: {
          content: 'Use this note',
          title: 'Linked note',
        },
        photos: [
          {
            created: '2026-04-18T12:00:00.000Z',
            id: 'note-photo-1',
            note: 'note-1',
            photo: 'note-photo-1.jpg',
          },
        ],
      }),
    );
    mockedUsePhotoProcessingDraftState.mockReturnValue({
      appendAssets: jest.fn(),
      currentPhoto: {
        id: 'photo-1',
        name: 'first.jpg',
        uri: 'file:///first.jpg',
      },
      currentPhotoIndex: 0,
      currentFoodProductForm: null,
      currentRestaurantForm: null,
      dismissCurrentPhotoLocationHint: jest.fn(),
      locationMetadataHintDismissedByPhotoId: {},
      photos: [
        {
          id: 'photo-1',
          name: 'first.jpg',
          uri: 'file:///first.jpg',
        },
        {
          id: 'photo-2',
          name: 'second.jpg',
          uri: 'file:///second.jpg',
        },
      ],
      foodProductForms: {},
      removePhoto: jest.fn(),
      replacePhotos: jest.fn(),
      resetDraftState: jest.fn(),
      resetProcessingForms: jest.fn(),
      restaurantForms: {},
      setCurrentPhotoIndex: jest.fn(),
      setFoodProductForms: jest.fn(),
      setRestaurantForms: jest.fn(),
      updateCurrentFoodProductForm: jest.fn(),
      updateCurrentRestaurantForm: jest.fn(),
    } as unknown as ReturnType<typeof usePhotoProcessingDraftState>);

    const renderer = await renderPhotoProcessingScreen({ sourceNoteId: 'note-1' });

    await act(async () => {
      renderer.root.findByProps({ testID: actionTestId }).props.onPress();
    });

    await act(async () => {
      renderer.root.findByType('FeatureFormScreenScaffold').props.primaryAction.onPress();
    });

    await act(async () => {
      renderer.root.findByType('FeatureFormScreenScaffold').props.primaryAction.onPress();
    });

    await act(async () => {
      renderer.root.findByProps({ testID: 'process-photo-preview-button' }).props.onPress();
    });

    let photoViewerModal = renderer.root.findByType('PhotoViewerModal');

    expect(photoViewerModal.props.visible).toBe(true);
    expect(photoViewerModal.props.urls).toEqual(['file:///first.jpg']);
    expect(photoViewerModal.props.initialIndex).toBe(0);

    await act(async () => {
      photoViewerModal.props.onRequestClose();
    });

    photoViewerModal = renderer.root.findByType('PhotoViewerModal');
    expect(photoViewerModal.props.visible).toBe(false);
  });

  it('passes history counts into restaurant and menu item selection rows', async () => {
    mockedUseRestaurantSelectionFlow.mockReturnValue({
      menuItems: {
        loadedRestaurantRecords: [
          {
            friendCount: 2,
            id: 'restaurant-1',
            name: 'Noodle House',
            userVisitCount: 4,
          },
        ],
        query: {
          data: [
            {
              createdBy: 'user-1',
              friendEatenCount: 2,
              id: 'menu-item-1',
              name: 'Spicy Ramen',
              restaurant: 'restaurant-1',
              userEatenCount: 5,
              visibility: 'friends',
            },
          ],
          isError: false,
          isLoading: false,
        },
      },
      quotaDisplay: {
        isPlacesQuotaReached: false,
        placesQueriesRemaining: null,
        shouldShowPlacesUpgradePrompt: false,
      },
      reset: jest.fn(),
      savedSuggestions: {
        displayedSavedRestaurants: [
          {
            distance: null,
            restaurant: {
              friendCount: 2,
              id: 'restaurant-1',
              name: 'Noodle House',
              userVisitCount: 4,
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
        searchButtonDisabled: false,
        searchByText: jest.fn().mockResolvedValue({ status: 'success', results: [] }),
        searchErrorMessage: null,
        setExpanded: jest.fn(),
        setManualLocation: jest.fn(),
        setQuery: jest.fn(),
        showNearbyPlaces: false,
      },
    } as unknown as ReturnType<typeof usePhotoProcessingRestaurantSelectionFlow>);
    mockedUsePhotoProcessingDraftState.mockReturnValue({
      appendAssets: jest.fn(),
      currentPhoto: {
        id: 'photo-1',
        name: 'first.jpg',
        uri: 'file:///first.jpg',
      },
      currentPhotoIndex: 0,
      currentFoodProductForm: null,
      currentRestaurantForm: {
        date: '2026-04-18',
        description: '',
        menuItemId: '',
        menuItemName: '',
        notes: '',
        rating: 3,
        restaurantId: 'restaurant-1',
        restaurantName: 'Noodle House',
      },
      dismissCurrentPhotoLocationHint: jest.fn(),
      locationMetadataHintDismissedByPhotoId: {},
      photos: [
        {
          id: 'photo-1',
          name: 'first.jpg',
          uri: 'file:///first.jpg',
        },
      ],
      foodProductForms: {},
      removePhoto: jest.fn(),
      replacePhotos: jest.fn(),
      resetDraftState: jest.fn(),
      resetProcessingForms: jest.fn(),
      restaurantForms: {
        'restaurant-photo-group-photo-1': {
          date: '2026-04-18',
          description: '',
          menuItemId: 'menu-item-1',
          menuItemName: 'Ramen',
          notes: '',
          rating: 5,
          restaurantId: 'restaurant-1',
          restaurantName: 'Noodle House',
        },
      },
      setCurrentPhotoIndex: jest.fn(),
      setFoodProductForms: jest.fn(),
      setRestaurantForms: jest.fn(),
      updateCurrentFoodProductForm: jest.fn(),
      updateCurrentRestaurantForm: jest.fn(),
    } as unknown as ReturnType<typeof usePhotoProcessingDraftState>);

    const renderer = await renderPhotoProcessingScreen();

    await act(async () => {
      renderer.root.findAllByType('IconActionCard')[0].props.onPress();
    });

    await act(async () => {
      renderer.root.findByType('FeatureFormScreenScaffold').props.primaryAction.onPress();
    });

    await act(async () => {
      renderer.root.findByType('FeatureFormScreenScaffold').props.primaryAction.onPress();
    });

    const restaurantSection = renderer.root.findByType('VisitRestaurantSearchSection');
    const menuItemRow = renderer.root.findByType('VisitMenuItemOptionRow');

    expect(menuItemRow.props.userEatenCount).toBe(5);
    expect(menuItemRow.props.friendEatenCount).toBe(2);
    expect(collectText(restaurantSection.props.savedOptions[0].description)).toContain('You: 4 visits');
    expect(collectText(restaurantSection.props.savedOptions[0].description)).toContain('Friends: 2 friends');
  });
});
