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
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { EditQuickTrackScreen } from '../screens/EditQuickTrackScreen';

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
  getQuickTrackById: jest.fn(),
  listQuickTrackPhotos: jest.fn(),
  parseLimitExceededError: jest.fn(() => null),
  resolveDefaultVisitVisibilityFromAuth: jest.fn(() => 'friends'),
  updateQuickTrack: jest.fn(),
  useMonthlyUsage: jest.fn(),
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
  QuickTrackFormFields: (
    { photoSection, ...props }: Record<string, unknown> & { photoSection?: React.ReactNode },
  ) => mockReact.createElement('QuickTrackFormFields', props, photoSection),
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

describe('EditQuickTrackScreen', () => {
  beforeEach(() => {
    mockedUseQuery.mockImplementation(({ queryKey }) => {
      if (Array.isArray(queryKey) && queryKey[1] === 'quickTrack') {
        return buildQueryResult({
          data: {
            id: 'quick-track-1',
            restaurantName: 'Quick Track',
            itemCategory: 'packaged_food',
            itemName: 'Iced Coffee',
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
              food_item: 'quick-track-1',
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

  it('preloads the shared quick-track form and current primary photo', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <EditQuickTrackScreen
          navigation={{
            canGoBack: () => true,
            goBack: jest.fn(),
            navigate: jest.fn(),
          } as never}
          route={{
            params: {
              quickTrackId: 'quick-track-1',
            },
          } as never}
        />,
      );
    });

    expect(renderer.root.findByType('QuickTrackFormFields').props.value).toEqual({
      itemName: 'Iced Coffee',
      category: 'packaged_food',
      rating: 4,
      notes: 'Smooth and sweet',
      visibility: 'friends',
      date: '2026-04-12',
    });

    expect(renderer.root.findByType('PhotoInputField').props.attachments).toEqual([
      expect.objectContaining({
        id: 'photo-1',
        name: 'iced-coffee.jpg',
        uri: 'pb://photo-1/iced-coffee.jpg?thumb=100x100',
      }),
    ]);
  });

  it('shows a replacement photo immediately and restores the original when the draft is removed', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <EditQuickTrackScreen
          navigation={{
            canGoBack: () => true,
            goBack: jest.fn(),
            navigate: jest.fn(),
          } as never}
          route={{
            params: {
              quickTrackId: 'quick-track-1',
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
        name: 'replacement.jpg',
        uri: 'file:///replacement.jpg',
      }),
    ]);
    expect(renderer.root.findByType('QuickTrackFormFields').props.detectedDateValue).toBe('2026-04-15');
    expect(renderer.root.findByType('QuickTrackFormFields').props.value.date).toBe('2026-04-15');

    await act(async () => {
      renderer.root.findByType('PhotoInputField').props.attachments[0].onRemove();
    });

    expect(renderer.root.findByType('PhotoInputField').props.attachments).toEqual([
      expect.objectContaining({
        id: 'photo-1',
        name: 'iced-coffee.jpg',
        uri: 'pb://photo-1/iced-coffee.jpg?thumb=100x100',
      }),
    ]);
    expect(renderer.root.findByType('QuickTrackFormFields').props.detectedDateValue).toBeNull();
    expect(renderer.root.findByType('QuickTrackFormFields').props.value.date).toBe('2026-04-12');
  });
});
