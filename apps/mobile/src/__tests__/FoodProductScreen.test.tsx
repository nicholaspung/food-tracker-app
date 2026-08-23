import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import React from 'react';
import { Platform } from 'react-native';
import { act, create } from 'react-test-renderer';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useMonthlyUsage } from '../features';
import { useOfflineAwareFeatureWrite } from '../features/store/useOfflineAwareFeatureWrite';
import { usePhotoPickerPermissions } from '../hooks/usePhotoPickerPermissions';
import { buildFoodProductCreatedHomeParams } from '../navigation/homeRouteParams';
import { buildLocalPhotoFile } from '../lib/photoFiles';
import { resolvePhotoCaptureDate } from '../lib/photoMetadata';
import { trackObservabilityEvent } from '../observability';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { FoodProductScreen } from '../screens/FoodProductScreen';

const mockReact = React;

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    removeItem: jest.fn(),
    setItem: jest.fn(),
  },
}));

jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn(),
  useQueryClient: jest.fn(),
}));

jest.mock('expo-image-picker', () => ({
  getPendingResultAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  UIImagePickerPreferredAssetRepresentationMode: {
    Current: 'current',
  },
  UIImagePickerPresentationStyle: {
    FULL_SCREEN: 'full-screen',
  },
}));

jest.mock('../features', () => ({
  createFoodProduct: jest.fn(),
  formatLimitExceededMessage: jest.fn((payload: { message?: string }) => payload.message ?? 'Limit exceeded'),
  getNoteDetail: jest.fn(),
  homeFeedQueryKeys: {
    root: ['feature', 'homeFeed'],
  },
  markNoteUsed: jest.fn(),
  parseLimitExceededError: jest.fn(() => null),
  promoteCachedNoteToUsed: jest.fn(),
  resolveDefaultVisitVisibilityFromAuth: jest.fn(() => 'friends'),
  useMonthlyUsage: jest.fn(),
}));

jest.mock('../features/store/useOfflineAwareFeatureWrite', () => ({
  useOfflineAwareFeatureWrite: jest.fn(),
}));

jest.mock('../hooks/usePhotoPickerPermissions', () => ({
  usePhotoPickerPermissions: jest.fn(),
}));

jest.mock('../lib/offlineAlerts', () => ({
  showQueuedOfflineAlert: jest.fn(),
}));

jest.mock('../lib/photoFiles', () => ({
  buildLocalPhotoFile: jest.fn(),
}));

jest.mock('../lib/photoStaging', () => ({
  cleanupStagedPhotoFiles: jest.fn(() => Promise.resolve()),
  hasNativeImageManipulatorModule: jest.fn(() => true),
  PHOTO_RESIZE_NATIVE_MODULE_UNAVAILABLE_MESSAGE: 'Photo resizing is unavailable.',
  stageLocalPhotoFile: jest.fn((asset, options) => {
    const { buildLocalPhotoFile } = jest.requireMock('../lib/photoFiles');
    return Promise.resolve(buildLocalPhotoFile(asset, options));
  }),
}));

jest.mock('../lib/photoMetadata', () => ({
  resolvePhotoCaptureDate: jest.fn(),
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
}));

jest.mock('../ui', () => ({
  Button: (props: Record<string, unknown>) => mockReact.createElement('Button', props),
  Card: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Card', props, children),
  Text: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Text', props, children),
}));

jest.mock('../components/shared', () => ({
  FeatureFormScreenScaffold: (
    { children, ...props }: Record<string, unknown> & { children?: React.ReactNode },
  ) => mockReact.createElement('FeatureFormScreenScaffold', props, children),
  LinkedNoteCard: (props: Record<string, unknown>) => mockReact.createElement('LinkedNoteCard', props),
  LightweightStatusCard: ({ message, ...props }: Record<string, unknown> & { message?: React.ReactNode }) =>
    mockReact.createElement(
      'LightweightStatusCard',
      props,
      mockReact.createElement('Text', { tone: 'warning' }, message),
    ),
  OFFLINE_USAGE_WARNING_MESSAGE: 'Offline estimate may be stale. Backend limits are enforced when sync runs.',
  PageErrorToast: (props: Record<string, unknown>) => mockReact.createElement('PageErrorToast', props),
  PhotoInputField: (props: Record<string, unknown>) => mockReact.createElement('PhotoInputField', props),
  PhotoViewerModal: (props: Record<string, unknown>) => mockReact.createElement('PhotoViewerModal', props),
  FoodProductFormFields: (
    { photoSection, ...props }: Record<string, unknown> & { photoSection?: React.ReactNode },
  ) => mockReact.createElement('FoodProductFormFields', props, photoSection),
  UpgradePromptCard: (props: Record<string, unknown>) => mockReact.createElement('UpgradePromptCard', props),
}));

const mockedAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;
const mockedUseQuery = useQuery as jest.MockedFunction<typeof useQuery>;
const mockedUseQueryClient = useQueryClient as jest.MockedFunction<typeof useQueryClient>;
const mockedUseMonthlyUsage = useMonthlyUsage as jest.MockedFunction<typeof useMonthlyUsage>;
const mockedUseOfflineAwareFeatureWrite = useOfflineAwareFeatureWrite as jest.MockedFunction<
  typeof useOfflineAwareFeatureWrite
>;
const mockedUsePhotoPickerPermissions = usePhotoPickerPermissions as jest.MockedFunction<
  typeof usePhotoPickerPermissions
>;
const mockedBuildLocalPhotoFile = buildLocalPhotoFile as jest.MockedFunction<typeof buildLocalPhotoFile>;
const mockedResolvePhotoCaptureDate = resolvePhotoCaptureDate as jest.MockedFunction<typeof resolvePhotoCaptureDate>;
const mockedTrackObservabilityEvent = trackObservabilityEvent as jest.MockedFunction<
  typeof trackObservabilityEvent
>;
const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockedUseConnectivity = useConnectivity as jest.MockedFunction<typeof useConnectivity>;

function buildQueryResult<T>(data: T) {
  return {
    data,
    isError: false,
    isLoading: false,
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof useQuery>;
}

describe('FoodProductScreen', () => {
  let invalidateQueries: jest.Mock;
  let requestPermission: jest.Mock;
  let setQueryData: jest.Mock;
  let writeFeature: jest.Mock;
  const originalPlatformOS = Platform.OS;

  function setPlatformOS(os: typeof Platform.OS) {
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      get: () => os,
    });
  }

  beforeEach(() => {
    invalidateQueries = jest.fn().mockResolvedValue(undefined);
    setQueryData = jest.fn();
    writeFeature = jest.fn().mockResolvedValue({ status: 'queued' });
    requestPermission = jest.fn().mockResolvedValue({
      granted: true,
      canAskAgain: true,
      message: '',
    });
    setPlatformOS(originalPlatformOS);

    mockedAsyncStorage.getItem.mockReset();
    mockedAsyncStorage.getItem.mockResolvedValue(null);
    mockedAsyncStorage.removeItem.mockReset();
    mockedAsyncStorage.removeItem.mockResolvedValue(undefined);
    mockedAsyncStorage.setItem.mockReset();
    mockedAsyncStorage.setItem.mockResolvedValue(undefined);
    globalThis.localStorage.clear();
    (ImagePicker.getPendingResultAsync as jest.Mock).mockReset();
    (ImagePicker.getPendingResultAsync as jest.Mock).mockResolvedValue(null);
    (ImagePicker.launchCameraAsync as jest.Mock).mockReset();
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockReset();
    mockedUseQuery.mockReset();
    mockedUseQuery.mockReturnValue(buildQueryResult(null));
    mockedUseQueryClient.mockReturnValue({
      invalidateQueries,
      setQueryData,
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
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(writeFeature as ReturnType<typeof useOfflineAwareFeatureWrite>);
    mockedUsePhotoPickerPermissions.mockReturnValue({
      permissionNeedsSettings: false,
      requestPermission,
      resetPermissionNeedsSettings: jest.fn(),
    });
    mockedBuildLocalPhotoFile.mockReset();
    mockedBuildLocalPhotoFile.mockReturnValue({
      uri: 'file:///food-product.jpg',
      name: 'food-product.jpg',
      mimeType: 'image/jpeg',
    });
    mockedResolvePhotoCaptureDate.mockReset();
    mockedResolvePhotoCaptureDate.mockResolvedValue(new Date('2026-04-15T12:00:00.000Z'));
    mockedTrackObservabilityEvent.mockReset();
    mockedUseAuth.mockReturnValue({
      actualUser: {
        isAdmin: false,
      },
      user: {
        isAdmin: false,
        isSubscriber: true,
      },
    } as ReturnType<typeof useAuth>);
    mockedUseConnectivity.mockReturnValue({
      isOnline: true,
    } as ReturnType<typeof useConnectivity>);
  });

  afterAll(() => {
    setPlatformOS(originalPlatformOS);
  });

  it('starts with an empty location field', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <FoodProductScreen
          navigation={{
            canGoBack: () => true,
            goBack: jest.fn(),
            navigate: jest.fn(),
          } as never}
          route={{
            params: {},
          } as never}
        />,
      );
    });

    expect(renderer.root.findByType('FoodProductFormFields').props.value.locationText).toBe('');
  });

  it('passes typed location text into the queued food product create payload', async () => {
    const navigate = jest.fn();
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <FoodProductScreen
          navigation={{
            canGoBack: () => true,
            goBack: jest.fn(),
            navigate,
          } as never}
          route={{
            params: {},
          } as never}
        />,
      );
    });

    await act(async () => {
      renderer.root.findByType('FoodProductFormFields').props.onChange({
        itemName: 'Iced Coffee',
        locationText: 'Mission District',
      });
    });

    await act(async () => {
      renderer.root.findByType('FeatureFormScreenScaffold').props.primaryAction.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(writeFeature).toHaveBeenCalledTimes(1);
    expect(writeFeature.mock.calls[0][0]).toMatchObject({
      operationName: 'food-product.create',
      offline: {
        strategy: 'outbox',
        payload: expect.objectContaining({
          itemName: 'Iced Coffee',
          locationText: 'Mission District',
        }),
      },
    });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['feature', 'foodProducts'] });
    expect(navigate).toHaveBeenCalledWith('Home', buildFoodProductCreatedHomeParams());
  });

  it('tracks the renamed food product photo-pick start event', async () => {
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: 'file:///food-product.jpg',
          fileName: 'food-product.jpg',
          mimeType: 'image/jpeg',
        },
      ],
    });

    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <FoodProductScreen
          navigation={{
            canGoBack: () => true,
            goBack: jest.fn(),
            navigate: jest.fn(),
          } as never}
          route={{
            params: {},
          } as never}
        />,
      );
    });

    await act(async () => {
      await renderer.root.findByType('PhotoInputField').props.onGalleryPress();
    });

    expect(mockedTrackObservabilityEvent).toHaveBeenCalledWith('FOOD_PRODUCT_PHOTO_PICK_STARTED', {
      photoSource: 'gallery',
      source: 'FoodProductScreen',
    });
  });

  it('adds a draft photo from the gallery and applies the capture date', async () => {
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: 'file:///selected-food-product.jpg',
          fileName: 'selected-food-product.jpg',
          mimeType: 'image/jpeg',
        },
      ],
    });

    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <FoodProductScreen
          navigation={{
            canGoBack: () => true,
            goBack: jest.fn(),
            navigate: jest.fn(),
          } as never}
          route={{
            params: {},
          } as never}
        />,
      );
    });

    await act(async () => {
      await renderer.root.findByType('PhotoInputField').props.onGalleryPress();
    });

    expect(renderer.root.findByType('PhotoInputField').props.attachments).toEqual([
      expect.objectContaining({
        id: 'file:///food-product.jpg',
        label: 'Apr 15, 2026',
        uri: 'file:///food-product.jpg',
      }),
    ]);
    expect(renderer.root.findByType('FoodProductFormFields').props.detectedDateValue).toBe('2026-04-15');
    expect(renderer.root.findByType('FoodProductFormFields').props.value.date).toBe('2026-04-15');
    expect(mockedTrackObservabilityEvent).toHaveBeenCalledWith('FOOD_PRODUCT_PHOTO_PICKED', {
      photoSource: 'gallery',
      source: 'FoodProductScreen',
    });
  });

  it('surfaces permission denial without launching the picker', async () => {
    requestPermission.mockResolvedValueOnce({
      granted: false,
      canAskAgain: false,
      message: 'Photo library permission is blocked. Enable it in device settings.',
    });
    mockedUsePhotoPickerPermissions.mockReturnValue({
      permissionNeedsSettings: true,
      requestPermission,
      resetPermissionNeedsSettings: jest.fn(),
    });

    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <FoodProductScreen
          navigation={{
            canGoBack: () => true,
            goBack: jest.fn(),
            navigate: jest.fn(),
          } as never}
          route={{
            params: {},
          } as never}
        />,
      );
    });

    await act(async () => {
      await renderer.root.findByType('PhotoInputField').props.onGalleryPress();
    });

    expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
    expect(mockedTrackObservabilityEvent).toHaveBeenCalledWith('FOOD_PRODUCT_PHOTO_PERMISSION_DENIED', {
      canAskAgain: false,
      photoSource: 'gallery',
      source: 'FoodProductScreen',
    });
    expect(renderer.root.findByType('PageErrorToast').props.errorMessage).toBe(
      'Photo library permission is blocked. Enable it in device settings.',
    );
  });

  it('hides photo source actions and blocks picker launch at the free monthly photo limit', async () => {
    mockedUseAuth.mockReturnValue({
      actualUser: {
        isAdmin: false,
      },
      user: {
        isAdmin: false,
        isSubscriber: false,
      },
    } as ReturnType<typeof useAuth>);
    mockedUseMonthlyUsage.mockReturnValue({
      snapshot: {
        remaining: {
          photoUploadsMonthly: 0,
        },
        usage: {
          photoUploads: 100,
        },
      },
    } as never);

    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <FoodProductScreen
          navigation={{
            canGoBack: () => true,
            goBack: jest.fn(),
            navigate: jest.fn(),
          } as never}
          route={{
            params: {},
          } as never}
        />,
      );
    });

    const photoInputField = renderer.root.findByType('PhotoInputField');
    expect(photoInputField.props.hideSourceActions).toBe(true);
    expect(photoInputField.props.countLabel).toBeNull();
    expect(photoInputField.props.footerAction.props.children).toBe(
      'Free users can upload up to 100 photos per month. Remaining estimate: 0.',
    );
    expect(renderer.root.findAllByType('UpgradePromptCard')).toHaveLength(0);

    await act(async () => {
      await photoInputField.props.onGalleryPress();
    });

    expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
    expect(mockedTrackObservabilityEvent).toHaveBeenCalledWith('USAGE_LIMIT_REACHED', {
      enforcement: 'client_estimate',
      limit: 100,
      metric: 'photo_uploads',
      remaining: 0,
      source: 'FoodProductScreen',
      used: 100,
    });
  });

  it('restores an Android pending picker result as a draft photo', async () => {
    setPlatformOS('android');
    (ImagePicker.getPendingResultAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: 'file:///pending-food-product.jpg',
          fileName: 'pending-food-product.jpg',
          mimeType: 'image/jpeg',
        },
      ],
    });

    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <FoodProductScreen
          navigation={{
            canGoBack: () => true,
            goBack: jest.fn(),
            navigate: jest.fn(),
          } as never}
          route={{
            params: {},
          } as never}
        />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(ImagePicker.getPendingResultAsync).toHaveBeenCalledTimes(1);
    expect(renderer.root.findByType('PhotoInputField').props.attachments).toEqual([
      expect.objectContaining({
        id: 'file:///food-product.jpg',
        uri: 'file:///food-product.jpg',
      }),
    ]);
    expect(renderer.root.findByType('FoodProductFormFields').props.value.date).toBe('2026-04-15');
    expect(mockedTrackObservabilityEvent).toHaveBeenCalledWith('FOOD_PRODUCT_PHOTO_PICKED', {
      photoSource: 'gallery',
      restoredPendingResult: true,
      source: 'FoodProductScreen',
    });
  });

  it('opens the draft photo viewer and removes the draft photo', async () => {
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: 'file:///food-product.jpg',
          fileName: 'food-product.jpg',
          mimeType: 'image/jpeg',
        },
      ],
    });

    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <FoodProductScreen
          navigation={{
            canGoBack: () => true,
            goBack: jest.fn(),
            navigate: jest.fn(),
          } as never}
          route={{
            params: {},
          } as never}
        />,
      );
    });

    await act(async () => {
      await renderer.root.findByType('PhotoInputField').props.onGalleryPress();
    });

    await act(async () => {
      renderer.root.findByType('PhotoInputField').props.attachments[0].onPress();
    });

    expect(renderer.root.findByType('PhotoViewerModal').props.visible).toBe(true);

    await act(async () => {
      renderer.root.findByType('PhotoInputField').props.attachments[0].onRemove();
    });

    expect(renderer.root.findByType('PhotoInputField').props.attachments).toEqual([]);
    expect(renderer.root.findByType('FoodProductFormFields').props.detectedDateValue).toBeNull();
    expect(renderer.root.findByType('PhotoViewerModal').props.visible).toBe(false);
  });

  it('reads and writes only the current food product rated-before key', async () => {
    globalThis.localStorage.setItem('ui.foodProduct.hasRatedBefore', '1');
    const navigate = jest.fn();

    writeFeature = jest.fn().mockResolvedValue({
      status: 'completed',
      result: {
        id: 'food-product-1',
      },
    });
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(writeFeature as ReturnType<typeof useOfflineAwareFeatureWrite>);

    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <FoodProductScreen
          navigation={{
            canGoBack: () => true,
            goBack: jest.fn(),
            navigate,
          } as never}
          route={{
            params: {},
          } as never}
        />,
      );
    });

    expect(globalThis.localStorage.getItem('ui.foodProduct.hasRatedBefore')).toBe('1');

    await act(async () => {
      renderer.root.findByType('FoodProductFormFields').props.onChange({
        itemName: 'Iced Tea',
      });
    });

    await act(async () => {
      renderer.root.findByType('FeatureFormScreenScaffold').props.primaryAction.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(globalThis.localStorage.getItem('ui.foodProduct.hasRatedBefore')).toBe('1');
    expect(navigate).toHaveBeenCalledWith('Home', buildFoodProductCreatedHomeParams());
  });
});
