import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Platform, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  FeatureFormScreenScaffold,
  LinkedNoteCard,
  PageErrorToast,
  PhotoInputField,
  PhotoViewerModal,
  FoodProductFormFields,
} from '../components/shared';
import {
  createFoodProduct,
  formatLimitExceededMessage,
  getNoteDetail,
  markNoteUsed,
  parseLimitExceededError,
  promoteCachedNoteToUsed,
  useMonthlyUsage,
  type VisitPhotoUploadInput,
} from '../features';
import { syncFoodProductMutationCaches } from '../features/store/foodProductsQuery';
import { useOfflineAwareFeatureWrite } from '../features/store/useOfflineAwareFeatureWrite';
import { notesQueryKeys } from '../features/store/notesQuery';
import { usePhotoPickerPermissions } from '../hooks/usePhotoPickerPermissions';
import {
  formatDateToLocalDateString,
  formatPhotoAttachmentDateLabel,
} from '../lib/dateFormatting';
import { showQueuedOfflineAlert } from '../lib/offlineAlerts';
import { resolvePhotoCaptureDate } from '../lib/photoMetadata';
import { cleanupStagedPhotoFiles, stageLocalPhotoFile } from '../lib/photoStaging';
import {
  buildCreateFoodProductInput,
  buildDefaultFoodProductForm,
  validateFoodProductForm,
  type FoodProductFormValues,
} from '../lib/foodProductForm';
import { buildFoodProductCreatedHomeParams } from '../navigation/homeRouteParams';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { createThemedStyles } from '../theme';
import { Button, Card, Text } from '../ui';

type FoodProductScreenProps = NativeStackScreenProps<RootStackParamList, 'FoodProduct'>;
type FoodProductEditorExitMethod =
  | 'header_back'
  | 'secondary_cancel'
  | 'system_back_or_gesture'
  | 'programmatic_navigation';
interface DraftFoodProductPhoto {
  label: string;
  upload: VisitPhotoUploadInput;
}

const FOOD_PRODUCT_RATED_BEFORE_KEY = 'ui.foodProduct.hasRatedBefore';
const FREE_MONTHLY_PHOTO_LIMIT = 100;
type PhotoSource = 'camera' | 'gallery';

function formatFreeMonthlyPhotoLimitStatus(remaining: number): string {
  return `Free users can upload up to ${FREE_MONTHLY_PHOTO_LIMIT} photos per month. Remaining estimate: ${remaining}.`;
}

const useStyles = createThemedStyles((theme) => ({
  body: {
    gap: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  sectionCard: {
    gap: theme.spacing.sm,
  },
}));

async function buildDraftPhotoInput(asset: ImagePicker.ImagePickerAsset): Promise<VisitPhotoUploadInput | null> {
  return stageLocalPhotoFile(asset, {
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
  const shouldHidePhotoSourceActions =
    isDisplayFreeUser &&
    shouldEnforceUsageLimitsClientSide &&
    typeof estimatedFreePhotoRemaining === 'number' &&
    estimatedFreePhotoRemaining <= 0;
  const photoQuotaStatusMessage = shouldHidePhotoSourceActions
    ? formatFreeMonthlyPhotoLimitStatus(estimatedFreePhotoRemaining)
    : null;

  const linkedNoteQuery = useQuery({
    queryKey: notesQueryKeys.detail(sourceNoteId ?? ''),
    queryFn: ({ signal }) => (sourceNoteId ? getNoteDetail(sourceNoteId, { signal }) : Promise.resolve(null)),
    enabled: Boolean(sourceNoteId),
    select: (detail) => detail?.note ?? null,
  });
  const returnToPrevious = route.params?.returnToPrevious === true;

  const [form, setForm] = useState<FoodProductFormValues>(() => buildDefaultFoodProductForm());
  const [detectedItemDateValue, setDetectedItemDateValue] = useState<string | null>(null);
  const [photo, setPhoto] = useState<DraftFoodProductPhoto | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasRatedBefore, setHasRatedBefore] = useState(false);
  const [isPhotoViewerVisible, setIsPhotoViewerVisible] = useState(false);
  const [didApplyNotePrefill, setDidApplyNotePrefill] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const hasTrackedEditorOpenRef = useRef(false);
  const hasTrackedEditorExitRef = useRef(false);
  const hasCompletedEditorFlowRef = useRef(false);
  const exitMethodRef = useRef<FoodProductEditorExitMethod | null>(null);
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
        const foodProductValue = await AsyncStorage.getItem(FOOD_PRODUCT_RATED_BEFORE_KEY);
        if (isMounted) {
          setHasRatedBefore(foodProductValue === '1');
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

  const applyPhotoCaptureDate = useCallback((captureDate: Date | null) => {
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
        const nextUpload = pendingAsset ? await buildDraftPhotoInput(pendingAsset) : null;
        if (!nextUpload) {
          return;
        }

        const captureDate = pendingAsset
          ? await resolvePhotoCaptureDate(pendingAsset)
          : null;
        applyPhotoCaptureDate(captureDate);
        setIsPhotoViewerVisible(false);
        setPhoto({
          label: formatPhotoAttachmentDateLabel(captureDate ?? new Date()),
          upload: nextUpload,
        });
        trackObservabilityEvent('FOOD_PRODUCT_PHOTO_PICKED', {
          photoSource: 'gallery',
          restoredPendingResult: true,
          source: 'FoodProductScreen',
        });
      } catch (error) {
        trackObservabilityEvent('FOOD_PRODUCT_PHOTO_PICK_FAILED', {
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
    trackObservabilityEvent('FOOD_PRODUCT_PHOTO_PICK_STARTED', {
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
      setErrorMessage(formatFreeMonthlyPhotoLimitStatus(estimatedFreePhotoRemaining));
      return;
    }

    try {
      const permission = await requestPhotoPickerPermission(source);
      if (!permission.granted) {
        trackObservabilityEvent('FOOD_PRODUCT_PHOTO_PERMISSION_DENIED', {
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
        trackObservabilityEvent('FOOD_PRODUCT_PHOTO_PICK_CANCELED', {
          photoSource: source,
          source: 'FoodProductScreen',
        });
        return;
      }

      const selectedAsset = pickerResult.assets?.[0];
      const nextUpload = selectedAsset ? await buildDraftPhotoInput(selectedAsset) : null;
      if (!nextUpload) {
        throw new Error('Could not read the selected image.');
      }

      setDetectedItemDateValue(null);
      const captureDate = await resolvePhotoCaptureDate(selectedAsset);
      applyPhotoCaptureDate(captureDate);
      setIsPhotoViewerVisible(false);
      setPhoto({
        label: formatPhotoAttachmentDateLabel(captureDate ?? new Date()),
        upload: nextUpload,
      });
      trackObservabilityEvent('FOOD_PRODUCT_PHOTO_PICKED', {
        photoSource: source,
        source: 'FoodProductScreen',
      });
      resetPhotoPermissionNeedsSettings();
    } catch (error) {
      trackObservabilityEvent('FOOD_PRODUCT_PHOTO_PICK_FAILED', {
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
      trackObservabilityEvent('FOOD_PRODUCT_SUBMIT_VALIDATION_FAILED', {
        source: 'FoodProductScreen',
        validationMessage,
        visibility: form.visibility,
        hasPhoto: Boolean(photo),
        sourceNoteAttached: Boolean(sourceNoteId),
      });
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
    trackObservabilityEvent('FOOD_PRODUCT_SUBMIT_STARTED', {
      source: 'FoodProductScreen',
      isOnline,
      hasPhoto: Boolean(photo),
      hasNotes: form.notes.trim().length > 0,
      rating: form.rating,
      sourceNoteAttached: Boolean(sourceNoteId),
      visibility: form.visibility,
    });
    setIsSubmitting(true);

    try {
      const noteUsedAt = sourceNoteId ? new Date().toISOString() : null;
      const foodProductInput = buildCreateFoodProductInput(form, {
        photo: photo?.upload,
        sourceNoteId,
      });

      const createResult = await writeFeature({
        operationName: 'food-product.create',
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

        await syncFoodProductMutationCaches(queryClient, {
          includeUsage: Boolean(photo),
          sourceNoteId,
        });
        trackObservabilityEvent('FOOD_PRODUCT_SUBMIT_SUCCEEDED', {
          source: 'FoodProductScreen',
          queued: true,
          hasPhoto: Boolean(photo),
          sourceNoteAttached: Boolean(sourceNoteId),
          visibility: form.visibility,
        });
        hasCompletedEditorFlowRef.current = true;
        showQueuedOfflineAlert({
          analyticsSource: 'FoodProductScreen',
          subject: 'Food product',
        });
        navigation.navigate('Home', buildFoodProductCreatedHomeParams());
        return;
      }

      if (sourceNoteId) {
        if (noteUsedAt) {
          promoteCachedNoteToUsed(queryClient, {
            noteId: sourceNoteId,
            usedAt: noteUsedAt,
          });
        }
      }

      await syncFoodProductMutationCaches(queryClient, {
        foodProduct: createResult.result,
        includeUsage: Boolean(photo),
        sourceNoteId,
      });
      await cleanupStagedPhotoFiles(photo ? [photo.upload] : []);
      await AsyncStorage.setItem(FOOD_PRODUCT_RATED_BEFORE_KEY, '1');
      trackObservabilityEvent('FOOD_PRODUCT_SUBMIT_SUCCEEDED', {
        source: 'FoodProductScreen',
        queued: false,
        hasPhoto: Boolean(photo),
        sourceNoteAttached: Boolean(sourceNoteId),
        visibility: form.visibility,
      });
      hasCompletedEditorFlowRef.current = true;
      navigation.navigate('Home', buildFoodProductCreatedHomeParams());
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
      trackObservabilityEvent('FOOD_PRODUCT_SUBMIT_FAILED', {
        source: 'FoodProductScreen',
        errorMessage: message,
        errorType: error instanceof Error ? error.name : 'unknown_error',
        hasPhoto: Boolean(photo),
        isOnline,
        sourceNoteAttached: Boolean(sourceNoteId),
        visibility: form.visibility,
      });
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
          id: photo.upload.uri,
          label: photo.label,
          uri: photo.upload.uri,
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
  const hasUnsavedChanges =
    Boolean(form.itemName.trim()) ||
    Boolean(form.notes.trim()) ||
    Boolean(form.locationText.trim()) ||
    Boolean(photo) ||
    form.rating !== 3;
  const buildEditorAnalyticsPayload = useCallback(
    (overrides?: Record<string, string | number | boolean | null>) => ({
      source: 'FoodProductScreen',
      mode: 'create',
      hasName: Boolean(form.itemName.trim()),
      hasRating: form.rating > 0,
      photoCount: photo ? 1 : 0,
      hasUnsavedChanges,
      ...overrides,
    }),
    [form.itemName, form.rating, hasUnsavedChanges, photo],
  );

  useEffect(() => {
    if (hasTrackedEditorOpenRef.current) {
      return;
    }

    hasTrackedEditorOpenRef.current = true;
    trackObservabilityEvent('FOOD_PRODUCT_EDITOR_OPENED', buildEditorAnalyticsPayload());
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
        'FOOD_PRODUCT_EDITOR_EXITED',
        buildEditorAnalyticsPayload({
          exitMethod: exitMethodRef.current ?? 'system_back_or_gesture',
        }),
      );
    },
    [buildEditorAnalyticsPayload],
  );

  return (
    <FeatureFormScreenScaffold
      keyboardAware
      onBackPress={() => {
        exitMethodRef.current = 'header_back';
        handleCancel();
      }}
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
        onPress: () => {
          exitMethodRef.current = 'secondary_cancel';
          handleCancel();
        },
      }}
      subtitle="Rate a grocery, convenience-store, or market item."
      testID="food-product-screen"
      title="Food Product"
    >
      <View style={styles.body}>
        <PageErrorToast
          analyticsProps={buildEditorAnalyticsPayload()}
          analyticsSource="FoodProductScreen"
          errorMessage={errorMessage}
          title="Food product failed"
        />

        {!isOnline && isDisplayFreeUser ? (
          <Card style={styles.sectionCard} tone="muted">
            <Text tone="warning">
              Offline estimate may be stale. Backend limits are enforced when sync runs.
            </Text>
          </Card>
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
              countLabel={shouldHidePhotoSourceActions && !photo ? null : photo ? '1/1' : '0/1'}
              disabled={isSubmitting}
              footerAction={
                photoQuotaStatusMessage ? (
                  <Text tone="secondary" variant="bodySm">
                    {photoQuotaStatusMessage}
                  </Text>
                ) : photoPermissionNeedsSettings ? (
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
              hideSourceActions={shouldHidePhotoSourceActions}
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
        urls={photo ? [photo.upload.uri] : []}
        visible={Boolean(photo) && isPhotoViewerVisible}
      />
    </FeatureFormScreenScaffold>
  );
}
