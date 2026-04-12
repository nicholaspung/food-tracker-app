import { Ionicons } from '@expo/vector-icons';
import { CameraView } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Linking, Modal, Pressable, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { EmptyState, ErrorState, FeatureFormScreenScaffold, Skeleton } from '../components/shared';
import {
  buildPocketBaseFileUrl,
  createNote,
  formatLimitExceededMessage,
  getNoteDetail,
  parseLimitExceededError,
  updateNote,
  useMonthlyUsage,
  type NotePhotoUploadInput,
} from '../features';
import { useOfflineAwareFeatureWrite } from '../features/store/useOfflineAwareFeatureWrite';
import { notesQueryKeys } from '../features/store/notesQuery';
import { usePhotoPickerPermissions } from '../hooks/usePhotoPickerPermissions';
import { showQueuedOfflineAlert } from '../lib/offlineAlerts';
import { buildLocalPhotoFile } from '../lib/photoFiles';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { createThemedStyles, useTheme } from '../theme';
import { Button, Card, Input, Text } from '../ui';

type NoteEditorScreenProps = NativeStackScreenProps<RootStackParamList, 'NoteEditor'>;

interface DraftNotePhoto {
  id: string;
  uri: string;
  name: string;
  mimeType: string;
}

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
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  sectionLabel: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  photoPreviewWrap: {
    borderRadius: theme.radii.md,
    height: 72,
    overflow: 'hidden',
    position: 'relative',
    width: 72,
  },
  photoPreview: {
    backgroundColor: theme.colors.background.muted,
    height: '100%',
    width: '100%',
  },
  removePhotoButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.background.overlay,
    borderRadius: theme.radii.pill,
    height: 20,
    justifyContent: 'center',
    position: 'absolute',
    right: 4,
    top: 4,
    width: 20,
  },
  photoSourceBadge: {
    backgroundColor: theme.colors.background.inverse,
    borderRadius: theme.radii.sm,
    bottom: 4,
    left: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    position: 'absolute',
  },
  addPhotoButton: {
    alignItems: 'center',
    borderColor: theme.colors.border.default,
    borderRadius: theme.radii.md,
    borderStyle: 'dashed',
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.xs,
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: theme.spacing.md,
  },
  addPhotoButtonDisabled: {
    opacity: 0.6,
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
  modalActionStack: {
    marginTop: theme.spacing.xs,
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
  const estimatedFreePhotoRemaining = isDisplayFreeUser
    ? monthlyUsage.snapshot?.remaining.photoUploadsMonthly ?? null
    : null;
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
    queryKey: noteId ? notesQueryKeys.detail(noteId) : ['feature', 'notes', 'detail', ''],
    queryFn: ({ signal }) => (noteId ? getNoteDetail(noteId, { signal }) : Promise.resolve(null)),
    enabled: Boolean(noteId),
  });

  const [content, setContent] = useState('');
  const [locationText, setLocationText] = useState('');
  const [photosToDelete, setPhotosToDelete] = useState<string[]>([]);
  const [newPhotos, setNewPhotos] = useState<DraftNotePhoto[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPhotoSourcePickerOpen, setIsPhotoSourcePickerOpen] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);

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

  const ensureCanAddPhoto = useCallback(() => {
    if (totalPhotoCount >= perNotePhotoLimit) {
      trackObservabilityEvent('USAGE_LIMIT_REACHED', {
        enforcement: 'client_estimate',
        limit: perNotePhotoLimit,
        metric: 'photo_uploads_per_record',
        remaining: Math.max(perNotePhotoLimit - totalPhotoCount, 0),
        source: 'NoteEditorScreen',
        used: totalPhotoCount,
      });
      setErrorMessage(formatPhotoPerNoteLimitMessage(perNotePhotoLimit));
      return false;
    }

    if (shouldEnforceUsageLimitsClientSide && isDisplayFreeUser && monthlyUsage.snapshot) {
      const estimatedUsedWithDraftUploads = monthlyUsage.snapshot.usage.photoUploads + newPhotos.length;
      if (estimatedUsedWithDraftUploads + 1 > FREE_MONTHLY_PHOTO_LIMIT) {
        const remaining = Math.max(FREE_MONTHLY_PHOTO_LIMIT - estimatedUsedWithDraftUploads, 0);
        trackObservabilityEvent('USAGE_LIMIT_REACHED', {
          enforcement: 'client_estimate',
          limit: FREE_MONTHLY_PHOTO_LIMIT,
          metric: 'photo_uploads',
          remaining,
          source: 'NoteEditorScreen',
          used: estimatedUsedWithDraftUploads,
        });
        setErrorMessage(
          `Free users can upload up to ${FREE_MONTHLY_PHOTO_LIMIT} photos per month. Remaining estimate: ${remaining}.`,
        );
        return false;
      }
    }

    return true;
  }, [
    isDisplayFreeUser,
    monthlyUsage.snapshot,
    newPhotos.length,
    perNotePhotoLimit,
    shouldEnforceUsageLimitsClientSide,
    totalPhotoCount,
  ]);

  const addDraftPhoto = useCallback(
    (asset: { uri: string; fileName?: string | null; mimeType?: string | null }) => {
      if (!ensureCanAddPhoto()) {
        return;
      }

      const nextPhoto = buildLocalPhotoFile(asset, {
        fallbackPrefix: 'note-photo',
      });
      if (!nextPhoto) {
        setErrorMessage('Could not read selected photo.');
        return;
      }

      setNewPhotos((current) => [
        ...current,
        {
          id: `draft_photo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
          ...nextPhoto,
        },
      ]);
      setErrorMessage(null);
      resetPhotoPermissionNeedsSettings();
    },
    [ensureCanAddPhoto, resetPhotoPermissionNeedsSettings],
  );

  const handleOpenPhotoSourcePicker = useCallback(() => {
    if (!ensureCanAddPhoto()) {
      return;
    }

    resetPhotoPermissionNeedsSettings();
    setErrorMessage(null);
    setIsPhotoSourcePickerOpen(true);
  }, [ensureCanAddPhoto, resetPhotoPermissionNeedsSettings]);

  const handleOpenCamera = useCallback(async () => {
    trackObservabilityEvent('NOTE_CAMERA_OPEN_STARTED', {
      source: 'NoteEditorScreen',
    });
    setIsPhotoSourcePickerOpen(false);

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
      source: 'NoteEditorScreen',
    });
    setIsPhotoSourcePickerOpen(false);

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
        allowsMultipleSelection: false,
        selectionLimit: 1,
        mediaTypes: ['images'],
      });

      if (pickerResult.canceled) {
        trackObservabilityEvent('NOTE_LIBRARY_PICK_CANCELED', {
          source: 'NoteEditorScreen',
        });
        return;
      }

      const selectedAsset = pickerResult.assets?.[0];
      if (!selectedAsset?.uri) {
        setErrorMessage('Could not read selected photo.');
        return;
      }

      addDraftPhoto(selectedAsset);
      trackObservabilityEvent('NOTE_LIBRARY_PICKED', {
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
  }, [addDraftPhoto, ensureCanAddPhoto, requestPhotoPickerPermission, resetPhotoPermissionNeedsSettings]);

  const handleCapturePhoto = useCallback(async () => {
    if (!cameraRef.current) {
      return;
    }

    try {
      const captured = await cameraRef.current.takePictureAsync({ quality: 0.8 });
      if (!captured.uri) {
        throw new Error('Could not capture photo.');
      }

      addDraftPhoto({ uri: captured.uri });
      setIsCameraOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not capture photo.';
      setErrorMessage(message);
    }
  }, [addDraftPhoto]);

  const handleSave = useCallback(async () => {
    if (!content.trim()) {
      setErrorMessage('Please describe what you want to remember.');
      return;
    }

    const uploadPhotos: NotePhotoUploadInput[] = newPhotos.map((photo) => ({
      uri: photo.uri,
      name: photo.name,
      mimeType: photo.mimeType,
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
        showQueuedOfflineAlert('Note');
        navigation.navigate('Notes');
        return;
      }

      const invalidations: Promise<unknown>[] = [
        queryClient.invalidateQueries({ queryKey: ['feature', 'notes'] }),
        ...(noteId
          ? [
              queryClient.invalidateQueries({ queryKey: ['feature', 'note', noteId] }),
              queryClient.invalidateQueries({ queryKey: notesQueryKeys.detail(noteId) }),
            ]
          : []),
        queryClient.invalidateQueries({ queryKey: ['feature', 'notePhotos'] }),
        ...(noteId ? [queryClient.invalidateQueries({ queryKey: ['feature', 'notePhotos', noteId] })] : []),
      ];

      if (uploadPhotos.length > 0) {
        invalidations.push(
          queryClient.invalidateQueries({ queryKey: ['feature', 'usage', 'monthly'] }),
        );
      }

      await Promise.all(invalidations);

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
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    content,
    isDisplayFreeUser,
    isEditing,
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
        onBackPress={closeEditor}
        primaryAction={{
          label: 'Save Changes',
          onPress: () => undefined,
          disabled: true,
        }}
        secondaryAction={{
          label: 'Cancel',
          onPress: closeEditor,
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
        onBackPress={closeEditor}
        primaryAction={{
          label: 'Retry',
          onPress: () => {
            void noteDetailQuery.refetch();
          },
        }}
        secondaryAction={{
          label: 'Cancel',
          onPress: closeEditor,
          variant: 'secondary',
        }}
        subtitle="Could not load this note."
        title="Edit Note"
      >
        <ErrorState
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
        onBackPress={closeEditor}
        primaryAction={{
          label: 'Back to Notes',
          onPress: () => {
            navigation.navigate('Notes');
          },
        }}
        secondaryAction={{
          label: 'Cancel',
          onPress: closeEditor,
          variant: 'secondary',
        }}
        subtitle="This note no longer exists."
        title="Edit Note"
      >
        <EmptyState
          actionLabel="Back to Notes"
          onAction={() => {
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
        onBackPress={closeEditor}
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
          onPress: closeEditor,
          disabled: isSubmitting,
          variant: 'secondary',
        }}
        subtitle={isEditing ? 'Update your saved note details.' : 'Capture details you can turn into a track later.'}
        title={isEditing ? 'Edit Note' : 'Log Note'}
        testID="note-editor-screen"
      >
        <Card tone="info">
          <Text tone="secondary" variant="bodyMd">
            <Text variant="label">Tip:</Text> Keep each note focused on one visit or quick-track item so it is easy to
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

        {isDisplayFreeUser ? (
          <Card style={styles.sectionCard} tone="muted">
            <Text tone="secondary">
              Monthly photo estimate:{' '}
              {estimatedFreePhotoRemaining === null ? 'unknown' : `${estimatedFreePhotoRemaining} left`}.
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
          <View style={styles.sectionHeader}>
            <View style={styles.sectionLabel}>
              <Ionicons color={theme.colors.text.primary} name="camera-outline" size={16} />
              <Text variant="label">Photos (Optional)</Text>
            </View>
            <Text tone="muted" variant="bodySm">
              {totalPhotoCount}/{perNotePhotoLimit}
            </Text>
          </View>

          {existingPhotos.length > 0 || newPhotos.length > 0 ? (
            <View style={styles.photoGrid}>
              {existingPhotos.map((photo) => (
                <View key={photo.id} style={styles.photoPreviewWrap}>
                  <Image
                    source={{
                      uri: buildPocketBaseFileUrl({
                        collectionName: 'note_photos',
                        recordId: photo.id,
                        filename: photo.photo,
                        thumb: '100x100',
                      }),
                    }}
                    style={styles.photoPreview}
                  />
                  <Pressable
                    accessibilityLabel="Remove photo"
                    onPress={() => {
                      handleRemoveExistingPhoto(photo.id);
                    }}
                    style={styles.removePhotoButton}
                  >
                    <Ionicons color={theme.colors.text.inverse} name="close" size={14} />
                  </Pressable>
                </View>
              ))}

              {newPhotos.map((photo) => (
                <View key={photo.id} style={styles.photoPreviewWrap}>
                  <Image source={{ uri: photo.uri }} style={styles.photoPreview} />
                  <Pressable
                    accessibilityLabel="Remove photo"
                    onPress={() => {
                      handleRemoveNewPhoto(photo.id);
                    }}
                    style={styles.removePhotoButton}
                  >
                    <Ionicons color={theme.colors.text.inverse} name="close" size={14} />
                  </Pressable>
                  <View style={styles.photoSourceBadge}>
                    <Text tone="inverse" variant="bodySm">
                      New
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          <Pressable
            accessibilityLabel="Add photos"
            onPress={() => {
              handleOpenPhotoSourcePicker();
            }}
            style={[styles.addPhotoButton, totalPhotoCount >= perNotePhotoLimit ? styles.addPhotoButtonDisabled : null]}
          >
            <Ionicons color={theme.colors.text.muted} name="add-outline" size={20} />
            <Text tone="secondary">
              {totalPhotoCount >= perNotePhotoLimit ? 'Photo limit reached' : 'Add photo'}
            </Text>
          </Pressable>

          <Text tone="muted" variant="bodySm">
            Up to {perNotePhotoLimit} photo{perNotePhotoLimit === 1 ? '' : 's'} per note. Choose camera or photo
            library.
          </Text>
        </Card>

        {errorMessage ? (
          <ErrorState
            description={errorMessage}
            details={
              photoPermissionNeedsSettings ? (
                <Button
                  label="Open Settings"
                  onPress={() => {
                    void Linking.openSettings();
                  }}
                  style={styles.modalActionStack}
                  variant="secondary"
                />
              ) : null
            }
            title="Could not save note"
          />
        ) : null}
      </FeatureFormScreenScaffold>

      <Modal
        animationType="fade"
        onRequestClose={() => {
          setIsPhotoSourcePickerOpen(false);
        }}
        transparent
        visible={isPhotoSourcePickerOpen}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text variant="titleMd">Add Photo</Text>
              <Pressable
                accessibilityLabel="Close photo source options"
                onPress={() => {
                  setIsPhotoSourcePickerOpen(false);
                }}
                style={styles.modalClose}
              >
                <Ionicons color={theme.colors.text.primary} name="close" size={20} />
              </Pressable>
            </View>

            <Text tone="secondary" variant="bodyMd">
              Choose where to add your photo from.
            </Text>

            <View style={styles.modalActions}>
              <Button
                label="Camera"
                onPress={() => {
                  void handleOpenCamera();
                }}
                style={styles.modalAction}
                variant="secondary"
              />
              <Button
                label="Photo Library"
                onPress={() => {
                  void handlePickFromPhotoLibrary();
                }}
                style={styles.modalAction}
              />
            </View>

            <Button
              label="Cancel"
              onPress={() => {
                setIsPhotoSourcePickerOpen(false);
              }}
              style={styles.modalActionStack}
              variant="secondary"
            />
          </View>
        </View>
      </Modal>

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
