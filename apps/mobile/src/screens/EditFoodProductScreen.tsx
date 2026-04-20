import * as ImagePicker from 'expo-image-picker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Platform, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  EmptyState,
  ErrorState,
  FeatureFormScreenScaffold,
  PageErrorToast,
  PhotoInputField,
  PhotoViewerModal,
  FoodProductFormFields,
  Skeleton,
  UpgradePromptCard,
} from '../components/shared';
import {
  buildPocketBaseFileUrl,
  formatLimitExceededMessage,
  getFoodProductById,
  homeFeedQueryKeys,
  listFoodProductPhotos,
  parseLimitExceededError,
  updateFoodProduct,
  useMonthlyUsage,
  type VisitPhotoRecord,
  type VisitPhotoUploadInput,
} from '../features';
import { foodProductsQueryKeys } from '../features/store/foodProductsQuery';
import { useOfflineAwareFeatureWrite } from '../features/store/useOfflineAwareFeatureWrite';
import { usePhotoPickerPermissions } from '../hooks/usePhotoPickerPermissions';
import { formatDateToLocalDateString } from '../lib/dateFormatting';
import { showQueuedOfflineAlert } from '../lib/offlineAlerts';
import { buildLocalPhotoFile } from '../lib/photoFiles';
import { resolvePhotoCaptureDate } from '../lib/photoMetadata';
import {
  buildDefaultFoodProductForm,
  buildFoodProductFormFromRecord,
  buildUpdateFoodProductInput,
  validateFoodProductForm,
  type FoodProductFormValues,
} from '../lib/foodProductForm';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { createThemedStyles } from '../theme';
import { Button, Card, Text } from '../ui';

type EditFoodProductScreenProps = NativeStackScreenProps<RootStackParamList, 'EditFoodProduct'>;
type PhotoSource = 'camera' | 'gallery';
type PhotoDraftMode = 'keep' | 'replace' | 'remove';

const FREE_MONTHLY_PHOTO_LIMIT = 5;
const FREE_MONTHLY_PHOTO_WARNING_THRESHOLD = 1;

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

function buildExistingPhotoAttachment(photo: VisitPhotoRecord) {
  return {
    id: photo.id,
    name: photo.photo,
    thumbnailUri: buildPocketBaseFileUrl({
      collectionId: photo.collectionId,
      collectionName: photo.collectionName ?? 'visit_photos',
      recordId: photo.id,
      filename: photo.photo,
      thumb: '100x100',
    }),
    viewerUri: buildPocketBaseFileUrl({
      collectionId: photo.collectionId,
      collectionName: photo.collectionName ?? 'visit_photos',
      recordId: photo.id,
      filename: photo.photo,
    }),
  };
}

export function EditFoodProductScreen({ navigation, route }: EditFoodProductScreenProps) {
  const { foodProductId } = route.params;
  const legacyFoodProductId = foodProductId;
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
  const restoredPendingPickerForFoodProductRef = useRef<string | null>(null);

  const shouldEnforceUsageLimitsClientSide = !isActualAdmin;
  const estimatedFreePhotoRemaining = isDisplayFreeUser
    ? monthlyUsage.snapshot?.remaining.photoUploadsMonthly ?? null
    : null;
  const shouldShowPhotoUpgradePrompt =
    isDisplayFreeUser &&
    typeof estimatedFreePhotoRemaining === 'number' &&
    estimatedFreePhotoRemaining <= FREE_MONTHLY_PHOTO_WARNING_THRESHOLD;

  const foodProductQuery = useQuery({
    queryKey: foodProductsQueryKeys.detail(foodProductId),
    queryFn: ({ signal }) => getFoodProductById(foodProductId, { signal }),
  });
  const foodProductPhotosQuery = useQuery({
    queryKey: ['feature', 'visitPhotos', 'foodProduct', foodProductId],
    queryFn: ({ signal }) => listFoodProductPhotos(foodProductId, { signal }),
    enabled: Boolean(foodProductId),
  });

  const [form, setForm] = useState<FoodProductFormValues>(() => buildDefaultFoodProductForm());
  const [hydratedFoodProductId, setHydratedFoodProductId] = useState<string | null>(null);
  const [detectedItemDateValue, setDetectedItemDateValue] = useState<string | null>(null);
  const [photoDraftMode, setPhotoDraftMode] = useState<PhotoDraftMode>('keep');
  const [replacementPhoto, setReplacementPhoto] = useState<VisitPhotoUploadInput | null>(null);
  const [previousDateBeforePhotoDraft, setPreviousDateBeforePhotoDraft] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPhotoViewerVisible, setIsPhotoViewerVisible] = useState(false);
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
    setForm(buildDefaultFoodProductForm());
    setHydratedFoodProductId(null);
    setDetectedItemDateValue(null);
    setPhotoDraftMode('keep');
    setReplacementPhoto(null);
    setPreviousDateBeforePhotoDraft(null);
    setIsPhotoViewerVisible(false);
    setErrorMessage(null);
    restoredPendingPickerForFoodProductRef.current = null;
  }, [legacyFoodProductId]);

  useEffect(() => {
    if (!foodProductQuery.data || hydratedFoodProductId === foodProductQuery.data.id) {
      return;
    }

    setForm(buildFoodProductFormFromRecord(foodProductQuery.data));
    setDetectedItemDateValue(null);
    setPhotoDraftMode('keep');
    setReplacementPhoto(null);
    setPreviousDateBeforePhotoDraft(null);
    setErrorMessage(null);
    setIsPhotoViewerVisible(false);
    setHydratedFoodProductId(foodProductQuery.data.id);
  }, [hydratedFoodProductId, foodProductQuery.data]);

  const primaryExistingPhoto = foodProductPhotosQuery.data?.[0] ?? null;
  const extraLegacyPhotoCount = Math.max((foodProductPhotosQuery.data?.length ?? 0) - 1, 0);

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

  const applyReplacementPhoto = useCallback(async (asset: ImagePicker.ImagePickerAsset) => {
    const nextPhoto = buildDraftPhotoInput(asset);
    if (!nextPhoto) {
      throw new Error('Could not read the selected image.');
    }

    setPreviousDateBeforePhotoDraft((currentValue) => currentValue ?? form.date);
    setDetectedItemDateValue(null);
    await applyPhotoCaptureDate(asset);
    setIsPhotoViewerVisible(false);
    setReplacementPhoto(nextPhoto);
    setPhotoDraftMode('replace');
    resetPhotoPermissionNeedsSettings();
  }, [applyPhotoCaptureDate, form.date, resetPhotoPermissionNeedsSettings]);

  useEffect(() => {
    if (
      Platform.OS !== 'android' ||
      hydratedFoodProductId !== legacyFoodProductId ||
      restoredPendingPickerForFoodProductRef.current === legacyFoodProductId
    ) {
      return;
    }

    let isMounted = true;
    restoredPendingPickerForFoodProductRef.current = legacyFoodProductId;

    const restorePendingPickerResult = async () => {
      try {
        const pendingResult = await ImagePicker.getPendingResultAsync();
        if (!isMounted || !pendingResult || 'code' in pendingResult || pendingResult.canceled) {
          return;
        }

        const pendingAsset = pendingResult.assets?.[0];
        if (!pendingAsset) {
          return;
        }

        await applyReplacementPhoto(pendingAsset);
        trackObservabilityEvent('QUICK_TRACK_PHOTO_PICKED', {
          photoSource: 'gallery',
          restoredPendingResult: true,
          source: 'EditFoodProductScreen',
        });
      } catch (error) {
        trackObservabilityEvent('QUICK_TRACK_PHOTO_PICK_FAILED', {
          errorMessage: error instanceof Error ? error.message : String(error),
          errorType: error instanceof Error ? error.name : 'unknown_error',
          photoSource: 'gallery',
          restoredPendingResult: true,
          source: 'EditFoodProductScreen',
        });
      }
    };

    void restorePendingPickerResult();
    return () => {
      isMounted = false;
    };
  }, [applyReplacementPhoto, hydratedFoodProductId, legacyFoodProductId]);

  const displayedPhoto = useMemo(() => {
    if (photoDraftMode === 'replace' && replacementPhoto) {
      return {
        id: replacementPhoto.uri,
        name: replacementPhoto.name,
        thumbnailUri: replacementPhoto.uri,
        viewerUri: replacementPhoto.uri,
      };
    }

    if (photoDraftMode === 'keep' && primaryExistingPhoto) {
      return buildExistingPhotoAttachment(primaryExistingPhoto);
    }

    return null;
  }, [photoDraftMode, primaryExistingPhoto, replacementPhoto]);

  const handleRemoveDisplayedPhoto = useCallback(() => {
    setIsPhotoViewerVisible(false);

    if (photoDraftMode === 'replace') {
      if (
        detectedItemDateValue &&
        previousDateBeforePhotoDraft &&
        form.date === detectedItemDateValue
      ) {
        setForm((currentForm) => ({
          ...currentForm,
          date: previousDateBeforePhotoDraft,
        }));
      }

      setDetectedItemDateValue(null);
      setPreviousDateBeforePhotoDraft(null);
      setReplacementPhoto(null);
      setPhotoDraftMode(primaryExistingPhoto ? 'keep' : 'remove');
      return;
    }

    setDetectedItemDateValue(null);
    setPreviousDateBeforePhotoDraft(null);
    setPhotoDraftMode('remove');
  }, [
    detectedItemDateValue,
    form.date,
    photoDraftMode,
    previousDateBeforePhotoDraft,
    primaryExistingPhoto,
  ]);

  const handlePhotoPick = async (source: PhotoSource) => {
    trackObservabilityEvent('QUICK_TRACK_PHOTO_PICK_STARTED', {
      photoSource: source,
      source: 'EditFoodProductScreen',
    });
    setErrorMessage(null);
    resetPhotoPermissionNeedsSettings();

    if (shouldEnforceUsageLimitsClientSide && isDisplayFreeUser && estimatedFreePhotoRemaining === 0) {
        trackObservabilityEvent('USAGE_LIMIT_REACHED', {
          enforcement: 'client_estimate',
          limit: FREE_MONTHLY_PHOTO_LIMIT,
          metric: 'photo_uploads',
          remaining: estimatedFreePhotoRemaining,
          source: 'EditFoodProductScreen',
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
          source: 'EditFoodProductScreen',
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
          source: 'EditFoodProductScreen',
        });
        return;
      }

      const selectedAsset = pickerResult.assets?.[0];
      if (!selectedAsset) {
        throw new Error('Could not read the selected image.');
      }

      await applyReplacementPhoto(selectedAsset);
      trackObservabilityEvent('QUICK_TRACK_PHOTO_PICKED', {
        photoSource: source,
        source: 'EditFoodProductScreen',
      });
    } catch (error) {
      trackObservabilityEvent('QUICK_TRACK_PHOTO_PICK_FAILED', {
        errorMessage: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.name : 'unknown_error',
        photoSource: source,
        source: 'EditFoodProductScreen',
      });
      setErrorMessage(error instanceof Error ? error.message : 'Could not select a photo.');
    }
  };

  const handleBackPress = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    navigation.navigate('Home');
  };

  const handleSave = async () => {
    const validationMessage = validateFoodProductForm(form);
    if (validationMessage) {
      trackObservabilityEvent('EDIT_QUICK_TRACK_SUBMIT_VALIDATION_FAILED', {
        source: 'EditFoodProductScreen',
        foodProductId: legacyFoodProductId,
        reason:
          validationMessage === 'Food product name is required.'
            ? 'missing_item'
            : validationMessage === 'Please choose a valid date.'
              ? 'invalid_item_date'
              : 'invalid_form',
      });
      setErrorMessage(validationMessage);
      return;
    }

    if (shouldEnforceUsageLimitsClientSide && isDisplayFreeUser && replacementPhoto && monthlyUsage.snapshot) {
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
          source: 'EditFoodProductScreen',
          used: monthlyUsage.snapshot.usage.photoUploads,
        });
        setErrorMessage(
          `Free users can upload up to ${FREE_MONTHLY_PHOTO_LIMIT} photos per month. Remaining estimate: ${remaining}.`,
        );
        return;
      }
    }

    const deletePhotoIds =
      primaryExistingPhoto && (photoDraftMode === 'replace' || photoDraftMode === 'remove')
        ? [primaryExistingPhoto.id]
        : [];
    const foodProductUpdateInput = buildUpdateFoodProductInput(form, {
      newPhoto: photoDraftMode === 'replace' ? replacementPhoto ?? undefined : undefined,
      deletePhotoIds,
    });

    setErrorMessage(null);
    trackObservabilityEvent('EDIT_QUICK_TRACK_SUBMIT_STARTED', {
      source: 'EditFoodProductScreen',
      foodProductId: legacyFoodProductId,
      isOnline,
      hasNotes: form.notes.trim().length > 0,
      visibility: form.visibility,
      photoMode: photoDraftMode,
      hasPrimaryPhoto: Boolean(primaryExistingPhoto),
      extraLegacyPhotoCount,
    });
    setIsSubmitting(true);

    try {
      const updateResult = await writeFeature({
        operationName: 'food-product.update',
        offline: {
          strategy: 'outbox',
          payload: {
            foodProductId: legacyFoodProductId,
            updates: foodProductUpdateInput,
          },
        },
        execute: () => updateFoodProduct(legacyFoodProductId, foodProductUpdateInput),
      });

      const invalidations: Promise<unknown>[] = [
        queryClient.invalidateQueries({ queryKey: homeFeedQueryKeys.root }),
        queryClient.invalidateQueries({ queryKey: foodProductsQueryKeys.root }),
        queryClient.invalidateQueries({ queryKey: foodProductsQueryKeys.detail(foodProductId) }),
        queryClient.invalidateQueries({ queryKey: ['feature', 'visitPhotos'] }),
        queryClient.invalidateQueries({ queryKey: ['feature', 'visitPhotos', 'foodProduct', foodProductId] }),
        queryClient.invalidateQueries({ queryKey: ['feature', 'foodProductCategorySuggestions'] }),
      ];

      if (updateResult.status === 'queued') {
        await Promise.all(invalidations);
        trackObservabilityEvent('EDIT_QUICK_TRACK_SUBMIT_SUCCEEDED', {
          source: 'EditFoodProductScreen',
          foodProductId: legacyFoodProductId,
          queued: true,
          visibility: form.visibility,
          photoMode: photoDraftMode,
        });
        showQueuedOfflineAlert('Food product update');
        handleBackPress();
        return;
      }

      if (replacementPhoto) {
        invalidations.push(queryClient.invalidateQueries({ queryKey: ['feature', 'usage', 'monthly'] }));
      }

      await Promise.all(invalidations);
      trackObservabilityEvent('EDIT_QUICK_TRACK_SUBMIT_SUCCEEDED', {
        source: 'EditFoodProductScreen',
        foodProductId: legacyFoodProductId,
        queued: false,
        visibility: form.visibility,
        photoMode: photoDraftMode,
      });
      handleBackPress();
    } catch (error) {
      const limitPayload = parseLimitExceededError(error);
      if (limitPayload) {
        trackObservabilityEvent('USAGE_LIMIT_REACHED', {
          enforcement: 'server',
          limit: limitPayload.limit,
          metric: limitPayload.metric,
          monthKey: limitPayload.monthKey,
          remaining: limitPayload.remaining,
          source: 'EditFoodProductScreen',
          used: limitPayload.used,
          userTier: limitPayload.userTier ?? null,
        });
      }
      const message = limitPayload
        ? formatLimitExceededMessage(limitPayload)
        : error instanceof Error
          ? error.message
          : 'Could not update food product.';
      setErrorMessage(message);
      trackObservabilityEvent('EDIT_QUICK_TRACK_SUBMIT_FAILED', {
        source: 'EditFoodProductScreen',
        foodProductId: legacyFoodProductId,
        error: message,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const photoInputAttachments = displayedPhoto
    ? [
        {
          id: displayedPhoto.id,
          name: displayedPhoto.name,
          uri: displayedPhoto.thumbnailUri,
          accessibilityLabel: 'View attached photo full screen',
          onPress: () => {
            setIsPhotoViewerVisible(true);
          },
          onRemove: handleRemoveDisplayedPhoto,
        },
      ]
    : [];

  if (foodProductQuery.isLoading) {
    return (
      <FeatureFormScreenScaffold
        onBackPress={handleBackPress}
        primaryAction={{
          label: 'Save Changes',
          disabled: true,
          onPress: () => {},
        }}
        secondaryAction={{
          label: 'Cancel',
          onPress: handleBackPress,
        }}
        title="Edit Food Product"
      >
        <Skeleton height={20} />
        <Skeleton height={20} />
        <Skeleton height={20} />
        <Skeleton height={20} />
      </FeatureFormScreenScaffold>
    );
  }

  if (foodProductQuery.isError) {
    return (
      <FeatureFormScreenScaffold
        onBackPress={handleBackPress}
        primaryAction={{
          label: 'Save Changes',
          disabled: true,
          onPress: () => {},
        }}
        secondaryAction={{
          label: 'Cancel',
          onPress: handleBackPress,
        }}
        subtitle="Update the saved details for this food product."
        title="Edit Food Product"
      >
        <ErrorState
          description="Could not load food product."
          onRetry={() => {
            void foodProductQuery.refetch();
          }}
          title="Food product unavailable"
        />
      </FeatureFormScreenScaffold>
    );
  }

  if (!foodProductQuery.data) {
    return (
      <FeatureFormScreenScaffold
        onBackPress={handleBackPress}
        primaryAction={{
          label: 'Save Changes',
          disabled: true,
          onPress: () => {},
        }}
        secondaryAction={{
          label: 'Cancel',
          onPress: handleBackPress,
        }}
        subtitle="Update the saved details for this food product."
        title="Edit Food Product"
      >
        <EmptyState
          actionLabel="Back to Home"
          onAction={() => {
            navigation.navigate('Home');
          }}
          title="Food product not found"
        />
      </FeatureFormScreenScaffold>
    );
  }

  return (
    <FeatureFormScreenScaffold
      keyboardAware
      onBackPress={handleBackPress}
      primaryAction={{
        label: 'Save Changes',
        disabled: isSubmitting || !form.itemName.trim(),
        loading: isSubmitting,
        onPress: () => {
          void handleSave();
        },
      }}
      secondaryAction={{
        label: 'Cancel',
        disabled: isSubmitting,
        onPress: handleBackPress,
      }}
      subtitle="Update the saved details for this food product."
      testID="food-product-edit-screen"
      title="Edit Food Product"
    >
      <View style={styles.body}>
        <PageErrorToast errorMessage={errorMessage} title="Could not save food product" />

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

        {foodProductPhotosQuery.isError ? (
          <Card style={styles.sectionCard} tone="muted">
            <Text tone="warning">
              Could not load the current food product photo. You can still upload a new one.
            </Text>
          </Card>
        ) : null}

        {extraLegacyPhotoCount > 0 ? (
          <Card style={styles.sectionCard} tone="muted">
            <Text tone="secondary">
              This food product has additional linked photos. Editing here changes only the primary photo and keeps the
              other {extraLegacyPhotoCount === 1 ? 'photo' : 'photos'} attached.
            </Text>
          </Card>
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
              countLabel={displayedPhoto ? '1/1' : '0/1'}
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
          ratingLegendInitiallyExpanded={false}
          ratingTestIDPrefix="edit-food-product-rating"
          value={form}
        />
      </View>
      <PhotoViewerModal
        onRequestClose={() => {
          setIsPhotoViewerVisible(false);
        }}
        previewUrls={displayedPhoto ? [displayedPhoto.thumbnailUri] : []}
        urls={displayedPhoto ? [displayedPhoto.viewerUri] : []}
        visible={Boolean(displayedPhoto) && isPhotoViewerVisible}
      />
    </FeatureFormScreenScaffold>
  );
}
