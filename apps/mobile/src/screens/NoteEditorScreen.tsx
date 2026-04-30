import { Ionicons } from '@expo/vector-icons';
import { CameraView } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Modal, Platform, Pressable, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  EmptyState,
  ErrorState,
  FeatureFormScreenScaffold,
  PhotoInputField,
  type PhotoInputFieldAttachment,
  PhotoViewerModal,
  Skeleton,
} from '../components/shared';
import {
  createNote,
  formatLimitExceededMessage,
  getNoteDetail,
  parseLimitExceededError,
  updateNote,
  useMonthlyUsage,
  type NotePhotoUploadInput,
} from '../features';
import { buildPhotoFileUrl, buildPhotoThumbnailUrl } from '../lib/photoUrls';
import { useOfflineAwareFeatureWrite } from '../features/store/useOfflineAwareFeatureWrite';
import { notesQueryKeys } from '../features/store/notesQuery';
import { usePhotoPickerPermissions } from '../hooks/usePhotoPickerPermissions';
import { formatPhotoAttachmentDateLabel } from '../lib/dateFormatting';
import { showQueuedOfflineAlert } from '../lib/offlineAlerts';
import { buildLocalPhotoFile } from '../lib/photoFiles';
import { resolvePhotoCaptureDate } from '../lib/photoMetadata';
import { resolvePhotoUploadQuotaUi } from '../lib/usageUiRules';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { createThemedStyles, useTheme } from '../theme';
import { Button, Card, Input, Text } from '../ui';

type NoteEditorScreenProps = NativeStackScreenProps<RootStackParamList, 'NoteEditor'>;
type NoteEditorExitMethod =
  | 'header_back'
  | 'secondary_cancel'
  | 'system_back_or_gesture'
  | 'programmatic_navigation';

interface DraftNotePhoto {
  id: string;
  uri: string;
  name: string;
  mimeType: string;
  label: string;
  capturedAt?: string;
}

interface NotePhotoAttachment {
  id: string;
  label: string;
  thumbnailUri: string;
  viewerUri: string;
  kind: 'existing' | 'new';
}

type NoteDraftPhotoAsset = {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
} & Partial<ImagePicker.ImagePickerAsset>;

const CONTENT_MAX_LENGTH = 2000;
const FREE_MONTHLY_PHOTO_LIMIT = 5;
const LOCATION_MAX_LENGTH = 200;
const MAX_NOTE_PHOTOS = 20;

function formatPhotoPerNoteLimitMessage(limit: number): string {
  return `You can add up to ${limit} photo${limit === 1 ? '' : 's'} per note.`;
}

const useStyles = createThemedStyles((theme) => ({
  body: {
    gap: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
  },
  sectionCard: {
    gap: theme.spacing.sm,
  },
  contentInput: {
    minHeight: 110,
    textAlignVertical: 'top',
  },
  charCount: {
    alignSelf: 'flex-end',
  },
  modalBackdrop: {
    alignItems: 'center',
    backgroundColor: theme.colors.background.overlay,
    flex: 1,
    justifyContent: 'center',
    padding: theme.spacing.md,
  },
  modalCard: {
    backgroundColor: theme.colors.background.surface,
    borderColor: theme.colors.border.subtle,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    gap: theme.spacing.sm,
    maxWidth: 480,
    padding: theme.spacing.md,
    width: '100%',
  },
  modalHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modalClose: {
    alignItems: 'center',
    borderRadius: theme.radii.pill,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  cameraFrame: {
    backgroundColor: theme.colors.background.inverse,
    borderRadius: theme.radii.md,
    height: 340,
    overflow: 'hidden',
  },
  camera: {
    flex: 1,
  },
  modalActions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  modalAction: {
    flex: 1,
  },
}));

export function NoteEditorScreen({ navigation, route }: NoteEditorScreenProps) {
  const theme = useTheme();
  const styles = useStyles();
  const noteId = route.params?.noteId;
  const isEditing = Boolean(noteId);
  const writeFeature = useOfflineAwareFeatureWrite();
  const { isOnline } = useConnectivity();
  const { actualUser, user } = useAuth();
  const queryClient = useQueryClient();
  const cameraRef = useRef<CameraView | null>(null);
  const isActualAdmin = actualUser?.isAdmin === true;
  const isDisplayAdminUser = user?.isAdmin === true;
  const isDisplaySubscriberUser = user?.isSubscriber === true;
  const isDisplayFreeUser = !isDisplayAdminUser && !isDisplaySubscriberUser;
  const usagePreviewTier = isActualAdmin && !isDisplayAdminUser
    ? (isDisplaySubscriberUser ? 'subscriber' : 'free')
    : null;
  const monthlyUsage = useMonthlyUsage({
    viewAsTier: usagePreviewTier,
  });
  const shouldEnforceUsageLimitsClientSide = !isActualAdmin;
  const {
    permissionNeedsSettings: photoPermissionNeedsSettings,
    requestPermission: requestPhotoPickerPermission,
    resetPermissionNeedsSettings: resetPhotoPermissionNeedsSettings,
  } = usePhotoPickerPermissions({
    cameraBlockedMessage: 'Camera permission is blocked. Enable it in device settings.',
    cameraRequiredMessage: 'Camera permission is required to add photos.',
    galleryBlockedMessage: 'Photo library permission is blocked. Enable it in device settings.',
    galleryRequiredMessage: 'Photo library permission is required to select photos.',
  });

  const noteDetailQuery = useQuery({
    queryKey: notesQueryKeys.detail(noteId ?? ''),
    queryFn: ({ signal }) => (noteId ? getNoteDetail(noteId, { signal }) : Promise.resolve(null)),
    enabled: Boolean(noteId),
  });

  const [content, setContent] = useState('');
  const [locationText, setLocationText] = useState('');
  const [photosToDelete, setPhotosToDelete] = useState<string[]>([]);
  const [newPhotos, setNewPhotos] = useState<DraftNotePhoto[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isPhotoViewerVisible, setIsPhotoViewerVisible] = useState(false);
  const [photoViewerInitialIndex, setPhotoViewerInitialIndex] = useState(0);
  const hasTrackedEditorOpenRef = useRef(false);
  const hasTrackedEditorExitRef = useRef(false);
  const hasCompletedEditorFlowRef = useRef(false);
  const exitMethodRef = useRef<NoteEditorExitMethod | null>(null);

  const existingPhotos = useMemo(() => {
    const deletedIds = new Set(photosToDelete);
    return (noteDetailQuery.data?.photos ?? []).filter((photo) => !deletedIds.has(photo.id));
  }, [noteDetailQuery.data?.photos, photosToDelete]);

  const perNotePhotoLimit =
    typeof monthlyUsage.snapshot?.limits.photoUploadsPerRecord === 'number'
      ? Math.min(MAX_NOTE_PHOTOS, monthlyUsage.snapshot.limits.photoUploadsPerRecord)
      : isDisplayFreeUser
        ? 1
        : MAX_NOTE_PHOTOS;
  const totalPhotoCount = existingPhotos.length + newPhotos.length;
  const estimatedUsedWithDraftUploads =
    shouldEnforceUsageLimitsClientSide && isDisplayFreeUser && monthlyUsage.snapshot
      ? monthlyUsage.snapshot.usage.photoUploads + newPhotos.length
      : null;
  const remainingEstimatedMonthlySlots =
    typeof estimatedUsedWithDraftUploads === 'number'
      ? Math.max(FREE_MONTHLY_PHOTO_LIMIT - estimatedUsedWithDraftUploads, 0)
      : null;
  const photoQuotaUi = useMemo(
    () =>
      resolvePhotoUploadQuotaUi({
        perRecordLimit: perNotePhotoLimit,
        usedInRecord: totalPhotoCount,
        remainingMonthlyEstimate: remainingEstimatedMonthlySlots,
      }),
    [perNotePhotoLimit, remainingEstimatedMonthlySlots, totalPhotoCount],
  );
  const librarySelectionLimit = Math.max(photoQuotaUi.maxSelectableNow, 1);
  const photoAttachments = useMemo<NotePhotoAttachment[]>(
    () => [
      ...existingPhotos.map((photo) => ({
        id: photo.id,
        kind: 'existing' as const,
        label: formatPhotoAttachmentDateLabel(photo.capturedAt ?? photo.created),
        thumbnailUri: buildPhotoThumbnailUrl(photo, { collectionName: 'note_photos' }),
        viewerUri: buildPhotoFileUrl(photo, { collectionName: 'note_photos' }),
      })),
      ...newPhotos.map((photo) => ({
        id: photo.id,
        kind: 'new' as const,
        label: photo.label,
        thumbnailUri: photo.uri,
        viewerUri: photo.uri,
      })),
    ],
    [existingPhotos, newPhotos],
  );
  const photoViewerUrls = useMemo(
    () => photoAttachments.map((photo) => photo.viewerUri),
    [photoAttachments],
  );
  const photoViewerPreviewUrls = useMemo(
    () => photoAttachments.map((photo) => photo.thumbnailUri),
    [photoAttachments],
  );
  const hasUnsavedChanges = useMemo(() => {
    if (isEditing && noteDetailQuery.data?.note) {
      return (
        content.trim() !== noteDetailQuery.data.note.content.trim() ||
        locationText.trim() !== (noteDetailQuery.data.note.locationText ?? '').trim() ||
        photosToDelete.length > 0 ||
        newPhotos.length > 0
      );
    }

    return Boolean(content.trim()) || Boolean(locationText.trim()) || newPhotos.length > 0;
  }, [content, isEditing, locationText, newPhotos.length, noteDetailQuery.data?.note, photosToDelete.length]);
  const buildEditorAnalyticsPayload = useCallback(
    (overrides?: Record<string, string | number | boolean | null>) => ({
      source: 'NoteEditorScreen',
      mode: isEditing ? 'edit' : 'create',
      hasText: Boolean(content.trim()),
      photoCount: existingPhotos.length + newPhotos.length,
      hasRestaurantSelection: false,
      hasUnsavedChanges,
      ...overrides,
    }),
    [content, existingPhotos.length, hasUnsavedChanges, isEditing, newPhotos.length],
  );

  useEffect(() => {
    if (!noteDetailQuery.data?.note) {
      return;
    }

    setContent(noteDetailQuery.data.note.content);
    setLocationText(noteDetailQuery.data.note.locationText ?? '');
    setPhotosToDelete([]);
    setNewPhotos([]);
    setErrorMessage(null);
  }, [noteDetailQuery.data?.note]);

  useEffect(() => {
    if (hasTrackedEditorOpenRef.current) {
      return;
    }

    hasTrackedEditorOpenRef.current = true;
    trackObservabilityEvent('NOTE_EDITOR_OPENED', buildEditorAnalyticsPayload());
  }, [buildEditorAnalyticsPayload]);

  useEffect(
    () => () => {
      if (
        hasCompletedEditorFlowRef.current ||
        hasTrackedEditorExitRef.current ||
        !hasTrackedEditorOpenRef.current
      ) {
        return;
      }

      hasTrackedEditorExitRef.current = true;
      trackObservabilityEvent(
        'NOTE_EDITOR_EXITED',
        buildEditorAnalyticsPayload({
          exitMethod: exitMethodRef.current ?? 'system_back_or_gesture',
        }),
      );
    },
    [buildEditorAnalyticsPayload],
  );

  const closeEditor = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    navigation.navigate('Notes');
  }, [navigation]);

  const handleRemoveExistingPhoto = useCallback((photoId: string) => {
    setPhotosToDelete((current) => (current.includes(photoId) ? current : [...current, photoId]));
  }, []);

  const handleRemoveNewPhoto = useCallback((photoId: string) => {
    setNewPhotos((current) => current.filter((photo) => photo.id !== photoId));
  }, []);

  const openPhotoViewer = useCallback((initialIndex: number) => {
    if (photoAttachments.length === 0) {
      return;
    }

    const boundedIndex = Math.max(0, Math.min(initialIndex, photoAttachments.length - 1));
    setPhotoViewerInitialIndex(boundedIndex);
    setIsPhotoViewerVisible(true);
  }, [photoAttachments]);

  const closePhotoViewer = useCallback(() => {
    setIsPhotoViewerVisible(false);
  }, []);

  const photoInputAttachments = useMemo<PhotoInputFieldAttachment[]>(
    () =>
      photoAttachments.map((photo, index) => ({
        id: `${photo.kind}-${photo.id}`,
        label: photo.label,
        uri: photo.thumbnailUri,
        accessibilityLabel: `View attached photo ${index + 1} full screen`,
        onPress: () => {
          openPhotoViewer(index);
        },
        onRemove: () => {
          closePhotoViewer();
          if (photo.kind === 'existing') {
            handleRemoveExistingPhoto(photo.id);
            return;
          }

          handleRemoveNewPhoto(photo.id);
        },
      })),
    [closePhotoViewer, handleRemoveExistingPhoto, handleRemoveNewPhoto, openPhotoViewer, photoAttachments],
  );

  const ensureCanAddPhoto = useCallback(() => {
    if (!photoQuotaUi.hasQuota && photoQuotaUi.remainingPerRecord <= 0) {
      trackObservabilityEvent('USAGE_LIMIT_REACHED', {
        enforcement: 'client_estimate',
        limit: perNotePhotoLimit,
        metric: 'photo_uploads_per_record',
        remaining: photoQuotaUi.remainingPerRecord,
        source: 'NoteEditorScreen',
        used: totalPhotoCount,
      });
      setErrorMessage(formatPhotoPerNoteLimitMessage(perNotePhotoLimit));
      return false;
    }

    if (
      !photoQuotaUi.hasQuota &&
      typeof remainingEstimatedMonthlySlots === 'number' &&
      remainingEstimatedMonthlySlots <= 0 &&
      typeof estimatedUsedWithDraftUploads === 'number'
    ) {
      trackObservabilityEvent('USAGE_LIMIT_REACHED', {
        enforcement: 'client_estimate',
        limit: FREE_MONTHLY_PHOTO_LIMIT,
        metric: 'photo_uploads',
        remaining: remainingEstimatedMonthlySlots,
        source: 'NoteEditorScreen',
        used: estimatedUsedWithDraftUploads,
      });
      setErrorMessage(
        `Free users can upload up to ${FREE_MONTHLY_PHOTO_LIMIT} photos per month. Remaining estimate: ${remainingEstimatedMonthlySlots}.`,
      );
      return false;
    }

    return true;
  }, [
    estimatedUsedWithDraftUploads,
    perNotePhotoLimit,
    photoQuotaUi.hasQuota,
    photoQuotaUi.remainingPerRecord,
    remainingEstimatedMonthlySlots,
    totalPhotoCount,
  ]);

  const addDraftPhotos = useCallback(async (
    assets: NoteDraftPhotoAsset[],
    options: { captureDate?: Date | null } = {},
  ) => {
    const batchId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const nextPhotos: DraftNotePhoto[] = [];

    for (const [index, asset] of assets.entries()) {
      const nextPhoto = buildLocalPhotoFile(asset, {
        fallbackPrefix: 'note-photo',
      });
      if (!nextPhoto) {
        continue;
      }

      const captureDate =
        options.captureDate !== undefined
          ? options.captureDate
          : await resolvePhotoCaptureDate(asset as ImagePicker.ImagePickerAsset);

      nextPhotos.push({
        id: `draft_photo_${batchId}_${index}`,
        label: formatPhotoAttachmentDateLabel(captureDate ?? new Date()),
        capturedAt: captureDate?.toISOString(),
        ...nextPhoto,
      });
    }

    if (nextPhotos.length === 0) {
      setErrorMessage('Could not read selected photo.');
      return;
    }

    setNewPhotos((current) => [...current, ...nextPhotos]);
    setErrorMessage(nextPhotos.length === assets.length ? null : 'Some selected photos could not be read.');
    resetPhotoPermissionNeedsSettings();
  }, [resetPhotoPermissionNeedsSettings]);

  const handleOpenCamera = useCallback(async () => {
    trackObservabilityEvent('NOTE_CAMERA_OPEN_STARTED', {
      source: 'NoteEditorScreen',
    });

    if (!ensureCanAddPhoto()) {
      return;
    }

    resetPhotoPermissionNeedsSettings();
    const permission = await requestPhotoPickerPermission('camera');
    if (!permission.granted) {
      trackObservabilityEvent('NOTE_CAMERA_PERMISSION_DENIED', {
        canAskAgain: permission.canAskAgain,
        source: 'NoteEditorScreen',
      });
      setErrorMessage(permission.message);
      return;
    }

    trackObservabilityEvent('NOTE_CAMERA_OPENED', {
      source: 'NoteEditorScreen',
    });
    setIsCameraOpen(true);
  }, [ensureCanAddPhoto, requestPhotoPickerPermission, resetPhotoPermissionNeedsSettings]);

  const handlePickFromPhotoLibrary = useCallback(async () => {
    trackObservabilityEvent('NOTE_LIBRARY_PICK_STARTED', {
      photoCount: 0,
      selectionLimit: librarySelectionLimit,
      source: 'NoteEditorScreen',
    });

    if (!ensureCanAddPhoto()) {
      return;
    }

    try {
      resetPhotoPermissionNeedsSettings();
      const permission = await requestPhotoPickerPermission('gallery');
      if (!permission.granted) {
        trackObservabilityEvent('NOTE_LIBRARY_PERMISSION_DENIED', {
          canAskAgain: permission.canAskAgain,
          source: 'NoteEditorScreen',
        });
        setErrorMessage(permission.message);
        return;
      }

      const pickerResult = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: false,
        quality: 0.8,
        allowsMultipleSelection: librarySelectionLimit > 1,
        selectionLimit: librarySelectionLimit,
        mediaTypes: ['images'],
        exif: true,
        preferredAssetRepresentationMode:
          Platform.OS === 'ios'
            ? ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current
            : undefined,
      });

      if (pickerResult.canceled) {
        trackObservabilityEvent('NOTE_LIBRARY_PICK_CANCELED', {
          source: 'NoteEditorScreen',
        });
        return;
      }

      const selectedAssets = pickerResult.assets ?? [];
      if (selectedAssets.length === 0) {
        setErrorMessage('Could not read selected photo.');
        return;
      }

      await addDraftPhotos(selectedAssets);
      trackObservabilityEvent('NOTE_LIBRARY_PICKED', {
        photoCount: selectedAssets.length,
        selectionLimit: librarySelectionLimit,
        source: 'NoteEditorScreen',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not choose a photo from your library.';
      trackObservabilityEvent('NOTE_LIBRARY_PICK_FAILED', {
        errorMessage: message,
        errorType: error instanceof Error ? error.name : 'unknown_error',
        source: 'NoteEditorScreen',
      });
      setErrorMessage(message);
    }
  }, [
    addDraftPhotos,
    ensureCanAddPhoto,
    librarySelectionLimit,
    requestPhotoPickerPermission,
    resetPhotoPermissionNeedsSettings,
  ]);

  const handleCapturePhoto = useCallback(async () => {
    if (!cameraRef.current) {
      return;
    }

    try {
      const captured = await cameraRef.current.takePictureAsync({ quality: 0.8 });
      if (!captured.uri) {
        throw new Error('Could not capture photo.');
      }

      await addDraftPhotos([{ uri: captured.uri }], { captureDate: new Date() });
      setIsCameraOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not capture photo.';
      setErrorMessage(message);
    }
  }, [addDraftPhotos]);

  const handleSave = useCallback(async () => {
    const mode = isEditing ? 'edit' : 'create';
    const hasLocation = locationText.trim().length > 0;

    if (!content.trim()) {
      trackObservabilityEvent('NOTE_SUBMIT_VALIDATION_FAILED', {
        source: 'NoteEditorScreen',
        mode,
        reason: 'missing_content',
        isOnline,
      });
      setErrorMessage('Please describe what you want to remember.');
      return;
    }

    const uploadPhotos: NotePhotoUploadInput[] = newPhotos.map((photo) => ({
      uri: photo.uri,
      name: photo.name,
      mimeType: photo.mimeType,
      capturedAt: photo.capturedAt,
    }));
    const noteCreateInput = {
      title: '',
      content,
      locationText,
      photos: uploadPhotos,
    };
    const noteUpdateInput = {
      content,
      locationText,
      newPhotos: uploadPhotos,
      deletePhotoIds: photosToDelete,
    };

    if (totalPhotoCount > perNotePhotoLimit) {
      trackObservabilityEvent('NOTE_SUBMIT_VALIDATION_FAILED', {
        source: 'NoteEditorScreen',
        mode,
        reason: 'photo_limit_exceeded',
        perNotePhotoLimit,
        totalPhotoCount,
      });
      setErrorMessage(formatPhotoPerNoteLimitMessage(perNotePhotoLimit));
      return;
    }

    if (shouldEnforceUsageLimitsClientSide && isDisplayFreeUser && uploadPhotos.length > 0 && monthlyUsage.snapshot) {
      const estimatedTotalAfterSubmit = monthlyUsage.snapshot.usage.photoUploads + uploadPhotos.length;
      if (estimatedTotalAfterSubmit > FREE_MONTHLY_PHOTO_LIMIT) {
        const remaining = Math.max(
          FREE_MONTHLY_PHOTO_LIMIT - monthlyUsage.snapshot.usage.photoUploads,
          0,
        );
        trackObservabilityEvent('USAGE_LIMIT_REACHED', {
          enforcement: 'client_estimate',
          limit: FREE_MONTHLY_PHOTO_LIMIT,
          metric: 'photo_uploads',
          remaining,
          source: 'NoteEditorScreen',
          used: monthlyUsage.snapshot.usage.photoUploads,
        });
        setErrorMessage(
          `Free users can upload up to ${FREE_MONTHLY_PHOTO_LIMIT} photos per month. Remaining estimate: ${remaining}.`,
        );
        return;
      }
    }

    setErrorMessage(null);
    trackObservabilityEvent('NOTE_SUBMIT_STARTED', {
      source: 'NoteEditorScreen',
      mode,
      isOnline,
      hasLocation,
      newPhotoCount: uploadPhotos.length,
      deletePhotoCount: photosToDelete.length,
      totalPhotoCount,
    });
    setIsSubmitting(true);

    try {
      const saveResult = isEditing && noteId
        ? await writeFeature({
            operationName: 'note.update',
            offline: {
              strategy: 'outbox',
              payload: {
                noteId,
                updates: noteUpdateInput,
              },
            },
            execute: () => updateNote(noteId, noteUpdateInput),
          })
        : await writeFeature({
            operationName: 'note.create',
            offline: {
              strategy: 'outbox',
              payload: noteCreateInput,
            },
            execute: () => createNote(noteCreateInput),
          });

      if (saveResult.status === 'queued') {
        await queryClient.invalidateQueries({ queryKey: ['feature', 'notes'] });
        trackObservabilityEvent('NOTE_SUBMIT_SUCCEEDED', {
          source: 'NoteEditorScreen',
          mode,
          queued: true,
          hasLocation,
          newPhotoCount: uploadPhotos.length,
          totalPhotoCount,
        });
        hasCompletedEditorFlowRef.current = true;
        showQueuedOfflineAlert({
          analyticsSource: 'NoteEditorScreen',
          subject: 'Note',
        });
        navigation.navigate('Notes');
        return;
      }

      const invalidations: Promise<unknown>[] = [
        queryClient.invalidateQueries({ queryKey: ['feature', 'notes'] }),
        queryClient.invalidateQueries({ queryKey: ['feature', 'notePhotos'] }),
        ...(noteId ? [queryClient.invalidateQueries({ queryKey: ['feature', 'notePhotos', noteId] })] : []),
      ];

      if (uploadPhotos.length > 0) {
        invalidations.push(
          queryClient.invalidateQueries({ queryKey: ['feature', 'usage', 'monthly'] }),
        );
      }

      await Promise.all(invalidations);
      trackObservabilityEvent('NOTE_SUBMIT_SUCCEEDED', {
        source: 'NoteEditorScreen',
        mode,
        queued: false,
        hasLocation,
        newPhotoCount: uploadPhotos.length,
        totalPhotoCount,
      });

      hasCompletedEditorFlowRef.current = true;
      navigation.navigate('Notes');
    } catch (error) {
      const limitPayload = parseLimitExceededError(error);
      if (limitPayload) {
        trackObservabilityEvent('USAGE_LIMIT_REACHED', {
          enforcement: 'server',
          limit: limitPayload.limit,
          metric: limitPayload.metric,
          monthKey: limitPayload.monthKey,
          remaining: limitPayload.remaining,
          source: 'NoteEditorScreen',
          used: limitPayload.used,
          userTier: limitPayload.userTier ?? null,
        });
      }
      const message = limitPayload
        ? formatLimitExceededMessage(limitPayload)
        : error instanceof Error
          ? error.message
          : 'Could not save note.';
      trackObservabilityEvent('NOTE_SUBMIT_FAILED', {
        source: 'NoteEditorScreen',
        mode,
        errorMessage: message,
        errorType: error instanceof Error ? error.name : 'unknown_error',
        hasLocation,
        isOnline,
        newPhotoCount: uploadPhotos.length,
        deletePhotoCount: photosToDelete.length,
        totalPhotoCount,
      });
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    content,
    isDisplayFreeUser,
    isEditing,
    isOnline,
    monthlyUsage.snapshot,
    locationText,
    navigation,
    newPhotos,
    noteId,
    perNotePhotoLimit,
    photosToDelete,
    queryClient,
    writeFeature,
    shouldEnforceUsageLimitsClientSide,
    totalPhotoCount,
  ]);

  if (isEditing && noteDetailQuery.isLoading) {
    return (
      <FeatureFormScreenScaffold
        onBackPress={() => {
          exitMethodRef.current = 'header_back';
          closeEditor();
        }}
        primaryAction={{
          label: 'Save Changes',
          onPress: () => undefined,
          disabled: true,
        }}
        secondaryAction={{
          label: 'Cancel',
          onPress: () => {
            exitMethodRef.current = 'secondary_cancel';
            closeEditor();
          },
          disabled: true,
        }}
        subtitle="Update your saved note details."
        title="Edit Note"
      >
        <Skeleton height={84} />
        <Skeleton height={180} />
        <Skeleton height={180} />
      </FeatureFormScreenScaffold>
    );
  }

  if (isEditing && noteDetailQuery.isError) {
    return (
      <FeatureFormScreenScaffold
        onBackPress={() => {
          exitMethodRef.current = 'header_back';
          closeEditor();
        }}
        primaryAction={{
          label: 'Retry',
          onPress: () => {
            void noteDetailQuery.refetch();
          },
        }}
        secondaryAction={{
          label: 'Cancel',
          onPress: () => {
            exitMethodRef.current = 'secondary_cancel';
            closeEditor();
          },
          variant: 'secondary',
        }}
        subtitle="Could not load this note."
        title="Edit Note"
      >
        <ErrorState
          analyticsProps={buildEditorAnalyticsPayload()}
          analyticsSource="NoteEditorScreen"
          description="Could not load note."
          onRetry={() => {
            void noteDetailQuery.refetch();
          }}
          title="Note unavailable"
        />
      </FeatureFormScreenScaffold>
    );
  }

  if (isEditing && !noteDetailQuery.data?.note) {
    return (
      <FeatureFormScreenScaffold
        onBackPress={() => {
          exitMethodRef.current = 'header_back';
          closeEditor();
        }}
        primaryAction={{
          label: 'Back to Notes',
          onPress: () => {
            exitMethodRef.current = 'programmatic_navigation';
            navigation.navigate('Notes');
          },
        }}
        secondaryAction={{
          label: 'Cancel',
          onPress: () => {
            exitMethodRef.current = 'secondary_cancel';
            closeEditor();
          },
          variant: 'secondary',
        }}
        subtitle="This note no longer exists."
        title="Edit Note"
      >
        <EmptyState
          actionLabel="Back to Notes"
          analyticsProps={buildEditorAnalyticsPayload()}
          analyticsSource="NoteEditorScreen"
          onAction={() => {
            exitMethodRef.current = 'programmatic_navigation';
            navigation.navigate('Notes');
          }}
          title="Note not found"
        />
      </FeatureFormScreenScaffold>
    );
  }

  return (
    <>
      <FeatureFormScreenScaffold
        bodyStyle={styles.body}
        keyboardAware
        onBackPress={() => {
          exitMethodRef.current = 'header_back';
          closeEditor();
        }}
        primaryAction={{
          label: isEditing ? 'Save Changes' : 'Save Note',
          loading: isSubmitting,
          onPress: () => {
            void handleSave();
          },
          disabled: isSubmitting || !content.trim(),
        }}
        secondaryAction={{
          label: 'Cancel',
          onPress: () => {
            exitMethodRef.current = 'secondary_cancel';
            closeEditor();
          },
          disabled: isSubmitting,
          variant: 'secondary',
        }}
        subtitle={isEditing ? 'Update your saved note details.' : 'Capture details you can turn into a track later.'}
        title={isEditing ? 'Edit Note' : 'Log Note'}
        testID="note-editor-screen"
      >
        <Card tone="info">
          <Text tone="secondary" variant="bodyMd">
            <Text variant="label">Tip:</Text> Keep each note focused on one visit or food product so it is easy to
            reuse later.
          </Text>
        </Card>

        {!isOnline && isDisplayFreeUser ? (
          <Card style={styles.sectionCard} tone="muted">
            <Text tone="warning">
              Offline estimate may be stale. Backend limits are enforced when sync runs.
            </Text>
          </Card>
        ) : null}

        {isEditing && noteDetailQuery.data?.note.status === 'used' ? (
          <Card tone="success">
            <Text tone="success">
              This note has already been used to track an item. You can still update it for reference.
            </Text>
          </Card>
        ) : null}

        <Card style={styles.sectionCard}>
          <Text variant="label">What are you eating? *</Text>
          <Input
            containerStyle={styles.sectionCard}
            inputStyle={styles.contentInput}
            maxLength={CONTENT_MAX_LENGTH}
            multiline
            onChangeText={setContent}
            placeholder="Describe your food, place, or anything you want to remember..."
            testID="note-content-input"
            value={content}
          />
          <Text style={styles.charCount} tone="muted" variant="bodySm">
            {content.length}/{CONTENT_MAX_LENGTH}
          </Text>
        </Card>

        <Card style={styles.sectionCard}>
          <Input
            autoCapitalize="words"
            label="Location (Optional)"
            maxLength={LOCATION_MAX_LENGTH}
            onChangeText={setLocationText}
            placeholder="City, neighborhood, or place name"
            value={locationText}
          />
        </Card>

        <Card style={styles.sectionCard}>
          <PhotoInputField
            attachments={photoInputAttachments}
            cameraSubtitle="Camera"
            cameraTitle="Take Photo"
            countLabel={`${totalPhotoCount}/${perNotePhotoLimit}`}
            disabled={isSubmitting}
            footerAction={
              photoPermissionNeedsSettings ? (
                <Button
                  label="Open Settings"
                  onPress={() => {
                    void Linking.openSettings();
                  }}
                  variant="secondary"
                />
              ) : null
            }
            gallerySubtitle="Photo Library"
            galleryTitle="Upload Image"
            iconColor={theme.colors.text.primary}
            iconName="camera-outline"
            label="Photos (Optional)"
            onCameraPress={() => {
              void handleOpenCamera();
            }}
            onGalleryPress={() => {
              void handlePickFromPhotoLibrary();
            }}
          />
        </Card>

        {errorMessage ? (
          <ErrorState
            analyticsProps={buildEditorAnalyticsPayload()}
            analyticsSource="NoteEditorScreen"
            description={errorMessage}
            title="Could not save note"
          />
        ) : null}
      </FeatureFormScreenScaffold>

      <PhotoViewerModal
        initialIndex={photoViewerInitialIndex}
        onRequestClose={closePhotoViewer}
        previewUrls={photoViewerPreviewUrls}
        urls={photoViewerUrls}
        visible={isPhotoViewerVisible}
      />

      <Modal animationType="fade" onRequestClose={() => setIsCameraOpen(false)} transparent visible={isCameraOpen}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text variant="titleMd">Add Photo</Text>
              <Pressable
                accessibilityLabel="Close camera"
                onPress={() => {
                  setIsCameraOpen(false);
                }}
                style={styles.modalClose}
              >
                <Ionicons color={theme.colors.text.primary} name="close" size={20} />
              </Pressable>
            </View>

            <View style={styles.cameraFrame}>
              <CameraView
                facing="back"
                onMountError={() => {
                  setErrorMessage('Camera could not be started.');
                  setIsCameraOpen(false);
                }}
                ref={cameraRef}
                style={styles.camera}
              />
            </View>

            <View style={styles.modalActions}>
              <Button
                label="Cancel"
                onPress={() => {
                  setIsCameraOpen(false);
                }}
                style={styles.modalAction}
                variant="secondary"
              />
              <Button
                label="Capture"
                onPress={() => {
                  void handleCapturePhoto();
                }}
                style={styles.modalAction}
              />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
