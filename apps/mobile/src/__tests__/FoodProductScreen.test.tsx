import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useMonthlyUsage } from '../features';
import { useOfflineAwareFeatureWrite } from '../features/store/useOfflineAwareFeatureWrite';
import { usePhotoPickerPermissions } from '../hooks/usePhotoPickerPermissions';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { FoodProductScreen } from '../screens/FoodProductScreen';

const mockReact = React;

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
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
  getNoteById: jest.fn(),
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
  let writeFeature: jest.Mock;

  beforeEach(() => {
    invalidateQueries = jest.fn().mockResolvedValue(undefined);
    writeFeature = jest.fn().mockResolvedValue({ status: 'queued' });

    mockedAsyncStorage.getItem.mockReset();
    mockedAsyncStorage.getItem.mockResolvedValue(null);
    mockedAsyncStorage.setItem.mockReset();
    mockedAsyncStorage.setItem.mockResolvedValue(undefined);
    mockedUseQuery.mockReset();
    mockedUseQuery.mockReturnValue(buildQueryResult(null));
    mockedUseQueryClient.mockReturnValue({
      invalidateQueries,
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
      requestPermission: jest.fn().mockResolvedValue({
        granted: true,
        canAskAgain: true,
        message: '',
      }),
      resetPermissionNeedsSettings: jest.fn(),
    });
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
    expect(navigate).toHaveBeenCalledWith('Home');
  });

  it('reads and writes only the current food product rated-before key', async () => {
    mockedAsyncStorage.getItem.mockResolvedValueOnce('1');

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
            navigate: jest.fn(),
          } as never}
          route={{
            params: {},
          } as never}
        />,
      );
    });

    expect(mockedAsyncStorage.getItem).toHaveBeenCalledWith('ui.foodProduct.hasRatedBefore');

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

    expect(mockedAsyncStorage.setItem).toHaveBeenCalledWith('ui.foodProduct.hasRatedBefore', '1');
  });
});
