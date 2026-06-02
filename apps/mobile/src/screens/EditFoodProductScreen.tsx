import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';

import {
  EmptyState,
  ErrorState,
  FeatureFormScreenScaffold,
  LightweightStatusCard,
  OFFLINE_USAGE_WARNING_MESSAGE,
  PageErrorToast,
  PhotoInputField,
  PhotoViewerModal,
  FoodProductFormFields,
  Skeleton,
} from '../components/shared';
import {
  getFoodProductById,
  listFoodProductPhotos,
  useMonthlyUsage,
  type VisitPhotoRecord,
} from '../features';
import { submitEditFoodProductEditor } from '../features/foodProducts/foodProductEditorSubmissionLifecycle';
import {
  useFoodProductEditorPhotoDraft,
} from '../features/foodProducts/useFoodProductEditorPhotoDraft';
import { buildPhotoFileUrl, buildPhotoThumbnailUrl } from '../lib/photoUrls';
import { foodProductsQueryKeys } from '../features/store/foodProductsQuery';
import { useFoodProductWrites } from '../features/store/useFoodProductWrites';
import { visitPhotosQueryKeys } from '../features/store/visitPhotosQuery';
import {
  formatPhotoAttachmentDateLabel,
  formatStoredCalendarDateLabel,
} from '../lib/dateFormatting';
import {
  buildDefaultFoodProductForm,
  buildFoodProductFormFromRecord,
  type FoodProductFormValues,
} from '../lib/foodProductForm';
import { buildFoodProductCreatedHomeParams } from '../navigation/homeRouteParams';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import type { TrackingEntryProperties } from '../observability/productAnalytics';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { createThemedStyles } from '../theme';
import { Button, Text } from '../ui';

type EditFoodProductScreenProps = NativeStackScreenProps<RootStackParamList, 'EditFoodProduct'>;
type FoodProductEditorExitMethod =
  | 'header_back'
  | 'secondary_cancel'
  | 'system_back_or_gesture'
  | 'programmatic_navigation';

const useStyles = createThemedStyles((theme) => ({
  body: {
    gap: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  sectionCard: {
    gap: theme.spacing.sm,
  },
}));

function buildExistingPhotoAttachment(photo: VisitPhotoRecord, itemDate?: string) {
  return {
    id: photo.id,
    label: itemDate
      ? formatStoredCalendarDateLabel(itemDate)
      : formatPhotoAttachmentDateLabel(photo.created),
    thumbnailUri: buildPhotoThumbnailUrl(photo),
    viewerUri: buildPhotoFileUrl(photo),
  };
}

export function EditFoodProductScreen({ navigation, route }: EditFoodProductScreenProps) {
  const { exitToHomeOnClose, foodProductId } = route.params;
  const styles = useStyles();
  const foodProductWrites = useFoodProductWrites();
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
  const shouldEnforceUsageLimitsClientSide = !isActualAdmin;

  const foodProductQuery = useQuery({
    queryKey: foodProductsQueryKeys.detail(foodProductId),
    queryFn: ({ signal }) => getFoodProductById(foodProductId, { signal }),
  });
  const foodProductPhotosQuery = useQuery({
    queryKey: visitPhotosQueryKeys.foodProduct(foodProductId),
    queryFn: ({ signal }) => listFoodProductPhotos(foodProductId, { signal }),
    enabled: Boolean(foodProductId),
  });

  const [form, setForm] = useState<FoodProductFormValues>(() => buildDefaultFoodProductForm());
  const [hydratedFoodProductId, setHydratedFoodProductId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const hasTrackedEditorOpenRef = useRef(false);
  const hasTrackedEditorExitRef = useRef(false);
  const hasCompletedEditorFlowRef = useRef(false);
  const exitMethodRef = useRef<FoodProductEditorExitMethod | null>(null);
  useEffect(() => {
    setForm(buildDefaultFoodProductForm());
    setHydratedFoodProductId(null);
    setErrorMessage(null);
  }, [foodProductId]);

  useEffect(() => {
    if (!foodProductQuery.data || hydratedFoodProductId === foodProductQuery.data.id) {
      return;
    }

    setForm(buildFoodProductFormFromRecord(foodProductQuery.data));
    setErrorMessage(null);
    setHydratedFoodProductId(foodProductQuery.data.id);
  }, [hydratedFoodProductId, foodProductQuery.data]);

  const primaryExistingPhoto = foodProductPhotosQuery.data?.[0] ?? null;
  const existingPhotoAttachment = useMemo(
    () =>
      primaryExistingPhoto
        ? buildExistingPhotoAttachment(primaryExistingPhoto, foodProductQuery.data?.itemDate)
        : null,
    [foodProductQuery.data?.itemDate, primaryExistingPhoto],
  );
  const photoTrackingProperties: TrackingEntryProperties = useMemo(
    () => ({
      entryType: 'food_product',
      source: 'add_tab',
      hasPhoto: true,
      itemCount: 1,
      ratingCount: form.rating > 0 ? 1 : 0,
      visibility: form.visibility,
      completed: false,
    }),
    [form.rating, form.visibility],
  );
  const photoDraft = useFoodProductEditorPhotoDraft({
    analyticsSource: 'EditFoodProductScreen',
    currentDateValue: form.date,
    emptyInitialPhotoMode: 'keep',
    existingPhoto: existingPhotoAttachment,
    isDisplayFreeUser,
    monthlyUsageSnapshot: monthlyUsage.snapshot,
    onCaptureDateDetected: (dateValue) => {
      setForm((currentForm) => ({
        ...currentForm,
        date: dateValue,
      }));
    },
    onCaptureDateRestored: (dateValue) => {
      setForm((currentForm) => ({
        ...currentForm,
        date: dateValue,
      }));
    },
    pendingPickerRestoreKey: hydratedFoodProductId === foodProductId ? foodProductId : null,
    resetKey: foodProductId,
    shouldEnforceUsageLimitsClientSide,
    trackingProperties: photoTrackingProperties,
  });
  const displayedPhoto = photoDraft.displayedPhoto;
  const replacementPhoto = photoDraft.photo;
  const photoDraftMode = photoDraft.photoMode;
  const shouldHidePhotoSourceActions = photoDraft.hideSourceActions;
  const photoQuotaStatusMessage = photoDraft.quotaStatusMessage;

  useEffect(() => {
    if (photoDraft.errorMessage) {
      setErrorMessage(photoDraft.errorMessage);
    }
  }, [photoDraft.errorMessage]);

  const handleBackPress = () => {
    if (exitToHomeOnClose) {
      navigation.navigate('Home', buildFoodProductCreatedHomeParams());
      return;
    }

    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    navigation.navigate('Home');
  };

  const handleSave = async () => {
    setErrorMessage(null);
    setIsSubmitting(true);

    const result = await submitEditFoodProductEditor({
      foodProductId,
      foodProductWrites,
      form,
      isDisplayFreeUser,
      isOnline,
      monthlyUsageSnapshot: monthlyUsage.snapshot,
      photoMode: photoDraftMode,
      primaryExistingPhotoId: primaryExistingPhoto?.id,
      replacementPhoto,
      shouldEnforceUsageLimitsClientSide,
      source: 'EditFoodProductScreen',
    });

    setIsSubmitting(false);

    if (result.status === 'blocked' || result.status === 'failed') {
      setErrorMessage(result.errorMessage);
      return;
    }

    hasCompletedEditorFlowRef.current = true;
    handleBackPress();
  };

  const photoInputAttachments = displayedPhoto
    ? [
        {
          id: displayedPhoto.id,
          label: displayedPhoto.label,
          uri: displayedPhoto.thumbnailUri,
          accessibilityLabel: 'View attached photo full screen',
          onPress: () => {
            photoDraft.openViewer();
          },
          onRemove: photoDraft.removePhoto,
        },
      ]
    : [];
  const hasUnsavedChanges = useMemo(() => {
    if (!foodProductQuery.data) {
      return false;
    }

    const initialForm = buildFoodProductFormFromRecord(foodProductQuery.data);
    return (
      form.itemName.trim() !== initialForm.itemName.trim() ||
      form.category.trim() !== initialForm.category.trim() ||
      form.notes.trim() !== initialForm.notes.trim() ||
      form.locationText.trim() !== initialForm.locationText.trim() ||
      form.date !== initialForm.date ||
      form.rating !== initialForm.rating ||
      form.visibility !== initialForm.visibility ||
      photoDraftMode !== 'keep'
    );
  }, [foodProductQuery.data, form, photoDraftMode]);
  const buildEditorAnalyticsPayload = useCallback(
    (overrides?: Record<string, string | number | boolean | null>) => ({
      source: 'EditFoodProductScreen',
      mode: 'edit',
      hasName: Boolean(form.itemName.trim()),
      hasRating: form.rating > 0,
      photoCount: displayedPhoto ? 1 : 0,
      hasUnsavedChanges,
      ...overrides,
    }),
    [displayedPhoto, form.itemName, form.rating, hasUnsavedChanges],
  );

  useEffect(() => {
    if (hasTrackedEditorOpenRef.current || !foodProductQuery.data) {
      return;
    }

    hasTrackedEditorOpenRef.current = true;
    trackObservabilityEvent('FOOD_PRODUCT_EDITOR_OPENED', buildEditorAnalyticsPayload());
  }, [buildEditorAnalyticsPayload, foodProductQuery.data]);

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

  if (foodProductQuery.isLoading) {
    return (
      <FeatureFormScreenScaffold
        onBackPress={() => {
          exitMethodRef.current = 'header_back';
          handleBackPress();
        }}
        primaryAction={{
          label: 'Save Changes',
          disabled: true,
          onPress: () => {},
        }}
        secondaryAction={{
          label: 'Cancel',
          onPress: () => {
            exitMethodRef.current = 'secondary_cancel';
            handleBackPress();
          },
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
        onBackPress={() => {
          exitMethodRef.current = 'header_back';
          handleBackPress();
        }}
        primaryAction={{
          label: 'Save Changes',
          disabled: true,
          onPress: () => {},
        }}
        secondaryAction={{
          label: 'Cancel',
          onPress: () => {
            exitMethodRef.current = 'secondary_cancel';
            handleBackPress();
          },
        }}
        subtitle="Update the saved details for this food product."
        title="Edit Food Product"
      >
        <ErrorState
          analyticsProps={buildEditorAnalyticsPayload()}
          analyticsSource="EditFoodProductScreen"
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
        onBackPress={() => {
          exitMethodRef.current = 'header_back';
          handleBackPress();
        }}
        primaryAction={{
          label: 'Save Changes',
          disabled: true,
          onPress: () => {},
        }}
        secondaryAction={{
          label: 'Cancel',
          onPress: () => {
            exitMethodRef.current = 'secondary_cancel';
            handleBackPress();
          },
        }}
        subtitle="Update the saved details for this food product."
        title="Edit Food Product"
      >
        <EmptyState
          actionLabel="Back to Home"
          analyticsProps={buildEditorAnalyticsPayload()}
          analyticsSource="EditFoodProductScreen"
          onAction={() => {
            exitMethodRef.current = 'programmatic_navigation';
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
      onBackPress={() => {
        exitMethodRef.current = 'header_back';
        handleBackPress();
      }}
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
        onPress: () => {
          exitMethodRef.current = 'secondary_cancel';
          handleBackPress();
        },
      }}
      subtitle="Update the saved details for this food product."
      testID="food-product-edit-screen"
      title="Edit Food Product"
    >
      <View style={styles.body}>
        <PageErrorToast
          analyticsProps={buildEditorAnalyticsPayload()}
          analyticsSource="EditFoodProductScreen"
          errorMessage={errorMessage}
          title="Could not save food product"
        />

        {!isOnline && isDisplayFreeUser ? (
          <LightweightStatusCard message={OFFLINE_USAGE_WARNING_MESSAGE} style={styles.sectionCard} />
        ) : null}

        {foodProductPhotosQuery.isError ? (
          <LightweightStatusCard
            message="Could not load the current food product photo. You can still upload a new one."
            style={styles.sectionCard}
          />
        ) : null}

        <FoodProductFormFields
          detectedDateValue={photoDraft.detectedDateValue}
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
              countLabel={photoDraft.countLabel}
              disabled={isSubmitting}
              footerAction={
                photoQuotaStatusMessage ? (
                  <Text tone="secondary" variant="bodySm">
                    {photoQuotaStatusMessage}
                  </Text>
                ) : photoDraft.permissionNeedsSettings ? (
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
                void photoDraft.pickPhoto('camera');
              }}
              onGalleryPress={() => {
                void photoDraft.pickPhoto('gallery');
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
          photoDraft.closeViewer();
        }}
        previewUrls={displayedPhoto ? [displayedPhoto.thumbnailUri] : []}
        urls={displayedPhoto ? [displayedPhoto.viewerUri] : []}
        visible={Boolean(displayedPhoto) && photoDraft.isViewerVisible}
      />
    </FeatureFormScreenScaffold>
  );
}
