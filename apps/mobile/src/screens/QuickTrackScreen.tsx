import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  FeatureFormScreenScaffold,
  PageErrorToast,
  PhotoAttachmentRow,
  PhotoSourceActionCards,
  PhotoViewerModal,
  QuickTrackFormFields,
  UpgradePromptCard,
} from '../components/shared';
import {
  createQuickTrack,
  formatLimitExceededMessage,
  getNoteById,
  parseLimitExceededError,
  useMonthlyUsage,
  type VisitPhotoUploadInput,
} from '../features';
import { useFeatureOutboxQueue } from '../features/store/useFeatureOutboxQueue';
import { useQueuedWrite } from '../features/store/useQueuedWrite';
import { usePhotoPickerPermissions } from '../hooks/usePhotoPickerPermissions';
import {
  formatDateToLocalDateString,
} from '../lib/dateFormatting';
import { showQueuedOfflineAlert } from '../lib/offlineAlerts';
import { resolvePhotoCaptureDate } from '../lib/photoMetadata';
import {
  buildCreateQuickTrackInput,
  buildDefaultQuickTrackForm,
  validateQuickTrackForm,
  type QuickTrackFormValues,
} from '../lib/quickTrackForm';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { useTheme } from '../theme';
import { Button, Card, Text } from '../ui';

type QuickTrackScreenProps = NativeStackScreenProps<RootStackParamList, 'QuickTrack'>;

const QUICK_TRACK_RATED_BEFORE_KEY = 'ui.quickTrack.hasRatedBefore';
const FREE_MONTHLY_PHOTO_LIMIT = 5;
const FREE_MONTHLY_PHOTO_WARNING_THRESHOLD = 1;
type PhotoSource = 'camera' | 'gallery';

function buildDraftPhotoInput(asset: ImagePicker.ImagePickerAsset): VisitPhotoUploadInput | null {
  if (!asset.uri) {
    return null;
  }

  return {
    uri: asset.uri,
    name: asset.fileName?.trim() || buildDraftPhotoName(asset.uri),
    mimeType: asset.mimeType?.trim() || inferImageMimeType(asset.uri),
  };
}

function inferImageMimeType(uri: string): string {
  const normalizedUri = uri.toLowerCase();
  if (normalizedUri.endsWith('.png')) {
    return 'image/png';
  }

  if (normalizedUri.endsWith('.webp')) {
    return 'image/webp';
  }

  if (normalizedUri.endsWith('.heic') || normalizedUri.endsWith('.heif')) {
    return 'image/heic';
  }

  return 'image/jpeg';
}

function buildDraftPhotoName(uri: string): string {
  const baseName = uri.split('/').pop();
  if (baseName && baseName.includes('.')) {
    return baseName;
  }

  return `quick-track-${Date.now()}.jpg`;
}

export function QuickTrackScreen({ navigation, route }: QuickTrackScreenProps) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const queueWrite = useQueuedWrite();
  const queueFeatureOutbox = useFeatureOutboxQueue();
  const { isOnline } = useConnectivity();
  const { actualUser, user } = useAuth();
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
  const sourceNoteId = route.params?.sourceNoteId;

  const shouldEnforceUsageLimitsClientSide = !isActualAdmin;
  const estimatedFreePhotoRemaining = isDisplayFreeUser
    ? monthlyUsage.snapshot?.remaining.photoUploadsMonthly ?? null
    : null;
  const shouldShowPhotoUpgradePrompt =
    isDisplayFreeUser &&
    typeof estimatedFreePhotoRemaining === 'number' &&
    estimatedFreePhotoRemaining <= FREE_MONTHLY_PHOTO_WARNING_THRESHOLD;

  const linkedNoteQuery = useQuery({
    queryKey: ['feature', 'note', sourceNoteId],
    queryFn: () => (sourceNoteId ? getNoteById(sourceNoteId) : Promise.resolve(null)),
    enabled: Boolean(sourceNoteId),
  });

  const [form, setForm] = useState<QuickTrackFormValues>(() => buildDefaultQuickTrackForm());
  const [detectedItemDateValue, setDetectedItemDateValue] = useState<string | null>(null);
  const [photo, setPhoto] = useState<VisitPhotoUploadInput | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasRatedBefore, setHasRatedBefore] = useState(false);
  const [isCategoryExpanded, setIsCategoryExpanded] = useState(false);
  const [isPhotoViewerVisible, setIsPhotoViewerVisible] = useState(false);
  const [didApplyNotePrefill, setDidApplyNotePrefill] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const {
    permissionNeedsSettings: photoPermissionNeedsSettings,
    requestPermission: requestPhotoPickerPermission,
    resetPermissionNeedsSettings: resetPhotoPermissionNeedsSettings,
  } = usePhotoPickerPermissions({
    cameraBlockedMessage: 'Camera permission is blocked. Enable it in device settings.',
    cameraRequiredMessage: 'Camera permission is required to take a photo.',
    galleryBlockedMessage: 'Photo library permission is blocked. Enable it in device settings.',
    galleryRequiredMessage: 'Photo library permission is required to upload an image.',
  });

  useEffect(() => {
    let isMounted = true;

    const loadRatedBefore = async () => {
      try {
        const storedValue = await AsyncStorage.getItem(QUICK_TRACK_RATED_BEFORE_KEY);
        if (isMounted) {
          setHasRatedBefore(storedValue === '1');
        }
      } catch {
        // Ignore storage read errors and keep the default collapsed state.
      }
    };

    void loadRatedBefore();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!linkedNoteQuery.data || didApplyNotePrefill) {
      return;
    }

    setForm((currentForm) => ({
      ...currentForm,
      notes: currentForm.notes.trim() ? currentForm.notes : linkedNoteQuery.data?.content ?? '',
    }));
    setDidApplyNotePrefill(true);
  }, [didApplyNotePrefill, linkedNoteQuery.data]);

  const styles = StyleSheet.create({
    body: {
      gap: theme.spacing.md,
      paddingBottom: theme.spacing.sm,
    },
    sectionCard: {
      gap: theme.spacing.sm,
    },
    linkedNoteCard: {
      gap: theme.spacing.xs,
    },
  });

  const applyPhotoCaptureDate = useCallback(async (asset: ImagePicker.ImagePickerAsset) => {
    const captureDate = await resolvePhotoCaptureDate(asset);
    if (!captureDate) {
      return;
    }

    const nextDetectedDateValue = formatDateToLocalDateString(captureDate);
    setForm((currentForm) => ({
      ...currentForm,
      date: nextDetectedDateValue,
    }));
    setDetectedItemDateValue(nextDetectedDateValue);
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }

    let isMounted = true;

    const restorePendingPickerResult = async () => {
      try {
        const pendingResult = await ImagePicker.getPendingResultAsync();
        if (!isMounted || !pendingResult || 'code' in pendingResult || pendingResult.canceled) {
          return;
        }

        const pendingAsset = pendingResult.assets?.[0];
        const nextPhoto = pendingAsset ? buildDraftPhotoInput(pendingAsset) : null;
        if (!nextPhoto) {
          return;
        }

        if (pendingAsset) {
          await applyPhotoCaptureDate(pendingAsset);
        }
        setIsPhotoViewerVisible(false);
        setPhoto(nextPhoto);
        trackObservabilityEvent('QUICK_TRACK_PHOTO_PICKED', {
          photoSource: 'gallery',
          restoredPendingResult: true,
          source: 'QuickTrackScreen',
        });
      } catch (error) {
        trackObservabilityEvent('QUICK_TRACK_PHOTO_PICK_FAILED', {
          errorMessage: error instanceof Error ? error.message : String(error),
          errorType: error instanceof Error ? error.name : 'unknown_error',
          photoSource: 'gallery',
          restoredPendingResult: true,
          source: 'QuickTrackScreen',
        });
      }
    };

    void restorePendingPickerResult();
    return () => {
      isMounted = false;
    };
  }, [applyPhotoCaptureDate]);

  const handlePhotoPick = async (source: PhotoSource) => {
    trackObservabilityEvent('QUICK_TRACK_PHOTO_PICK_STARTED', {
      photoSource: source,
      source: 'QuickTrackScreen',
    });
    setErrorMessage(null);
    resetPhotoPermissionNeedsSettings();

    if (shouldEnforceUsageLimitsClientSide && isDisplayFreeUser && estimatedFreePhotoRemaining === 0) {
      trackObservabilityEvent('USAGE_LIMIT_REACHED', {
        enforcement: 'client_estimate',
        limit: FREE_MONTHLY_PHOTO_LIMIT,
        metric: 'photo_uploads',
        remaining: estimatedFreePhotoRemaining,
        source: 'QuickTrackScreen',
        used: monthlyUsage.snapshot?.usage.photoUploads ?? null,
      });
      setErrorMessage('Free users can upload up to 5 photos per month.');
      return;
    }

    try {
      const permission = await requestPhotoPickerPermission(source);
      if (!permission.granted) {
        trackObservabilityEvent('QUICK_TRACK_PHOTO_PERMISSION_DENIED', {
          canAskAgain: permission.canAskAgain,
          photoSource: source,
          source: 'QuickTrackScreen',
        });
        setErrorMessage(permission.message);
        return;
      }

      const pickerResult =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({
              mediaTypes: ['images'],
              allowsEditing: false,
              exif: true,
              quality: 0.8,
              presentationStyle:
                Platform.OS === 'ios'
                  ? ImagePicker.UIImagePickerPresentationStyle.FULL_SCREEN
                  : undefined,
            })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'],
              allowsEditing: false,
              exif: true,
              quality: 1,
              selectionLimit: 1,
              presentationStyle:
                Platform.OS === 'ios'
                  ? ImagePicker.UIImagePickerPresentationStyle.FULL_SCREEN
                  : undefined,
              preferredAssetRepresentationMode:
                Platform.OS === 'ios'
                  ? ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current
                  : undefined,
            });

      if (pickerResult.canceled) {
        trackObservabilityEvent('QUICK_TRACK_PHOTO_PICK_CANCELED', {
          photoSource: source,
          source: 'QuickTrackScreen',
        });
        return;
      }

      const selectedAsset = pickerResult.assets?.[0];
      const nextPhoto = selectedAsset ? buildDraftPhotoInput(selectedAsset) : null;
      if (!nextPhoto) {
        throw new Error('Could not read the selected image.');
      }

      setDetectedItemDateValue(null);
      await applyPhotoCaptureDate(selectedAsset);
      setIsPhotoViewerVisible(false);
      setPhoto(nextPhoto);
      trackObservabilityEvent('QUICK_TRACK_PHOTO_PICKED', {
        photoSource: source,
        source: 'QuickTrackScreen',
      });
      resetPhotoPermissionNeedsSettings();
    } catch (error) {
      trackObservabilityEvent('QUICK_TRACK_PHOTO_PICK_FAILED', {
        errorMessage: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.name : 'unknown_error',
        photoSource: source,
        source: 'QuickTrackScreen',
      });
      setErrorMessage(error instanceof Error ? error.message : 'Could not select a photo.');
    }
  };

  const handleCreate = async () => {
    const validationMessage = validateQuickTrackForm(form);
    if (validationMessage) {
      setErrorMessage(validationMessage);
      return;
    }

    if (shouldEnforceUsageLimitsClientSide && isDisplayFreeUser && photo && monthlyUsage.snapshot) {
      const estimatedTotalAfterSubmit = monthlyUsage.snapshot.usage.photoUploads + 1;
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
          source: 'QuickTrackScreen',
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
      const quickTrackInput = buildCreateQuickTrackInput(form, {
        photo: photo ?? undefined,
        sourceNoteId,
      });

      if (!isOnline) {
        await queueFeatureOutbox('quick-track.create', quickTrackInput);
        await queryClient.invalidateQueries({ queryKey: ['feature', 'quickTracks'] });
        showQueuedOfflineAlert('Quick track');
        navigation.navigate('Home');
        return;
      }

      await queueWrite('quick-track.create');
      await createQuickTrack(quickTrackInput);

      const invalidations: Promise<unknown>[] = [
        queryClient.invalidateQueries({ queryKey: ['feature', 'quickTracks'] }),
        queryClient.invalidateQueries({ queryKey: ['feature', 'visitPhotos'] }),
        queryClient.invalidateQueries({ queryKey: ['feature', 'usage', 'monthly'] }),
      ];

      if (sourceNoteId) {
        invalidations.push(queryClient.invalidateQueries({ queryKey: ['feature', 'notes'] }));
        invalidations.push(queryClient.invalidateQueries({ queryKey: ['feature', 'note', sourceNoteId] }));
      }

      await Promise.all(invalidations);
      await AsyncStorage.setItem(QUICK_TRACK_RATED_BEFORE_KEY, '1');
      navigation.navigate('Home');
    } catch (error) {
      const limitPayload = parseLimitExceededError(error);
      if (limitPayload) {
        trackObservabilityEvent('USAGE_LIMIT_REACHED', {
          enforcement: 'server',
          limit: limitPayload.limit,
          metric: limitPayload.metric,
          monthKey: limitPayload.monthKey,
          remaining: limitPayload.remaining,
          source: 'QuickTrackScreen',
          used: limitPayload.used,
          userTier: limitPayload.userTier ?? null,
        });
      }
      const message = limitPayload
        ? formatLimitExceededMessage(limitPayload)
        : error instanceof Error
          ? error.message
          : 'Could not save quick track.';
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    if (sourceNoteId) {
      navigation.navigate('Notes');
      return;
    }

    navigation.navigate('AddVisit');
  };

  return (
    <FeatureFormScreenScaffold
      keyboardAware
      onBackPress={handleCancel}
      primaryAction={{
        label: 'Save Item',
        disabled: isSubmitting || !form.itemName.trim(),
        loading: isSubmitting,
        onPress: () => {
          void handleCreate();
        },
      }}
      secondaryAction={{
        label: 'Cancel',
        disabled: isSubmitting,
        onPress: handleCancel,
      }}
      subtitle="Quickly rate any item without a restaurant."
      testID="quick-track-screen"
      title="Quick Track Item"
    >
      <View style={styles.body}>
        <PageErrorToast errorMessage={errorMessage} title="Quick track failed" />

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

        {shouldShowPhotoUpgradePrompt ? (
          <UpgradePromptCard
            description={
              estimatedFreePhotoRemaining === 0
                ? "You have reached this month's free photo limit. Subscriber accounts have higher monthly limits."
                : `Only ${estimatedFreePhotoRemaining} photo uploads left this month. Subscriber accounts have higher monthly limits.`
            }
            title={
              estimatedFreePhotoRemaining === 0
                ? 'Free limit reached'
                : 'You are close to your free limit'
            }
          />
        ) : null}

        {sourceNoteId ? (
          <Card style={styles.linkedNoteCard} tone="muted">
            <Text variant="label">Linked Note</Text>
            {linkedNoteQuery.isLoading ? (
              <Text tone="secondary">Loading note details...</Text>
            ) : linkedNoteQuery.data ? (
              <>
                <Text tone="secondary">{linkedNoteQuery.data.title}</Text>
                <Text numberOfLines={4} tone="secondary" variant="bodySm">
                  {linkedNoteQuery.data.content}
                </Text>
              </>
            ) : (
              <Text tone="warning">Note details unavailable. You can still save this item.</Text>
            )}
          </Card>
        ) : null}

        <QuickTrackFormFields
          detectedDateValue={detectedItemDateValue}
          isCategoryExpanded={isCategoryExpanded}
          onCategoryExpandedChange={setIsCategoryExpanded}
          onChange={(updates) => {
            setForm((currentForm) => ({
              ...currentForm,
              ...updates,
            }));
          }}
          photoSection={
            <>
              <Text variant="label">Photo (Optional)</Text>
              <PhotoSourceActionCards
                cameraSubtitle="Camera"
                cameraTitle="Take Photo"
                disabled={isSubmitting}
                gallerySubtitle="Photo Library"
                galleryTitle="Upload Image"
                onCameraPress={() => {
                  void handlePhotoPick('camera');
                }}
                onGalleryPress={() => {
                  void handlePhotoPick('gallery');
                }}
              />

              {photo ? (
                <PhotoAttachmentRow
                  accessibilityLabel="View attached photo full screen"
                  name={photo.name}
                  onPress={() => {
                    setIsPhotoViewerVisible(true);
                  }}
                  onRemove={() => {
                    setIsPhotoViewerVisible(false);
                    setDetectedItemDateValue(null);
                    setPhoto(null);
                  }}
                  uri={photo.uri}
                />
              ) : null}

              {photoPermissionNeedsSettings ? (
                <Button
                  label="Open Settings"
                  onPress={() => {
                    void Linking.openSettings();
                  }}
                  variant="secondary"
                />
              ) : null}
            </>
          }
          ratingLegendInitiallyExpanded={!hasRatedBefore}
          ratingTestIDPrefix="quick-track-rating"
          value={form}
        />
      </View>
      <PhotoViewerModal
        onRequestClose={() => {
          setIsPhotoViewerVisible(false);
        }}
        urls={photo ? [photo.uri] : []}
        visible={Boolean(photo) && isPhotoViewerVisible}
      />
    </FeatureFormScreenScaffold>
  );
}
