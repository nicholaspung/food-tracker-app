import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import { Linking, Platform, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  FeatureFormScreenScaffold,
  LinkedNoteCard,
  PageErrorToast,
  PhotoInputField,
  PhotoViewerModal,
  FoodProductFormFields,
  UpgradePromptCard,
} from '../components/shared';
import {
  createFoodProduct,
  formatLimitExceededMessage,
  getNoteById,
  markNoteUsed,
  parseLimitExceededError,
  promoteCachedNoteToUsed,
  useMonthlyUsage,
  type VisitPhotoUploadInput,
} from '../features';
import { foodProductsQueryKeys } from '../features/store/foodProductsQuery';
import { useOfflineAwareFeatureWrite } from '../features/store/useOfflineAwareFeatureWrite';
import { notesQueryKeys } from '../features/store/notesQuery';
import { usePhotoPickerPermissions } from '../hooks/usePhotoPickerPermissions';
import {
  formatDateToLocalDateString,
} from '../lib/dateFormatting';
import { showQueuedOfflineAlert } from '../lib/offlineAlerts';
import { buildLocalPhotoFile } from '../lib/photoFiles';
import { resolvePhotoCaptureDate } from '../lib/photoMetadata';
import {
  buildCreateFoodProductInput,
  buildDefaultFoodProductForm,
  validateFoodProductForm,
  type FoodProductFormValues,
} from '../lib/foodProductForm';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { createThemedStyles } from '../theme';
import { Button, Card, Text } from '../ui';

type FoodProductScreenProps = NativeStackScreenProps<RootStackParamList, 'FoodProduct'>;

const FOOD_PRODUCT_RATED_BEFORE_KEY = 'ui.foodProduct.hasRatedBefore';
const LEGACY_QUICK_TRACK_RATED_BEFORE_KEY = 'ui.quickTrack.hasRatedBefore';
const FREE_MONTHLY_PHOTO_LIMIT = 5;
const FREE_MONTHLY_PHOTO_WARNING_THRESHOLD = 1;
type PhotoSource = 'camera' | 'gallery';

const useStyles = createThemedStyles((theme) => ({
  body: {
    gap: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  sectionCard: {
    gap: theme.spacing.sm,
  },
}));

function buildDraftPhotoInput(asset: ImagePicker.ImagePickerAsset): VisitPhotoUploadInput | null {
  return buildLocalPhotoFile(asset, {
    fallbackPrefix: 'food-product',
  });
}

export function FoodProductScreen({ navigation, route }: FoodProductScreenProps) {
  const styles = useStyles();
  const queryClient = useQueryClient();
  const writeFeature = useOfflineAwareFeatureWrite();
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
    queryFn: ({ signal }) => (sourceNoteId ? getNoteById(sourceNoteId, { signal }) : Promise.resolve(null)),
    enabled: Boolean(sourceNoteId),
  });
  const returnToPrevious = route.params?.returnToPrevious === true;

  const [form, setForm] = useState<FoodProductFormValues>(() => buildDefaultFoodProductForm());
  const [detectedItemDateValue, setDetectedItemDateValue] = useState<string | null>(null);
  const [photo, setPhoto] = useState<VisitPhotoUploadInput | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasRatedBefore, setHasRatedBefore] = useState(false);
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
        const [foodProductValue, quickTrackValue] = await Promise.all([
          AsyncStorage.getItem(FOOD_PRODUCT_RATED_BEFORE_KEY),
          AsyncStorage.getItem(LEGACY_QUICK_TRACK_RATED_BEFORE_KEY),
        ]);
        if (isMounted) {
          setHasRatedBefore(foodProductValue === '1' || quickTrackValue === '1');
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
          source: 'FoodProductScreen',
        });
      } catch (error) {
        trackObservabilityEvent('QUICK_TRACK_PHOTO_PICK_FAILED', {
          errorMessage: error instanceof Error ? error.message : String(error),
          errorType: error instanceof Error ? error.name : 'unknown_error',
          photoSource: 'gallery',
          restoredPendingResult: true,
          source: 'FoodProductScreen',
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
      source: 'FoodProductScreen',
    });
    setErrorMessage(null);
    resetPhotoPermissionNeedsSettings();

    if (shouldEnforceUsageLimitsClientSide && isDisplayFreeUser && estimatedFreePhotoRemaining === 0) {
        trackObservabilityEvent('USAGE_LIMIT_REACHED', {
          enforcement: 'client_estimate',
          limit: FREE_MONTHLY_PHOTO_LIMIT,
          metric: 'photo_uploads',
          remaining: estimatedFreePhotoRemaining,
          source: 'FoodProductScreen',
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
          source: 'FoodProductScreen',
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
          source: 'FoodProductScreen',
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
        source: 'FoodProductScreen',
      });
      resetPhotoPermissionNeedsSettings();
    } catch (error) {
      trackObservabilityEvent('QUICK_TRACK_PHOTO_PICK_FAILED', {
        errorMessage: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.name : 'unknown_error',
        photoSource: source,
        source: 'FoodProductScreen',
      });
      setErrorMessage(error instanceof Error ? error.message : 'Could not select a photo.');
    }
  };

  const handleCreate = async () => {
    const validationMessage = validateFoodProductForm(form);
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
          source: 'FoodProductScreen',
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
      const noteUsedAt = sourceNoteId ? new Date().toISOString() : null;
      const foodProductInput = buildCreateFoodProductInput(form, {
        photo: photo ?? undefined,
        sourceNoteId,
      });

      const createResult = await writeFeature({
        operationName: 'quick-track.create',
        offline: {
          strategy: 'outbox',
          payload: foodProductInput,
        },
        execute: () => createFoodProduct(foodProductInput),
      });

      if (createResult.status === 'queued') {
        if (sourceNoteId && noteUsedAt) {
          await writeFeature({
            operationName: 'note.mark-used',
            trackOnlineWrite: false,
            offline: {
              strategy: 'outbox',
              payload: {
                noteId: sourceNoteId,
                usedAt: noteUsedAt,
              },
            },
            execute: () =>
              markNoteUsed({
                noteId: sourceNoteId,
                usedAt: noteUsedAt,
              }),
          });
          promoteCachedNoteToUsed(queryClient, {
            noteId: sourceNoteId,
            usedAt: noteUsedAt,
          });
        }

        await Promise.all([
          queryClient.invalidateQueries({ queryKey: foodProductsQueryKeys.root }),
          queryClient.invalidateQueries({ queryKey: ['feature', 'quickTracks'] }),
          queryClient.invalidateQueries({ queryKey: ['feature', 'foodProductCategorySuggestions'] }),
          queryClient.invalidateQueries({ queryKey: ['feature', 'visitPhotos'] }),
          queryClient.invalidateQueries({ queryKey: ['feature', 'usage', 'monthly'] }),
        ]);
        showQueuedOfflineAlert('Food product');
        navigation.navigate('Home');
        return;
      }

      const invalidations: Promise<unknown>[] = [
        queryClient.invalidateQueries({ queryKey: foodProductsQueryKeys.root }),
        queryClient.invalidateQueries({ queryKey: ['feature', 'quickTracks'] }),
        queryClient.invalidateQueries({ queryKey: ['feature', 'foodProductCategorySuggestions'] }),
        queryClient.invalidateQueries({ queryKey: ['feature', 'visitPhotos'] }),
        queryClient.invalidateQueries({ queryKey: ['feature', 'usage', 'monthly'] }),
      ];

      if (sourceNoteId) {
        if (noteUsedAt) {
          promoteCachedNoteToUsed(queryClient, {
            noteId: sourceNoteId,
            usedAt: noteUsedAt,
          });
        }
        invalidations.push(queryClient.invalidateQueries({ queryKey: ['feature', 'notes'] }));
        invalidations.push(queryClient.invalidateQueries({ queryKey: ['feature', 'note', sourceNoteId] }));
        invalidations.push(queryClient.invalidateQueries({ queryKey: notesQueryKeys.detail(sourceNoteId) }));
      }

      await Promise.all(invalidations);
      await Promise.all([
        AsyncStorage.setItem(FOOD_PRODUCT_RATED_BEFORE_KEY, '1'),
        AsyncStorage.setItem(LEGACY_QUICK_TRACK_RATED_BEFORE_KEY, '1'),
      ]);
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
          source: 'FoodProductScreen',
          used: limitPayload.used,
          userTier: limitPayload.userTier ?? null,
        });
      }
      const message = limitPayload
        ? formatLimitExceededMessage(limitPayload)
        : error instanceof Error
          ? error.message
          : 'Could not save food product.';
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    if (returnToPrevious && navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    if (sourceNoteId) {
      navigation.navigate('Notes');
      return;
    }

    navigation.navigate('AddVisit');
  };

  const photoInputAttachments = photo
    ? [
        {
          id: photo.uri,
          name: photo.name,
          uri: photo.uri,
          accessibilityLabel: 'View attached photo full screen',
          onPress: () => {
            setIsPhotoViewerVisible(true);
          },
          onRemove: () => {
            setIsPhotoViewerVisible(false);
            setDetectedItemDateValue(null);
            setPhoto(null);
          },
        },
      ]
    : [];

  return (
    <FeatureFormScreenScaffold
      keyboardAware
      onBackPress={handleCancel}
      primaryAction={{
        label: 'Save Product',
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
      subtitle="Rate a grocery, convenience-store, or market item."
      testID="food-product-screen"
      title="Food Product"
    >
      <View style={styles.body}>
        <PageErrorToast errorMessage={errorMessage} title="Food product failed" />

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
          <LinkedNoteCard
            isLoading={linkedNoteQuery.isLoading}
            note={linkedNoteQuery.data}
            testID="linked-note-card"
          />
        ) : null}

        <FoodProductFormFields
          detectedDateValue={detectedItemDateValue}
          onChange={(updates) => {
            setForm((currentForm) => ({
              ...currentForm,
              ...updates,
            }));
          }}
          photoSection={
            <PhotoInputField
              attachments={photoInputAttachments}
              cameraSubtitle="Camera"
              cameraTitle="Take Photo"
              countLabel={photo ? '1/1' : '0/1'}
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
              label="Photo (Optional)"
              onCameraPress={() => {
                void handlePhotoPick('camera');
              }}
              onGalleryPress={() => {
                void handlePhotoPick('gallery');
              }}
            />
          }
          ratingLegendInitiallyExpanded={!hasRatedBefore}
          ratingTestIDPrefix="food-product-rating"
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
