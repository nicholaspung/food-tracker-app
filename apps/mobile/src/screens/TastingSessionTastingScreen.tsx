import * as ImagePicker from 'expo-image-picker';
import { useCallback, useMemo, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import {
  ConfirmDestructiveModal,
  EmptyState,
  FeatureFormScreenScaffold,
  PageErrorToast,
  PhotoInputField,
  PhotoViewerModal,
  RatingLegend,
  VisitItemRatingCard,
} from '../components/shared';
import {
  completeTastingSession,
  submitTastingRatings,
  tastingSessionsQueryKeys,
  type TastingMenuItemRecord,
  useMonthlyUsage,
  type TastingSessionRecord,
  type VisitPhotoUploadInput,
} from '../features';
import { uploadVisitPhotos } from '../features/store/visitPhotoUploads';
import { usePhotoPickerPermissions } from '../hooks/usePhotoPickerPermissions';
import { formatPhotoAttachmentDateLabel } from '../lib/dateFormatting';
import { resolvePhotoCaptureDate } from '../lib/photoMetadata';
import { stageLocalPhotoFile } from '../lib/photoStaging';
import { resolveDisplayPhotoUploadsPerRecordLimit } from '../lib/usageUiRules';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { createThemedStyles } from '../theme';
import { Button, Modal, Text } from '../ui';
import { FREE_MONTHLY_PHOTO_LIMIT } from './createVisit/shared';
import { useTastingSessionDetail } from './tastingSessions/useTastingSessionDetail';

type TastingSessionTastingScreenProps = NativeStackScreenProps<RootStackParamList, 'TastingSessionTasting'>;

const useStyles = createThemedStyles((theme) => ({
  restaurantSection: {
    gap: theme.spacing.md,
  },
  restaurantSeparator: {
    backgroundColor: theme.colors.background.muted,
    borderRadius: theme.radii.pill,
    height: 8,
    marginBottom: theme.spacing.xs,
    marginTop: theme.spacing.md,
  },
  restaurantHeader: {
    gap: theme.spacing.xxs,
    paddingHorizontal: theme.spacing.xxs,
  },
  restaurantName: {
    color: theme.colors.text.primary,
  },
  itemList: {
    gap: theme.spacing.md,
  },
  headerSubtitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  headerSubtitleText: {
    flex: 1,
  },
  undoButton: {
    alignItems: 'center',
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.xs,
  },
  undoList: {
    gap: theme.spacing.sm,
  },
  undoRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  undoTitle: {
    flex: 1,
  },
}));

interface RatingDraft {
  included: boolean;
  photos: TastingRatingDraftPhoto[];
  rating: number;
  note: string;
}

interface TastingRatingDraftPhoto {
  id: string;
  upload: VisitPhotoUploadInput;
  thumbnailUri: string;
  viewerUri: string;
  labelDate: string;
}

function formatFreeMonthlyPhotoLimitStatus(remaining: number): string {
  return `Free users can upload up to ${FREE_MONTHLY_PHOTO_LIMIT} photos per month. Remaining estimate: ${remaining}.`;
}

export function TastingSessionTastingScreen({ navigation, route }: TastingSessionTastingScreenProps) {
  const styles = useStyles();
  const { sessionId } = route.params;
  const { actualUser, user } = useAuth();
  const { isOnline } = useConnectivity();
  const queryClient = useQueryClient();
  const sessionQuery = useTastingSessionDetail(sessionId, true);
  const session = sessionQuery.data;
  const [drafts, setDrafts] = useState<Record<string, RatingDraft>>({});
  const [uploadedPhotoKeys, setUploadedPhotoKeys] = useState<Set<string>>(() => new Set());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmittingRatings, setIsSubmittingRatings] = useState(false);
  const [submitSuccessMessage, setSubmitSuccessMessage] = useState<string | null>(null);
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  const [isUndoModalVisible, setIsUndoModalVisible] = useState(false);
  const [photoViewerPreviewUrls, setPhotoViewerPreviewUrls] = useState<string[]>([]);
  const [photoViewerUrls, setPhotoViewerUrls] = useState<string[]>([]);
  const [photoViewerInitialIndex, setPhotoViewerInitialIndex] = useState(0);
  const [isPhotoViewerVisible, setIsPhotoViewerVisible] = useState(false);
  const isLeader = Boolean(session && user?.id === session.leaderUserId);
  const currentParticipant = session?.participants.find((participant) => participant.userId === user?.id);
  const isActualAdmin = actualUser?.isAdmin === true;
  const isDisplayAdminUser = user?.isAdmin === true;
  const isDisplaySubscriberUser = user?.isSubscriber === true;
  const isDisplayFreeUser = !isDisplayAdminUser && !isDisplaySubscriberUser;
  const usagePreviewTier = isActualAdmin && !isDisplayAdminUser
    ? (isDisplaySubscriberUser ? 'subscriber' : 'free')
    : null;
  const monthlyUsage = useMonthlyUsage({ viewAsTier: usagePreviewTier });
  const shouldEnforceUsageLimitsClientSide = !isActualAdmin;
  const perRecordPhotoLimit = isActualAdmin ? null : isDisplaySubscriberUser ? 20 : 1;
  const displayMaxPhotosPerItem = resolveDisplayPhotoUploadsPerRecordLimit({
    snapshotLimit: monthlyUsage.snapshot?.limits.photoUploadsPerRecord,
    isDisplayAdminUser,
    isDisplaySubscriberUser,
    isDisplayFreeUser,
  });
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

  const approvedRestaurants = useMemo(
    () => session?.restaurants.filter((restaurant) => restaurant.status === 'approved') ?? [],
    [session?.restaurants],
  );
  const approvedItems = approvedRestaurants.flatMap((restaurant) =>
    (restaurant.items ?? []).filter((item) => item.status === 'approved'),
  );
  const draftPhotoCount = Object.values(drafts).reduce((count, draft) => count + draft.photos.length, 0);
  const estimatedUsedWithDraftPhotos =
    shouldEnforceUsageLimitsClientSide && isDisplayFreeUser && monthlyUsage.snapshot
      ? monthlyUsage.snapshot.usage.photoUploads + draftPhotoCount
      : null;
  const estimatedMonthlyPhotoTotal = estimatedUsedWithDraftPhotos ?? draftPhotoCount;
  const estimatedFreeMonthlyPhotosRemaining = Math.max(
    FREE_MONTHLY_PHOTO_LIMIT - estimatedMonthlyPhotoTotal,
    0,
  );
  const shouldHidePhotoSourceActions =
    isDisplayFreeUser &&
    shouldEnforceUsageLimitsClientSide &&
    typeof estimatedUsedWithDraftPhotos === 'number' &&
    estimatedFreeMonthlyPhotosRemaining <= 0;
  const photoQuotaStatusMessage = shouldHidePhotoSourceActions
    ? formatFreeMonthlyPhotoLimitStatus(estimatedFreeMonthlyPhotosRemaining)
    : null;

  const resolveDraft = (item: TastingMenuItemRecord): RatingDraft => {
    const savedRating = currentParticipant
      ? item.ratings.find((rating) => rating.participantId === currentParticipant.id)
      : undefined;
    return (
      drafts[item.id] ?? {
        included: true,
        note: savedRating?.note ?? '',
        photos: [],
        rating: savedRating?.rating ?? 3,
      }
    );
  };
  const removedItems = approvedItems.filter((item) => !resolveDraft(item).included);

  const openPhotoViewer = useCallback((photos: TastingRatingDraftPhoto[], initialIndex: number) => {
    if (photos.length === 0) {
      return;
    }
    setPhotoViewerPreviewUrls(photos.map((photo) => photo.thumbnailUri));
    setPhotoViewerUrls(photos.map((photo) => photo.viewerUri));
    setPhotoViewerInitialIndex(initialIndex);
    setIsPhotoViewerVisible(true);
  }, []);

  const closePhotoViewer = useCallback(() => {
    setIsPhotoViewerVisible(false);
  }, []);

  const attachPhotoToDraftItem = async (
    item: TastingMenuItemRecord,
    source: 'camera' | 'gallery',
  ) => {
    resetPhotoPermissionNeedsSettings();
    const draft = resolveDraft(item);
    if (
      perRecordPhotoLimit !== null &&
      draft.photos.length >= perRecordPhotoLimit
    ) {
      setErrorMessage(
        `You can upload up to ${perRecordPhotoLimit} photo${perRecordPhotoLimit === 1 ? '' : 's'} per item.`,
      );
      return;
    }
    if (shouldHidePhotoSourceActions && typeof estimatedUsedWithDraftPhotos === 'number') {
      setErrorMessage(formatFreeMonthlyPhotoLimitStatus(estimatedFreeMonthlyPhotosRemaining));
      return;
    }

    const permission = await requestPhotoPickerPermission(source);
    if (!permission.granted) {
      setErrorMessage(permission.message);
      return;
    }

    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            allowsEditing: false,
            exif: true,
            quality: 0.8,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: false,
            exif: true,
            quality: 0.8,
            selectionLimit: 1,
          });

    if (result.canceled || result.assets.length === 0) {
      return;
    }

    const asset = result.assets[0];
    const upload = await stageLocalPhotoFile(asset, {
      fallbackPrefix: 'tasting-item',
    });
    if (!upload) {
      setErrorMessage('Could not prepare the selected image for upload.');
      return;
    }

    const captureDate = await resolvePhotoCaptureDate(asset);
    const nextPhoto: TastingRatingDraftPhoto = {
      id: upload.uri,
      upload,
      thumbnailUri: upload.uri,
      viewerUri: upload.uri,
      labelDate: formatPhotoAttachmentDateLabel(captureDate ?? new Date()),
    };

    setDrafts((current) => {
      const currentDraft = current[item.id] ?? draft;
      if (currentDraft.photos.some((photo) => photo.upload.uri === nextPhoto.upload.uri)) {
        return current;
      }
      return {
        ...current,
        [item.id]: {
          ...currentDraft,
          included: true,
          photos: [...currentDraft.photos, nextPhoto],
        },
      };
    });
    resetPhotoPermissionNeedsSettings();
    setErrorMessage(null);
  };

  const removeDraftPhoto = (item: TastingMenuItemRecord, photoId: string) => {
    const draft = resolveDraft(item);
    setDrafts((current) => ({
      ...current,
      [item.id]: {
        ...draft,
        photos: draft.photos.filter((photo) => photo.id !== photoId),
      },
    }));
  };

  const uploadSubmittedPhotos = async (nextSession: TastingSessionRecord) => {
    const currentUserId = user?.id;
    if (!currentUserId) {
      return;
    }

    const nextItems = nextSession.restaurants.flatMap((restaurant) => restaurant.items ?? []);
    const uploadedKeys = new Set<string>();
    for (const item of nextItems) {
      const draft = drafts[item.id];
      if (!draft?.included || draft.photos.length === 0) {
        continue;
      }
      const rating = item.ratings.find((entry) => entry.userId === currentUserId);
      if (!rating?.generatedFoodItemId) {
        continue;
      }
      const pendingPhotos = draft.photos.filter((photo) => !uploadedPhotoKeys.has(`${item.id}:${photo.upload.uri}`));
      if (pendingPhotos.length === 0) {
        continue;
      }
      await uploadVisitPhotos(
        rating.generatedVisitId,
        rating.generatedFoodItemId,
        currentUserId,
        pendingPhotos.map((photo) => photo.upload),
      );
      pendingPhotos.forEach((photo) => uploadedKeys.add(`${item.id}:${photo.upload.uri}`));
    }
    if (uploadedKeys.size > 0) {
      setUploadedPhotoKeys((current) => new Set([...current, ...uploadedKeys]));
    }
  };

  const handleSubmit = async () => {
    if (!isOnline) {
      setErrorMessage('Connect to the internet to submit ratings.');
      return;
    }
    try {
      setErrorMessage(null);
      setSubmitSuccessMessage(null);
      setIsSubmittingRatings(true);
      const restaurants = approvedRestaurants
        .map((restaurant) => ({
          restaurantSuggestionId: restaurant.id,
          items: (restaurant.items ?? [])
            .filter((item) => item.status === 'approved')
            .map((item) => ({ item, draft: resolveDraft(item) }))
            .filter(({ draft }) => draft.included)
            .map(({ item, draft }) => ({
              itemId: item.id,
              note: draft.note.trim() || undefined,
              rating: draft.rating,
            })),
        }))
        .filter((restaurant) => restaurant.items.length > 0);
      const nextSession = await submitTastingRatings(sessionId, { restaurants });
      await uploadSubmittedPhotos(nextSession);
      await queryClient.invalidateQueries({ queryKey: tastingSessionsQueryKeys.detail(sessionId) });
      setSubmitSuccessMessage('Ratings saved. You can edit and submit again until the tasting is completed.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not submit ratings.');
    } finally {
      setIsSubmittingRatings(false);
    }
  };

  const handleComplete = async () => {
    if (!isOnline) {
      setErrorMessage('Connect to the internet to complete this tasting.');
      return;
    }
    try {
      const nextSession = await completeTastingSession(sessionId);
      await queryClient.invalidateQueries({ queryKey: tastingSessionsQueryKeys.detail(sessionId) });
      navigation.replace('TastingSessionResults', { sessionId: nextSession.id });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not complete session.');
    }
  };

  if (!session) {
    return (
      <FeatureFormScreenScaffold
        onBackPress={() => navigation.navigate('TastingSessions')}
        primaryAction={{ disabled: true, label: 'Submit Ratings', onPress: () => undefined }}
        title="Tasting"
      >
        <EmptyState title="Loading tasting" />
      </FeatureFormScreenScaffold>
    );
  }

  return (
    <FeatureFormScreenScaffold
      onBackPress={() => navigation.navigate('TastingSessions')}
      primaryAction={{
        disabled: approvedItems.length === 0 || !isOnline || isSubmittingRatings,
        label: submitSuccessMessage ? 'Update Ratings' : 'Submit Ratings',
        loading: isSubmittingRatings,
        onPress: () => {
          void handleSubmit();
        },
        testID: 'tasting-submit-ratings-button',
      }}
      secondaryAction={
        isLeader
          ? {
              disabled: !isOnline,
              label: 'Complete',
              onPress: () => setShowCompleteConfirm(true),
            }
          : undefined
      }
      subtitle={
        <View style={styles.headerSubtitleRow}>
          <Text style={styles.headerSubtitleText} tone="muted" variant="bodyMd">
            Rate the items you tried.
          </Text>
          {removedItems.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setIsUndoModalVisible(true)}
              style={styles.undoButton}
            >
              <Text variant="label">Undo</Text>
            </Pressable>
          ) : null}
        </View>
      }
      title={session.name}
    >
      {!isOnline ? <Text tone="warning">Rating actions require a connection.</Text> : null}
      {photoPermissionNeedsSettings ? (
        <Text
          onPress={() => {
            void Linking.openSettings();
          }}
          tone="warning"
        >
          Photo permission is blocked. Open settings to allow photo access.
        </Text>
      ) : null}
      <PageErrorToast errorMessage={errorMessage} title="Tasting action failed" />
      {submitSuccessMessage ? (
        <Text tone="success" variant="bodySm">
          {submitSuccessMessage}
        </Text>
      ) : null}
      <RatingLegend initiallyExpanded persistenceKey="ui.tastingRatingGuide.expanded" />
      {approvedItems.length === 0 ? (
        <EmptyState
          description="The leader has not selected menu items for this tasting yet."
          title="No items to rate"
        />
      ) : null}
      {approvedRestaurants.map((restaurant, restaurantIndex) => {
        const visibleItems = (restaurant.items ?? []).filter(
          (item) => item.status === 'approved' && resolveDraft(item).included,
        );

        return (
          <View key={restaurant.id} style={styles.restaurantSection}>
            {restaurantIndex > 0 ? <View style={styles.restaurantSeparator} /> : null}
            <View style={styles.restaurantHeader}>
              <Text style={styles.restaurantName} variant="label">
                {restaurant.restaurantName}
              </Text>
              <Text tone="secondary" variant="bodySm">
                {visibleItems.length} item{visibleItems.length === 1 ? '' : 's'}
              </Text>
            </View>
            <View style={styles.itemList}>
              {visibleItems.map((item) => {
                const draft = resolveDraft(item);
                return (
                  <VisitItemRatingCard
                    key={item.id}
                    itemName={item.name}
                    notesValue={draft.note}
                    onNotesChange={(note) =>
                      setDrafts((current) => ({ ...current, [item.id]: { ...draft, note } }))
                    }
                    onRequestRemove={() =>
                      setDrafts((current) => ({
                        ...current,
                        [item.id]: { ...draft, included: false },
                      }))
                    }
                    onRatingChange={(rating) =>
                      setDrafts((current) => ({ ...current, [item.id]: { ...draft, rating } }))
                    }
                    photoSection={
                      <PhotoInputField
                        attachments={draft.photos.map((photo, photoIndex) => ({
                          id: photo.id,
                          label: photo.labelDate,
                          uri: photo.thumbnailUri,
                          accessibilityLabel: `View attached photo ${photoIndex + 1} full screen`,
                          onPress: () => {
                            openPhotoViewer(draft.photos, photoIndex);
                          },
                          onRemove: () => {
                            closePhotoViewer();
                            removeDraftPhoto(item, photo.id);
                          },
                        }))}
                        cameraSubtitle="Camera"
                        cameraTitle="Capture"
                        countLabel={
                          displayMaxPhotosPerItem === null ||
                          (shouldHidePhotoSourceActions && draft.photos.length === 0)
                            ? null
                            : `${draft.photos.length}/${displayMaxPhotosPerItem}`
                        }
                        disabled={!isOnline}
                        footerAction={
                          photoQuotaStatusMessage ? (
                            <Text tone="secondary" variant="bodySm">
                              {photoQuotaStatusMessage}
                            </Text>
                          ) : null
                        }
                        gallerySubtitle="Photo Library"
                        galleryTitle="Upload"
                        hideSourceActions={shouldHidePhotoSourceActions}
                        iconName="images-outline"
                        label="Add photos"
                        onCameraPress={() => {
                          void attachPhotoToDraftItem(item, 'camera');
                        }}
                        onGalleryPress={() => {
                          void attachPhotoToDraftItem(item, 'gallery');
                        }}
                      />
                    }
                    rating={draft.rating}
                    removeAccessibilityLabel={`Remove ${item.name} from rating list`}
                  />
                );
              })}
            </View>
          </View>
        );
      })}

      <PhotoViewerModal
        initialIndex={photoViewerInitialIndex}
        onRequestClose={closePhotoViewer}
        previewUrls={photoViewerPreviewUrls}
        urls={photoViewerUrls}
        visible={isPhotoViewerVisible}
      />

      <Modal
        onRequestClose={() => setIsUndoModalVisible(false)}
        secondaryAction={{
          label: 'Close',
          onPress: () => setIsUndoModalVisible(false),
        }}
        title="Add Items Back"
        visible={isUndoModalVisible}
      >
        <View style={styles.undoList}>
          {removedItems.map((item) => (
            <View key={item.id} style={styles.undoRow}>
              <Text style={styles.undoTitle} variant="label">
                {item.name}
              </Text>
              <Button
                label="Add Back"
                onPress={() => {
                  const draft = resolveDraft(item);
                  setDrafts((current) => ({
                    ...current,
                    [item.id]: { ...draft, included: true },
                  }));
                  if (removedItems.length === 1) {
                    setIsUndoModalVisible(false);
                  }
                }}
                variant="secondary"
              />
            </View>
          ))}
        </View>
      </Modal>

      <ConfirmDestructiveModal
        cancelLabel="Keep Tasting"
        confirmLabel="Complete Session"
        description="Complete this tasting and reveal submitted ratings? Participants who have not submitted will be omitted from results."
        onCancel={() => setShowCompleteConfirm(false)}
        onConfirm={() => {
          setShowCompleteConfirm(false);
          void handleComplete();
        }}
        title="Complete Tasting?"
        visible={showCompleteConfirm}
      />
    </FeatureFormScreenScaffold>
  );
}
