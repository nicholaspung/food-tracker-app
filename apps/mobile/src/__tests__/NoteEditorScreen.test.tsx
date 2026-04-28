import * as ImagePicker from 'expo-image-picker';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { createNote, useMonthlyUsage } from '../features';
import { useOfflineAwareFeatureWrite } from '../features/store/useOfflineAwareFeatureWrite';
import { usePhotoPickerPermissions } from '../hooks/usePhotoPickerPermissions';
import { buildLocalPhotoFile } from '../lib/photoFiles';
import { resolvePhotoCaptureDate } from '../lib/photoMetadata';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { NoteEditorScreen } from '../screens/NoteEditorScreen';

const mockReact = React;

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

jest.mock('expo-camera', () => ({
  CameraView: (props: Record<string, unknown>) => mockReact.createElement('CameraView', props),
}));

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
  UIImagePickerPreferredAssetRepresentationMode: {
    Current: 'current',
  },
}));

jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn(),
  useQueryClient: jest.fn(),
}));

jest.mock('../features', () => ({
  buildPocketBaseFileUrl: jest.fn(({ recordId, filename }) => `https://files.example/${recordId}/${filename}`),
  createNote: jest.fn(),
  formatLimitExceededMessage: jest.fn((payload: { message?: string }) => payload.message ?? 'Limit exceeded'),
  getNoteDetail: jest.fn(),
  parseLimitExceededError: jest.fn(() => null),
  updateNote: jest.fn(),
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
  useTheme: () => ({
    colors: {
      background: {
        inverse: 'black',
        overlay: 'rgba(0,0,0,0.4)',
        surface: 'white',
      },
      border: {
        subtle: 'silver',
      },
      text: {
        primary: 'black',
      },
    },
    radii: {
      lg: 12,
      md: 8,
      pill: 999,
    },
    spacing: {
      lg: 24,
      md: 16,
      sm: 12,
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
  EmptyState: (props: Record<string, unknown>) => mockReact.createElement('EmptyState', props),
  ErrorState: (props: Record<string, unknown>) => mockReact.createElement('ErrorState', props),
  FeatureFormScreenScaffold: (
    { children, ...props }: Record<string, unknown> & { children?: React.ReactNode },
  ) => mockReact.createElement('FeatureFormScreenScaffold', props, children),
  PhotoInputField: (props: Record<string, unknown>) => mockReact.createElement('PhotoInputField', props),
  PhotoViewerModal: (props: Record<string, unknown>) => mockReact.createElement('PhotoViewerModal', props),
  Skeleton: (props: Record<string, unknown>) => mockReact.createElement('Skeleton', props),
}));

const mockedUseQuery = useQuery as jest.MockedFunction<typeof useQuery>;
const mockedUseQueryClient = useQueryClient as jest.MockedFunction<typeof useQueryClient>;
const mockedCreateNote = createNote as jest.MockedFunction<typeof createNote>;
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

function buildQueryResult(data: unknown) {
  return {
    data,
    isError: false,
    isLoading: false,
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof useQuery>;
}

function renderNoteEditor(routeParams: Record<string, unknown> = {}): any {
  return create(
    <NoteEditorScreen
      navigation={{
        canGoBack: () => true,
        goBack: jest.fn(),
        navigate: jest.fn(),
      } as never}
      route={{
        params: routeParams,
      } as never}
    />,
  );
}

describe('NoteEditorScreen photo capture dates', () => {
  let writeFeature: jest.Mock;
  const invalidateQueries = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseQueryClient.mockReturnValue({ invalidateQueries } as never);
    mockedUseQuery.mockReturnValue(buildQueryResult(null));
    mockedUseAuth.mockReturnValue({
      actualUser: { id: 'user-1', isAdmin: false },
      user: { id: 'user-1', isSubscriber: true, isAdmin: false },
    } as never);
    mockedUseConnectivity.mockReturnValue({ isOnline: true } as never);
    mockedUseMonthlyUsage.mockReturnValue({
      snapshot: {
        limits: {
          photoUploadsPerRecord: 20,
        },
        remaining: {
          photoUploadsMonthly: null,
        },
        usage: {
          photoUploads: 0,
        },
      },
    } as never);
    mockedUsePhotoPickerPermissions.mockReturnValue({
      permissionNeedsSettings: false,
      requestPermission: jest.fn().mockResolvedValue({ granted: true }),
      resetPermissionNeedsSettings: jest.fn(),
    });
    mockedBuildLocalPhotoFile.mockImplementation((asset: { uri: string; fileName?: string | null; mimeType?: string | null }) => ({
      uri: asset.uri,
      name: asset.fileName ?? 'photo.jpg',
      mimeType: asset.mimeType ?? 'image/jpeg',
    }));
    mockedCreateNote.mockResolvedValue({
      id: 'note-1',
      title: 'Test note',
      content: 'Test note',
      status: 'draft',
      createdAt: '2026-04-28T12:00:00.000Z',
      updatedAt: '2026-04-28T12:00:00.000Z',
    } as never);
    writeFeature = jest.fn(async ({ execute }) => ({
      status: 'completed',
      result: await execute(),
    }));
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(writeFeature as ReturnType<typeof useOfflineAwareFeatureWrite>);
  });

  it('uses EXIF-enabled gallery picking and submits capturedAt for new note photos', async () => {
    mockedResolvePhotoCaptureDate.mockResolvedValue(new Date('2024-09-15T12:34:56.000Z'));
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: 'file:///note-photo.jpg',
          fileName: 'note-photo.jpg',
          mimeType: 'image/jpeg',
        },
      ],
    });

    let renderer!: ReturnType<typeof renderNoteEditor>;
    await act(async () => {
      renderer = renderNoteEditor();
    });

    await act(async () => {
      renderer.root.findByProps({ testID: 'note-content-input' }).props.onChangeText('Test note');
    });
    await act(async () => {
      await renderer.root.findByType('PhotoInputField').props.onGalleryPress();
    });

    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        exif: true,
        preferredAssetRepresentationMode: 'current',
      }),
    );
    expect(renderer.root.findByType('PhotoInputField').props.attachments[0].label).toBe('Sep 15, 2024');

    await act(async () => {
      renderer.root.findByType('FeatureFormScreenScaffold').props.primaryAction.onPress();
    });

    expect(writeFeature.mock.calls[0][0].offline.payload.photos[0]).toMatchObject({
      capturedAt: '2024-09-15T12:34:56.000Z',
    });
    expect(mockedCreateNote).toHaveBeenCalledWith(
      expect.objectContaining({
        photos: [
          expect.objectContaining({
            capturedAt: '2024-09-15T12:34:56.000Z',
          }),
        ],
      }),
    );
  });

  it('labels existing note photos with capturedAt before falling back to created', async () => {
    mockedUseQuery.mockReturnValue(buildQueryResult({
      note: {
        id: 'note-1',
        title: 'Existing note',
        content: 'Existing note',
        status: 'draft',
        createdAt: '2026-04-28T12:00:00.000Z',
        updatedAt: '2026-04-28T12:00:00.000Z',
      },
      photos: [
        {
          id: 'photo-1',
          note: 'note-1',
          photo: 'photo-1.jpg',
          created: '2026-04-28T12:00:00.000Z',
          capturedAt: '2024-09-15T12:34:56.000Z',
        },
        {
          id: 'photo-2',
          note: 'note-1',
          photo: 'photo-2.jpg',
          created: '2026-04-27T12:00:00.000Z',
        },
      ],
    }));

    let renderer!: ReturnType<typeof renderNoteEditor>;
    await act(async () => {
      renderer = renderNoteEditor({ noteId: 'note-1' });
    });

    expect(renderer.root.findByType('PhotoInputField').props.attachments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Sep 15, 2024' }),
        expect.objectContaining({ label: 'Apr 27, 2026' }),
      ]),
    );
  });
});
