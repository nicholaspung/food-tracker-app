import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { CurrentLocationButton, EmptyState, ErrorState, FeatureFormScreenScaffold, Skeleton } from '../components/shared';
import {
  buildPocketBaseFileUrl,
  createNote,
  getNoteById,
  listCollectionRecords,
  updateNote,
  type NotePhotoUploadInput,
} from '../features';
import { useFeatureOutboxQueue } from '../features/store/useFeatureOutboxQueue';
import { useQueuedWrite } from '../features/store/useQueuedWrite';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { useTheme } from '../theme';
import { Button, Card, Input, Text } from '../ui';

type NoteEditorScreenProps = NativeStackScreenProps<RootStackParamList, 'NoteEditor'>;

interface NotePhotoRecord {
  id: string;
  note: string;
  photo: string;
}

interface DraftNotePhoto {
  id: string;
  uri: string;
  name: string;
  mimeType: string;
}

interface PhotoLibraryAsset {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
}

interface PhotoLibraryPickerResult {
  canceled?: boolean;
  cancelled?: boolean;
  assets?: PhotoLibraryAsset[];
}

interface PhotoLibraryPermissionResult {
  granted: boolean;
}

interface ImagePickerModule {
  requestMediaLibraryPermissionsAsync: () => Promise<PhotoLibraryPermissionResult>;
  launchImageLibraryAsync: (options: Record<string, unknown>) => Promise<PhotoLibraryPickerResult>;
  MediaType?: {
    image?: unknown;
  };
  MediaTypeOptions?: {
    Images?: unknown;
  };
}

const CONTENT_MAX_LENGTH = 2000;
const LOCATION_MAX_LENGTH = 200;
const MAX_NOTE_PHOTOS = 20;

function parseCoordinateString(value: string): { latitude: number; longitude: number } | null {
  const match = value.trim().match(/^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) {
    return null;
  }

  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
    return null;
  }

  return { latitude, longitude };
}

function inferMimeType(uri: string): string {
  const normalized = uri.toLowerCase();
  if (normalized.endsWith('.png')) {
    return 'image/png';
  }

  if (normalized.endsWith('.webp')) {
    return 'image/webp';
  }

  return 'image/jpeg';
}

function buildPhotoFileName(uri: string, mimeType?: string): string {
  const normalizedMimeType = mimeType ?? inferMimeType(uri);
  const extension = normalizedMimeType === 'image/png' ? 'png' : normalizedMimeType === 'image/webp' ? 'webp' : 'jpg';
  return `note_photo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}.${extension}`;
}

async function loadImagePickerModule(): Promise<ImagePickerModule | null> {
  try {
    return (await import('expo-image-picker')) as unknown as ImagePickerModule;
  } catch {
    return null;
  }
}

export function NoteEditorScreen({ navigation, route }: NoteEditorScreenProps) {
  const theme = useTheme();
  const noteId = route.params?.noteId;
  const isEditing = Boolean(noteId);
  const queueWrite = useQueuedWrite();
  const queueFeatureOutbox = useFeatureOutboxQueue();
  const { isOnline } = useConnectivity();
  const queryClient = useQueryClient();
  const cameraRef = useRef<CameraView | null>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const noteQuery = useQuery({
    queryKey: ['feature', 'note', noteId],
    queryFn: () => (noteId ? getNoteById(noteId) : Promise.resolve(null)),
    enabled: Boolean(noteId),
  });

  const notePhotosQuery = useQuery({
    queryKey: ['feature', 'notePhotos', noteId],
    queryFn: async () =>
      listCollectionRecords<NotePhotoRecord>('note_photos', {
        filter: noteId ? `note = "${noteId}"` : undefined,
        sort: 'created',
      }),
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
  const [isGettingLocation, setIsGettingLocation] = useState(false);

  const existingPhotos = useMemo(() => {
    const deletedIds = new Set(photosToDelete);
    return (notePhotosQuery.data ?? []).filter((photo) => !deletedIds.has(photo.id));
  }, [notePhotosQuery.data, photosToDelete]);

  const totalPhotoCount = existingPhotos.length + newPhotos.length;

  useEffect(() => {
    if (!noteQuery.data) {
      return;
    }

    setContent(noteQuery.data.content);
    setLocationText(noteQuery.data.locationText ?? '');
    setPhotosToDelete([]);
    setNewPhotos([]);
    setErrorMessage(null);
  }, [noteQuery.data]);

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

  const addDraftPhoto = useCallback(
    (uri: string, fileName?: string | null, mimeType?: string | null) => {
      if (totalPhotoCount >= MAX_NOTE_PHOTOS) {
        setErrorMessage(`You can add up to ${MAX_NOTE_PHOTOS} photos per note.`);
        return;
      }

      const normalizedMimeType = mimeType?.trim() || inferMimeType(uri);
      setNewPhotos((current) => [
        ...current,
        {
          id: `draft_photo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
          uri,
          name: fileName?.trim() || buildPhotoFileName(uri, normalizedMimeType),
          mimeType: normalizedMimeType,
        },
      ]);
      setErrorMessage(null);
    },
    [totalPhotoCount],
  );

  const handleOpenPhotoSourcePicker = useCallback(() => {
    if (totalPhotoCount >= MAX_NOTE_PHOTOS) {
      setErrorMessage(`You can add up to ${MAX_NOTE_PHOTOS} photos per note.`);
      return;
    }

    setErrorMessage(null);
    setIsPhotoSourcePickerOpen(true);
  }, [totalPhotoCount]);

  const handleOpenCamera = useCallback(async () => {
    setIsPhotoSourcePickerOpen(false);

    if (totalPhotoCount >= MAX_NOTE_PHOTOS) {
      setErrorMessage(`You can add up to ${MAX_NOTE_PHOTOS} photos per note.`);
      return;
    }

    const hasPermission = cameraPermission?.granted === true;
    if (!hasPermission) {
      const permissionResult = await requestCameraPermission();
      if (!permissionResult.granted) {
        setErrorMessage('Camera permission is required to add photos.');
        return;
      }
    }

    setIsCameraOpen(true);
  }, [cameraPermission?.granted, requestCameraPermission, totalPhotoCount]);

  const handlePickFromPhotoLibrary = useCallback(async () => {
    setIsPhotoSourcePickerOpen(false);

    if (totalPhotoCount >= MAX_NOTE_PHOTOS) {
      setErrorMessage(`You can add up to ${MAX_NOTE_PHOTOS} photos per note.`);
      return;
    }

    const imagePicker = await loadImagePickerModule();
    if (!imagePicker) {
      setErrorMessage('Photo library picker is not available in this build.');
      return;
    }

    try {
      const permission = await imagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setErrorMessage('Photo library permission is required to select photos.');
        return;
      }

      const mediaType = imagePicker.MediaType?.image ?? imagePicker.MediaTypeOptions?.Images;
      const pickerResult = await imagePicker.launchImageLibraryAsync({
        allowsEditing: false,
        quality: 0.8,
        allowsMultipleSelection: false,
        selectionLimit: 1,
        mediaTypes: mediaType,
      });

      const wasCancelled = pickerResult.canceled === true || pickerResult.cancelled === true;
      if (wasCancelled) {
        return;
      }

      const selectedAsset = pickerResult.assets?.[0];
      if (!selectedAsset?.uri) {
        setErrorMessage('Could not read selected photo.');
        return;
      }

      addDraftPhoto(selectedAsset.uri, selectedAsset.fileName, selectedAsset.mimeType);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not choose a photo from your library.';
      setErrorMessage(message);
    }
  }, [addDraftPhoto, totalPhotoCount]);

  const handleCapturePhoto = useCallback(async () => {
    if (!cameraRef.current) {
      return;
    }

    try {
      const captured = await cameraRef.current.takePictureAsync({ quality: 0.8 });
      if (!captured.uri) {
        throw new Error('Could not capture photo.');
      }

      addDraftPhoto(captured.uri);
      setIsCameraOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not capture photo.';
      setErrorMessage(message);
    }
  }, [addDraftPhoto]);

  const handleUseCurrentLocation = useCallback(async () => {
    setIsGettingLocation(true);
    setErrorMessage(null);

    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setErrorMessage(
          permission.canAskAgain === false
            ? 'Location permission is blocked. Enable it in device settings.'
            : 'Location permission is required to use GPS.',
        );
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      setLocationText(`${position.coords.latitude.toFixed(6)}, ${position.coords.longitude.toFixed(6)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not get current location.';
      setErrorMessage(message);
    } finally {
      setIsGettingLocation(false);
    }
  }, []);

  const handleSave = useCallback(async () => {
    if (!content.trim()) {
      setErrorMessage('Please describe what you want to remember.');
      return;
    }

    const trimmedLocationText = locationText.trim();
    const parsedCoordinates = parseCoordinateString(trimmedLocationText);
    const uploadPhotos: NotePhotoUploadInput[] = newPhotos.map((photo) => ({
      uri: photo.uri,
      name: photo.name,
      mimeType: photo.mimeType,
    }));
    const noteCreateInput = {
      title: '',
      content,
      locationText: trimmedLocationText || undefined,
      latitude: parsedCoordinates?.latitude,
      longitude: parsedCoordinates?.longitude,
      photos: uploadPhotos,
    };
    const noteUpdateInput = {
      content,
      locationText: trimmedLocationText,
      latitude: parsedCoordinates?.latitude ?? null,
      longitude: parsedCoordinates?.longitude ?? null,
      newPhotos: uploadPhotos,
      deletePhotoIds: photosToDelete,
    };

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      if (!isOnline) {
        if (isEditing && noteId) {
          await queueFeatureOutbox('note.update', {
            noteId,
            updates: noteUpdateInput,
          });
        } else {
          await queueFeatureOutbox('note.create', noteCreateInput);
        }

        await queryClient.invalidateQueries({ queryKey: ['feature', 'notes'] });
        Alert.alert('Saved Offline', 'Note queued and will sync when you reconnect.');
        navigation.navigate('Notes');
        return;
      }

      if (isEditing && noteId) {
        await queueWrite('note.update');
        await updateNote(noteId, noteUpdateInput);
      } else {
        await queueWrite('note.create');
        await createNote(noteCreateInput);
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['feature', 'notes'] }),
        queryClient.invalidateQueries({ queryKey: ['feature', 'note', noteId] }),
        queryClient.invalidateQueries({ queryKey: ['feature', 'notePhotos'] }),
        queryClient.invalidateQueries({ queryKey: ['feature', 'notePhotos', noteId] }),
      ]);

      navigation.navigate('Notes');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not save note.';
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    content,
    isEditing,
    locationText,
    navigation,
    newPhotos,
    noteId,
    isOnline,
    photosToDelete,
    queryClient,
    queueFeatureOutbox,
    queueWrite,
  ]);

  const styles = StyleSheet.create({
    body: {
      gap: theme.spacing.md,
      paddingBottom: theme.spacing.lg,
    },
    sectionCard: {
      gap: theme.spacing.sm,
    },
    tipText: {
      lineHeight: 20,
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
      justifyContent: 'space-between',
      gap: theme.spacing.sm,
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
    locationRow: {
      alignItems: 'flex-end',
      flexDirection: 'row',
      gap: theme.spacing.xs,
    },
    locationField: {
      flex: 1,
    },
    locationAction: {
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
    modalDescription: {
      lineHeight: 20,
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
  });

  if (isEditing && noteQuery.isLoading) {
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

  if (isEditing && noteQuery.isError) {
    return (
      <FeatureFormScreenScaffold
        onBackPress={closeEditor}
        primaryAction={{
          label: 'Retry',
          onPress: () => {
            void noteQuery.refetch();
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
            void noteQuery.refetch();
          }}
          title="Note unavailable"
        />
      </FeatureFormScreenScaffold>
    );
  }

  if (isEditing && !noteQuery.data) {
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
          <Text style={styles.tipText} tone="secondary">
            <Text variant="label">Tip:</Text> Keep each note focused on one visit or quick-track item so it is easy to
            reuse later.
          </Text>
        </Card>

        {isEditing && noteQuery.data?.status === 'used' ? (
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
          <View style={styles.sectionHeader}>
            <View style={styles.sectionLabel}>
              <Ionicons color={theme.colors.text.primary} name="camera-outline" size={16} />
              <Text variant="label">Photos (Optional)</Text>
            </View>
            <Text tone="muted" variant="bodySm">
              {totalPhotoCount}/{MAX_NOTE_PHOTOS}
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
            style={[styles.addPhotoButton, totalPhotoCount >= MAX_NOTE_PHOTOS ? styles.addPhotoButtonDisabled : null]}
          >
            <Ionicons color={theme.colors.text.muted} name="add-outline" size={20} />
            <Text tone="secondary">
              {totalPhotoCount >= MAX_NOTE_PHOTOS ? 'Photo limit reached' : 'Add photo'}
            </Text>
          </Pressable>

          <Text tone="muted" variant="bodySm">
            Choose camera or photo library.
          </Text>
          {notePhotosQuery.isError ? (
            <Text tone="danger" variant="bodySm">
              Existing photos could not be loaded.
            </Text>
          ) : null}
        </Card>

        <Card style={styles.sectionCard}>
          <View style={styles.sectionLabel}>
            <Ionicons color={theme.colors.text.primary} name="location-outline" size={16} />
            <Text variant="label">Location (Optional)</Text>
          </View>
          <View style={styles.locationRow}>
            <Input
              containerStyle={styles.locationField}
              maxLength={LOCATION_MAX_LENGTH}
              onChangeText={setLocationText}
              placeholder="e.g., Starbucks on Main St"
              testID="note-location-input"
              value={locationText}
            />
            <CurrentLocationButton
              accessibilityLabel="Use current location"
              captured={Boolean(parseCoordinateString(locationText))}
              loading={isGettingLocation}
              onPress={() => {
                void handleUseCurrentLocation();
              }}
              style={styles.locationAction}
              variant="icon"
            />
          </View>
          <Text tone="muted" variant="bodySm">
            Enter a place name or use GPS to capture coordinates.
          </Text>
        </Card>

        {errorMessage ? <ErrorState description={errorMessage} title="Could not save note" /> : null}
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

            <Text style={styles.modalDescription} tone="secondary">
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
