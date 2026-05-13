import React from 'react';
import { act, create } from 'react-test-renderer';
import * as ImagePicker from 'expo-image-picker';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  buildPocketBaseFileUrl,
  useMonthlyUsage,
} from '../features';
import { useOfflineAwareFeatureWrite } from '../features/store/useOfflineAwareFeatureWrite';
import { usePhotoPickerPermissions } from '../hooks/usePhotoPickerPermissions';
import { buildLocalPhotoFile } from '../lib/photoFiles';
import { resolvePhotoCaptureDate } from '../lib/photoMetadata';
import { trackObservabilityEvent } from '../observability';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { EditFoodProductScreen } from '../screens/EditFoodProductScreen';

const mockReact = React;

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
  buildPocketBaseFileUrl: jest.fn(),
  formatLimitExceededMessage: jest.fn((payload: { message?: string }) => payload.message ?? 'Limit exceeded'),
  getFoodProductById: jest.fn(),
  homeFeedQueryKeys: {
    root: ['feature', 'homeFeed'],
  },
  listFoodProductPhotos: jest.fn(),
  parseLimitExceededError: jest.fn(() => null),
  resolveDefaultVisitVisibilityFromAuth: jest.fn(() => 'friends'),
  updateFoodProduct: jest.fn(),
  useMonthlyUsage: jest.fn(),
}));

jest.mock('../features/store/pocketbaseGateway', () => ({
  buildPocketBaseFileUrl: jest.fn(({ recordId, filename, thumb }) =>
    `pb://${recordId}/${filename}${thumb ? `?thumb=${thumb}` : ''}`,
  ),
}));

jest.mock('../features/store/useOfflineAwareFeatureWrite', () => ({
  useOfflineAwareFeatureWrite: jest.fn(),
}));

jest.mock('../hooks/usePhotoPickerPermissions', () => ({
  usePhotoPickerPermissions: jest.fn(),
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
  EmptyState: (props: Record<string, unknown>) => mockReact.createElement('EmptyState', props),
  ErrorState: (props: Record<string, unknown>) => mockReact.createElement('ErrorState', props),
  FeatureFormScreenScaffold: (
    { children, ...props }: Record<string, unknown> & { children?: React.ReactNode },
  ) => mockReact.createElement('FeatureFormScreenScaffold', props, children),
  PageErrorToast: (props: Record<string, unknown>) => mockReact.createElement('PageErrorToast', props),
  PhotoInputField: (props: Record<string, unknown>) => mockReact.createElement('PhotoInputField', props),
  PhotoViewerModal: (props: Record<string, unknown>) => mockReact.createElement('PhotoViewerModal', props),
  FoodProductFormFields: (
    { photoSection, ...props }: Record<string, unknown> & { photoSection?: React.ReactNode },
  ) => mockReact.createElement('FoodProductFormFields', props, photoSection),
  Skeleton: (props: Record<string, unknown>) => mockReact.createElement('Skeleton', props),
  UpgradePromptCard: (props: Record<string, unknown>) => mockReact.createElement('UpgradePromptCard', props),
}));

const mockedUseQuery = useQuery as jest.MockedFunction<typeof useQuery>;
const mockedUseQueryClient = useQueryClient as jest.MockedFunction<typeof useQueryClient>;
const mockedBuildPocketBaseFileUrl = buildPocketBaseFileUrl as jest.MockedFunction<typeof buildPocketBaseFileUrl>;
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

function buildQueryResult<T>(input: {
  data: T;
  isError?: boolean;
  isLoading?: boolean;
}) {
  return {
    data: input.data,
    isError: input.isError ?? false,
    isLoading: input.isLoading ?? false,
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof useQuery>;
}

describe('EditFoodProductScreen', () => {
  beforeEach(() => {
    mockedUseQuery.mockImplementation(({ queryKey }) => {
      if (Array.isArray(queryKey) && queryKey[1] === 'foodProduct') {
        return buildQueryResult({
          data: {
            id: 'food-product-1',
            restaurantName: 'Food Product',
            itemCategory: 'Packaged food',
            itemName: 'Iced Coffee',
            locationText: 'Mission District',
            rating: 4,
            notes: 'Smooth and sweet',
            visibility: 'friends',
            itemDate: '2026-04-12T18:30:00.000Z',
            createdAt: '2026-04-12T18:30:00.000Z',
            updatedAt: '2026-04-12T18:30:00.000Z',
          },
        });
      }

      if (Array.isArray(queryKey) && queryKey[1] === 'visitPhotos') {
        return buildQueryResult({
          data: [
            {
              id: 'photo-1',
              food_item: 'food-product-1',
              photo: 'iced-coffee.jpg',
              collectionName: 'visit_photos',
              created: '2026-04-12T18:31:00.000Z',
            },
          ],
        });
      }

      return buildQueryResult({ data: null });
    });
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
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(jest.fn() as ReturnType<typeof useOfflineAwareFeatureWrite>);
    mockedUsePhotoPickerPermissions.mockReturnValue({
      permissionNeedsSettings: false,
      requestPermission: jest.fn().mockResolvedValue({
        granted: true,
        canAskAgain: true,
        message: '',
      }),
      resetPermissionNeedsSettings: jest.fn(),
    });
    mockedBuildPocketBaseFileUrl.mockImplementation(({ recordId, filename, thumb }) =>
      `pb://${recordId}/${filename}${thumb ? `?thumb=${thumb}` : ''}`,
    );
    mockedBuildLocalPhotoFile.mockReturnValue({
      uri: 'file:///replacement.jpg',
      name: 'replacement.jpg',
      mimeType: 'image/jpeg',
    });
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
    (ImagePicker.launchCameraAsync as jest.Mock).mockReset();
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockReset();
    (ImagePicker.getPendingResultAsync as jest.Mock).mockResolvedValue(null);
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: 'file:///replacement.jpg',
          fileName: 'replacement.jpg',
          mimeType: 'image/jpeg',
        },
      ],
    });
  });

  it('preloads the shared food product form and current primary photo', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <EditFoodProductScreen
          navigation={{
            canGoBack: () => true,
            goBack: jest.fn(),
            navigate: jest.fn(),
          } as never}
          route={{
            params: {
              foodProductId: 'food-product-1',
            },
          } as never}
        />,
      );
    });

    expect(renderer.root.findByType('FoodProductFormFields').props.value).toEqual({
      itemName: 'Iced Coffee',
      locationText: 'Mission District',
      category: 'Packaged food',
      rating: 4,
      notes: 'Smooth and sweet',
      visibility: 'friends',
      date: '2026-04-12',
    });

    expect(renderer.root.findByType('PhotoInputField').props.attachments).toEqual([
      expect.objectContaining({
        id: 'photo-1',
        label: 'Apr 12, 2026',
        uri: 'pb://photo-1/iced-coffee.jpg?thumb=100x100',
      }),
    ]);
    expect(renderer.root.findByType('PhotoViewerModal').props).toMatchObject({
      previewUrls: ['pb://photo-1/iced-coffee.jpg?thumb=100x100'],
      urls: ['pb://photo-1/iced-coffee.jpg'],
    });
  });

  it('shows a replacement photo immediately and restores the original when the draft is removed', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <EditFoodProductScreen
          navigation={{
            canGoBack: () => true,
            goBack: jest.fn(),
            navigate: jest.fn(),
          } as never}
          route={{
            params: {
              foodProductId: 'food-product-1',
            },
          } as never}
        />,
      );
    });

    await act(async () => {
      await renderer.root.findByType('PhotoInputField').props.onGalleryPress();
    });

    expect(renderer.root.findByType('PhotoInputField').props.attachments).toEqual([
      expect.objectContaining({
        id: 'file:///replacement.jpg',
        label: 'Apr 15, 2026',
        uri: 'file:///replacement.jpg',
      }),
    ]);
    expect(renderer.root.findByType('FoodProductFormFields').props.detectedDateValue).toBe('2026-04-15');
    expect(renderer.root.findByType('FoodProductFormFields').props.value.date).toBe('2026-04-15');
    expect(mockedTrackObservabilityEvent).toHaveBeenCalledWith('FOOD_PRODUCT_PHOTO_PICKED', {
      photoSource: 'gallery',
      source: 'EditFoodProductScreen',
    });

    await act(async () => {
      renderer.root.findByType('PhotoInputField').props.attachments[0].onRemove();
    });

    expect(renderer.root.findByType('PhotoInputField').props.attachments).toEqual([
      expect.objectContaining({
        id: 'photo-1',
        label: 'Apr 12, 2026',
        uri: 'pb://photo-1/iced-coffee.jpg?thumb=100x100',
      }),
    ]);
    expect(renderer.root.findByType('FoodProductFormFields').props.detectedDateValue).toBeNull();
    expect(renderer.root.findByType('FoodProductFormFields').props.value.date).toBe('2026-04-12');
  });

  it('hides replacement photo actions and blocks picker launch at the free monthly photo limit', async () => {
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
        <EditFoodProductScreen
          navigation={{
            canGoBack: () => true,
            goBack: jest.fn(),
            navigate: jest.fn(),
          } as never}
          route={{
            params: {
              foodProductId: 'food-product-1',
            },
          } as never}
        />,
      );
    });

    const photoInputField = renderer.root.findByType('PhotoInputField');
    expect(photoInputField.props.hideSourceActions).toBe(true);
    expect(photoInputField.props.attachments).toEqual([
      expect.objectContaining({
        id: 'photo-1',
        label: 'Apr 12, 2026',
        uri: 'pb://photo-1/iced-coffee.jpg?thumb=100x100',
      }),
    ]);
    expect(photoInputField.props.countLabel).toBe('1/1');
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
      source: 'EditFoodProductScreen',
      used: 100,
    });
  });

  it('tracks the renamed edit food product validation failure event', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <EditFoodProductScreen
          navigation={{
            canGoBack: () => true,
            goBack: jest.fn(),
            navigate: jest.fn(),
          } as never}
          route={{
            params: {
              foodProductId: 'food-product-1',
            },
          } as never}
        />,
      );
    });

    await act(async () => {
      renderer.root.findByType('FoodProductFormFields').props.onChange({
        itemName: '   ',
      });
    });

    await act(async () => {
      renderer.root.findByType('FeatureFormScreenScaffold').props.primaryAction.onPress();
      await Promise.resolve();
    });

    expect(mockedTrackObservabilityEvent).toHaveBeenCalledWith(
      'EDIT_FOOD_PRODUCT_SUBMIT_VALIDATION_FAILED',
      expect.objectContaining({
        source: 'EditFoodProductScreen',
        foodProductId: 'food-product-1',
        reason: 'missing_item',
      }),
    );
  });

  it('tracks the renamed edit food product submit lifecycle events', async () => {
    const invalidateQueries = jest.fn().mockResolvedValue(undefined);
    const writeFeature = jest.fn().mockResolvedValue({
      status: 'completed',
      result: {
        id: 'food-product-1',
      },
    });
    mockedUseQueryClient.mockReturnValue({
      invalidateQueries,
      setQueryData: jest.fn(),
    } as unknown as ReturnType<typeof useQueryClient>);
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(writeFeature as ReturnType<typeof useOfflineAwareFeatureWrite>);

    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <EditFoodProductScreen
          navigation={{
            canGoBack: () => true,
            goBack: jest.fn(),
            navigate: jest.fn(),
          } as never}
          route={{
            params: {
              foodProductId: 'food-product-1',
            },
          } as never}
        />,
      );
    });

    await act(async () => {
      await renderer.root.findByType('FeatureFormScreenScaffold').props.primaryAction.onPress();
    });

    expect(mockedTrackObservabilityEvent).toHaveBeenCalledWith(
      'EDIT_FOOD_PRODUCT_SUBMIT_STARTED',
      expect.objectContaining({
        source: 'EditFoodProductScreen',
        foodProductId: 'food-product-1',
      }),
    );
    expect(mockedTrackObservabilityEvent).toHaveBeenCalledWith(
      'EDIT_FOOD_PRODUCT_SUBMIT_SUCCEEDED',
      expect.objectContaining({
        source: 'EditFoodProductScreen',
        foodProductId: 'food-product-1',
        queued: false,
      }),
    );
  });

  it('returns to the food products home feed after editing a converted food product', async () => {
    const navigate = jest.fn();
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <EditFoodProductScreen
          navigation={{
            canGoBack: () => true,
            goBack: jest.fn(),
            navigate,
          } as never}
          route={{
            params: {
              exitToHomeOnClose: true,
              foodProductId: 'food-product-1',
            },
          } as never}
        />,
      );
    });

    await act(async () => {
      renderer.root.findByType('FeatureFormScreenScaffold').props.secondaryAction.onPress();
    });

    expect(navigate).toHaveBeenCalledWith('Home', {
      initialView: {
        feedMode: 'mine',
        filtersExpanded: true,
        searchQuery: '',
        sortFilter: 'created',
        typeFilter: 'food-products',
      },
    });
  });
});
