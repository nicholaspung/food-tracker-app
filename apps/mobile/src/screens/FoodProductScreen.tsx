import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';

import {
  FeatureFormScreenScaffold,
  LinkedNoteCard,
  LightweightStatusCard,
  OFFLINE_USAGE_WARNING_MESSAGE,
  PageErrorToast,
  PhotoInputField,
  PhotoViewerModal,
  FoodProductFormFields,
} from '../components/shared';
import {
  getNoteDetail,
  useMonthlyUsage,
} from '../features';
import { submitCreateFoodProductEditor } from '../features/foodProducts/foodProductEditorSubmissionLifecycle';
import {
  useFoodProductEditorPhotoDraft,
} from '../features/foodProducts/useFoodProductEditorPhotoDraft';
import { useFoodProductWrites } from '../features/store/useFoodProductWrites';
import { notesQueryKeys } from '../features/store/notesQuery';
import {
  buildDefaultFoodProductForm,
  type FoodProductFormValues,
} from '../lib/foodProductForm';
import { resolveUsageViewContext } from '../lib/usageUiRules';
import { localPersistence } from '../localPersistence';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import {
  trackProductEvent,
  type TrackingEntryProperties,
} from '../observability/productAnalytics';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { createThemedStyles } from '../theme';
import { Button, Text } from '../ui';

type FoodProductScreenProps = NativeStackScreenProps<RootStackParamList, 'FoodProduct'>;
type FoodProductEditorExitMethod =
  | 'header_back'
  | 'secondary_cancel'
  | 'system_back_or_gesture'
  | 'programmatic_navigation';
const FOOD_PRODUCT_RATED_BEFORE_KEY = localPersistence.uiPreferences.keys.foodProductRatedBefore;

const useStyles = createThemedStyles((theme) => ({
  body: {
    gap: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  sectionCard: {
    gap: theme.spacing.sm,
  },
}));

export function FoodProductScreen({ navigation, route }: FoodProductScreenProps) {
  const styles = useStyles();
  const foodProductWrites = useFoodProductWrites();
  const { isOnline } = useConnectivity();
  const { actualUser, user } = useAuth();
  const {
    isDisplayFreeUser,
    shouldEnforceUsageLimitsClientSide,
    usagePreviewTier,
  } = resolveUsageViewContext({ actualUser, user });
  const monthlyUsage = useMonthlyUsage({
    viewAsTier: usagePreviewTier,
  });
  const sourceNoteId = route.params?.sourceNoteId;

  const linkedNoteQuery = useQuery({
    queryKey: notesQueryKeys.detail(sourceNoteId ?? ''),
    queryFn: ({ signal }) => (sourceNoteId ? getNoteDetail(sourceNoteId, { signal }) : Promise.resolve(null)),
    enabled: Boolean(sourceNoteId),
    select: (detail) => detail?.note ?? null,
  });
  const returnToPrevious = route.params?.returnToPrevious === true;

  const [form, setForm] = useState<FoodProductFormValues>(() => buildDefaultFoodProductForm());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasRatedBefore, setHasRatedBefore] = useState(false);
  const [didApplyNotePrefill, setDidApplyNotePrefill] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const hasTrackedEditorOpenRef = useRef(false);
  const hasTrackedEditorExitRef = useRef(false);
  const hasCompletedEditorFlowRef = useRef(false);
  const exitMethodRef = useRef<FoodProductEditorExitMethod | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadRatedBefore = async () => {
      try {
        const foodProductValue = await localPersistence.uiPreferences.storage.getItem(FOOD_PRODUCT_RATED_BEFORE_KEY);
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

  const photoTrackingProperties: TrackingEntryProperties = useMemo(
    () => ({
      entryType: 'food_product',
      source: sourceNoteId ? 'note' : 'add_tab',
      hasPhoto: true,
      itemCount: 1,
      ratingCount: form.rating > 0 ? 1 : 0,
      visibility: form.visibility,
      completed: false,
    }),
    [form.rating, form.visibility, sourceNoteId],
  );
  const handlePhotoCaptureDateDetected = useCallback((dateValue: string) => {
    setForm((currentForm) => ({
      ...currentForm,
      date: dateValue,
    }));
  }, []);
  const photoDraft = useFoodProductEditorPhotoDraft({
    analyticsSource: 'FoodProductScreen',
    isDisplayFreeUser,
    monthlyUsageSnapshot: monthlyUsage.snapshot,
    onCaptureDateDetected: handlePhotoCaptureDateDetected,
    shouldEnforceUsageLimitsClientSide,
    trackingProperties: photoTrackingProperties,
  });
  const photo = photoDraft.photo;
  const shouldHidePhotoSourceActions = photoDraft.hideSourceActions;
  const photoQuotaStatusMessage = photoDraft.quotaStatusMessage;

  useEffect(() => {
    if (photoDraft.errorMessage) {
      setErrorMessage(photoDraft.errorMessage);
    }
  }, [photoDraft.errorMessage]);

  const handleCreate = async () => {
    setErrorMessage(null);
    setIsSubmitting(true);

    const result = await submitCreateFoodProductEditor({
      foodProductWrites,
      form,
      isDisplayFreeUser,
      isOnline,
      markRatedBefore: () => localPersistence.uiPreferences.storage.setItem(FOOD_PRODUCT_RATED_BEFORE_KEY, '1'),
      monthlyUsageSnapshot: monthlyUsage.snapshot,
      photo,
      shouldEnforceUsageLimitsClientSide,
      source: 'FoodProductScreen',
      sourceNoteId,
    });

    setIsSubmitting(false);

    if (result.status === 'blocked' || result.status === 'failed') {
      setErrorMessage(result.errorMessage);
      return;
    }

    if ('destination' in result) {
      hasCompletedEditorFlowRef.current = true;
      if (result.destination.name === 'Home') {
        navigation.navigate('Home', result.destination.params);
      }
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
            photoDraft.openViewer();
          },
          onRemove: () => {
            photoDraft.removePhoto();
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
      trackProductEvent('tracking.entry_abandoned', {
        entryType: 'food_product',
        source: sourceNoteId ? 'note' : 'add_tab',
        hasPhoto: Boolean(photo),
        itemCount: Boolean(form.itemName.trim()) ? 1 : 0,
        ratingCount: form.rating > 0 ? 1 : 0,
        visibility: form.visibility,
        completed: false,
        exitMethod: exitMethodRef.current ?? 'system_back_or_gesture',
      });
    },
    [buildEditorAnalyticsPayload, form.itemName, form.rating, form.visibility, photo, sourceNoteId],
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
          <LightweightStatusCard message={OFFLINE_USAGE_WARNING_MESSAGE} style={styles.sectionCard} />
        ) : null}

        {sourceNoteId ? (
          <LinkedNoteCard
            isLoading={linkedNoteQuery.isLoading}
            note={linkedNoteQuery.data}
            testID="linked-note-card"
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
                setErrorMessage(null);
                void photoDraft.pickPhoto('camera');
              }}
              onGalleryPress={() => {
                setErrorMessage(null);
                void photoDraft.pickPhoto('gallery');
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
          photoDraft.closeViewer();
        }}
        urls={photo ? [photo.upload.uri] : []}
        visible={Boolean(photo) && photoDraft.isViewerVisible}
      />
    </FeatureFormScreenScaffold>
  );
}
