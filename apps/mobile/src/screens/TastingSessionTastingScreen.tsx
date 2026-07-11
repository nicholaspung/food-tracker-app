import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Linking, Pressable, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import {
  ConfirmDestructiveModal,
  EmptyState,
  FeatureFormScreenScaffold,
  HomeFeedVisitEntryCard,
  type HomeFeedPhotoRecord,
  PageErrorToast,
  PhotoInputField,
  PhotoViewerModal,
  RatingLegend,
  StepProgressBar,
  VisitItemRatingCard,
} from '../components/shared';
import {
  formatFreeMonthlyPhotoLimitStatus,
  type TastingMenuItemRecord,
  type TastingRatingDraft,
  type TastingRatingDraftPhoto,
  useMonthlyUsage,
  useTastingSessionLifecycleWrites,
} from '../features';
import { usePhotoPickerPermissions } from '../hooks/usePhotoPickerPermissions';
import {
  formatDateToLocalDateString,
  formatPhotoAttachmentDateLabel,
} from '../lib/dateFormatting';
import {
  launchCameraPickerAsync,
  launchImageLibraryPickerAsync,
} from '../lib/guardedImagePicker';
import { resolvePhotoCaptureDate } from '../lib/photoMetadata';
import { stageLocalPhotoFile } from '../lib/photoStaging';
import { resolveDisplayPhotoUploadsPerRecordLimit } from '../lib/usageUiRules';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useAuth } from '../providers/AuthProvider';
import { createThemedStyles } from '../theme';
import { Button, Card, Modal, Text } from '../ui';
import { FREE_MONTHLY_PHOTO_LIMIT } from './createVisit/shared';
import { formatReviewEntryFooterLabel } from './photoProcessing/shared';
import { TastingSessionLifecycleShell } from './tastingSessions/TastingSessionLifecycleShell';
import { TASTING_SESSION_LIFECYCLE_STEPS } from './tastingSessions/shared';
import { useTastingSessionLifecycleNavigation } from './tastingSessions/useTastingSessionLifecycleNavigation';
import { useTastingSessionLifecycleReadState } from './tastingSessions/useTastingSessionLifecycleReadState';

type TastingSessionTastingScreenProps = NativeStackScreenProps<RootStackParamList, 'TastingSessionTasting'>;
type TastingSessionTastingStep = 'rating' | 'review';

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
  reviewList: {
    gap: theme.spacing.md,
  },
  completionSummaryCard: {
    gap: theme.spacing.sm,
  },
  completionSummaryRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  completionSummaryMetric: {
    flex: 1,
    gap: theme.spacing.xxs,
  },
}));

function renderTastingSessionFormFallbackScaffold({
  children,
  onBackPress,
  title,
}: {
  children: ReactNode;
  onBackPress: () => void;
  title: string;
}) {
  return (
    <FeatureFormScreenScaffold
      onBackPress={onBackPress}
      primaryAction={{ disabled: true, label: 'Submit Ratings', onPress: () => undefined }}
      title={title}
    >
      {children}
    </FeatureFormScreenScaffold>
  );
}

export function TastingSessionTastingScreen({ navigation, route }: TastingSessionTastingScreenProps) {
  const styles = useStyles();
  const { sessionId } = route.params;
  const { actualUser, user } = useAuth();
  const tastingLifecycleWrites = useTastingSessionLifecycleWrites();
  const lifecycle = useTastingSessionLifecycleReadState({
    currentUserId: user?.id,
    screen: 'tasting',
    sessionId,
  });
  const sessionQuery = lifecycle.query;
  const session = sessionQuery.data;
  const isOnline = lifecycle.onlineOnly.isOnline;
  const [drafts, setDrafts] = useState<Record<string, TastingRatingDraft>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmittingRatings, setIsSubmittingRatings] = useState(false);
  const [isCompletingTasting, setIsCompletingTasting] = useState(false);
  const [reviewTimestamp, setReviewTimestamp] = useState<string | null>(null);
  const [step, setStep] = useState<TastingSessionTastingStep>('rating');
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  const [isUndoModalVisible, setIsUndoModalVisible] = useState(false);
  const [photoViewerPreviewUrls, setPhotoViewerPreviewUrls] = useState<string[]>([]);
  const [photoViewerUrls, setPhotoViewerUrls] = useState<string[]>([]);
  const [photoViewerInitialIndex, setPhotoViewerInitialIndex] = useState(0);
  const [isPhotoViewerVisible, setIsPhotoViewerVisible] = useState(false);
  const isLeader = lifecycle.roles.isLeader;
  const currentParticipant = lifecycle.roles.currentParticipant;
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

  useTastingSessionLifecycleNavigation({
    navigation,
    redirectDestination: lifecycle.redirectDestination,
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

  const resolveDraft = useCallback((item: TastingMenuItemRecord): TastingRatingDraft => {
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
  }, [currentParticipant, drafts]);
  const removedItems = approvedItems.filter((item) => !resolveDraft(item).included);
  const completionSummary = useMemo(() => {
    const participants = session?.participants ?? [];
    const submittedParticipants = participants.filter((participant) =>
      Boolean(participant.submittedAt || (reviewTimestamp && participant.userId === user?.id)),
    );
    const pendingParticipants = participants.filter(
      (participant) =>
        !participant.submittedAt && !(reviewTimestamp && participant.userId === user?.id),
    );
    const pendingNames = pendingParticipants
      .map((participant) => participant.name.trim())
      .filter(Boolean);

    return {
      completedCount: submittedParticipants.length,
      pendingCount: pendingParticipants.length,
      pendingNames,
      totalCount: participants.length,
    };
  }, [reviewTimestamp, session?.participants, user?.id]);
  const completionSummaryDescription =
    completionSummary.pendingCount > 0
      ? `${completionSummary.pendingCount} participant${
          completionSummary.pendingCount === 1 ? ' is' : 's are'
        } still rating${
          completionSummary.pendingNames.length > 0
            ? `: ${completionSummary.pendingNames.join(', ')}`
            : ''
        }. Completing now will omit anyone who has not submitted.`
      : 'All participants have submitted ratings.';
  const reviewCards = useMemo(() => {
    const reviewedAt =
      reviewTimestamp ??
      currentParticipant?.submittedAt ??
      session?.updatedAt ??
      new Date().toISOString();
    const reviewedDate = formatDateToLocalDateString(new Date(reviewedAt));
    const footerLabel = formatReviewEntryFooterLabel(reviewedAt, reviewedDate);

    return approvedRestaurants
      .map((restaurant) => {
        const visibleItems = (restaurant.items ?? [])
          .filter((item) => item.status === 'approved')
          .map((item) => ({ item, draft: resolveDraft(item) }))
          .filter(({ draft }) => draft.included);

        const photosByFoodItem = new Map<string, HomeFeedPhotoRecord[]>();
        visibleItems.forEach(({ item, draft }) => {
          if (draft.photos.length === 0) {
            return;
          }

          photosByFoodItem.set(
            item.id,
            draft.photos.map((photo) => ({
              id: photo.id,
              food_item: item.id,
              photo: photo.upload.name,
              uri: photo.thumbnailUri,
              created: reviewedAt,
            })),
          );
        });

        return {
          id: `tasting-review-${restaurant.id}`,
          footerLabel,
          photosByFoodItem,
          visit: {
            id: `tasting-review-visit-${restaurant.id}`,
            restaurantId: restaurant.restaurantId,
            restaurantName: restaurant.restaurantName,
            visitedAt: reviewedAt,
            items: visibleItems.map(({ item, draft }) => ({
              id: item.id,
              name: item.name,
              rating: draft.rating,
              notes: draft.note.trim() || undefined,
            })),
            source: 'tasting-result' as const,
            userId: user?.id,
            userName: currentParticipant?.name,
            visibility: 'friends' as const,
            createdAt: reviewedAt,
            updatedAt: reviewedAt,
          },
        };
      })
      .filter((card) => card.visit.items.length > 0);
  }, [
    approvedRestaurants,
    currentParticipant?.name,
    currentParticipant?.submittedAt,
    resolveDraft,
    reviewTimestamp,
    session?.updatedAt,
    user?.id,
  ]);

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

  const openReviewPhotoViewer = useCallback((photos: HomeFeedPhotoRecord[], initialIndex = 0) => {
    const urls = photos
      .map((photo) => photo.uri?.trim())
      .filter((value): value is string => Boolean(value));
    if (urls.length === 0) {
      return;
    }

    setPhotoViewerPreviewUrls(urls);
    setPhotoViewerUrls(urls);
    setPhotoViewerInitialIndex(Math.max(0, Math.min(initialIndex, urls.length - 1)));
    setIsPhotoViewerVisible(true);
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
        ? await launchCameraPickerAsync({
            mediaTypes: ['images'],
            allowsEditing: false,
            exif: true,
            quality: 0.8,
          })
        : await launchImageLibraryPickerAsync({
            mediaTypes: ['images'],
            allowsEditing: false,
            exif: true,
            quality: 0.8,
            selectionLimit: 1,
          });

    if (!result || result.canceled || result.assets.length === 0) {
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

  const handleSubmit = async () => {
    try {
      setErrorMessage(null);
      setIsSubmittingRatings(true);
      const draftByItemId = Object.fromEntries(
        approvedItems.map((item) => [item.id, resolveDraft(item)]),
      );
      const submitResult = await tastingLifecycleWrites.submitRatingDraft({
        approvedRestaurants,
        currentUserId: user?.id,
        draftByItemId,
        sessionId,
      });
      if (submitResult.status === 'blocked') {
        setErrorMessage(submitResult.message);
        return;
      }
      if (submitResult.status === 'queued') {
        return;
      }
      const submittedParticipant = submitResult.result.participants.find(
        (participant) => participant.userId === user?.id,
      );
      setReviewTimestamp(submittedParticipant?.submittedAt ?? submitResult.result.updatedAt);
      setStep('review');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not submit ratings.');
    } finally {
      setIsSubmittingRatings(false);
    }
  };

  const handleComplete = async () => {
    try {
      setErrorMessage(null);
      setIsCompletingTasting(true);
      const completeResult = await tastingLifecycleWrites.completeTasting({ sessionId });
      if (completeResult.status === 'blocked') {
        setErrorMessage(completeResult.message);
        return;
      }
      if (completeResult.status === 'queued') {
        return;
      }
      navigation.replace('TastingSessionResults', { sessionId: completeResult.result.id });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not complete session.');
    } finally {
      setIsCompletingTasting(false);
    }
  };

  if ((sessionQuery.isError && !session) || !session) {
    return (
      <TastingSessionLifecycleShell
        isError={sessionQuery.isError}
        loadingTitle="Loading tasting"
        onBackPress={() => navigation.navigate('TastingSessions')}
        renderScaffold={renderTastingSessionFormFallbackScaffold}
        session={session}
        title="Tasting"
      >
        {() => null}
      </TastingSessionLifecycleShell>
    );
  }

  if (step === 'review') {
    const reviewItemCount = reviewCards.reduce((count, card) => count + card.visit.items.length, 0);

    return (
      <FeatureFormScreenScaffold
        keyboardAware={false}
        headerBottomCompact
        headerBottomContent={
          <StepProgressBar
            compact
            currentStep={lifecycle.step.stage === 'review' ? lifecycle.step.currentStep : 3}
            steps={TASTING_SESSION_LIFECYCLE_STEPS}
          />
        }
        onBackPress={() => {
          setStep('rating');
          setErrorMessage(null);
        }}
        primaryAction={
          isLeader
            ? {
                disabled: !isOnline || isCompletingTasting,
                label: 'Complete',
                loading: isCompletingTasting,
                onPress: () => setShowCompleteConfirm(true),
                testID: 'tasting-complete-session-button',
              }
            : {
                label: 'Done',
                onPress: () => navigation.navigate('TastingSessions'),
              }
        }
        secondaryAction={{
          label: 'Update Ratings',
          onPress: () => {
            setStep('rating');
            setErrorMessage(null);
          },
          testID: 'tasting-update-ratings-button',
          variant: 'secondary',
        }}
        subtitle={
          isLeader
            ? `${reviewItemCount} item${reviewItemCount === 1 ? '' : 's'} ready. Complete when you are ready to reveal group results.`
            : `${reviewItemCount} item${reviewItemCount === 1 ? '' : 's'} ready. You can update ratings until the leader completes the session.`
        }
        title="Review Your Ratings"
      >
        {!isOnline ? <Text tone="warning">Completing the tasting requires a connection.</Text> : null}
        <PageErrorToast errorMessage={errorMessage} title="Tasting action failed" />
        {reviewCards.length === 0 ? (
          <EmptyState
            description="Update your ratings to add items back before completing the tasting."
            title="No ratings to review"
          />
        ) : null}
        {isLeader ? (
          <Card
            style={styles.completionSummaryCard}
            testID="tasting-completion-summary-card"
            tone={completionSummary.pendingCount > 0 ? 'warning' : 'success'}
          >
            <Text variant="label">Participant Ratings</Text>
            <View style={styles.completionSummaryRow}>
              <View style={styles.completionSummaryMetric}>
                <Text variant="titleSm">{completionSummary.completedCount}</Text>
                <Text tone="secondary" variant="bodySm">
                  Complete
                </Text>
              </View>
              <View style={styles.completionSummaryMetric}>
                <Text variant="titleSm">{completionSummary.pendingCount}</Text>
                <Text tone="secondary" variant="bodySm">
                  Still rating
                </Text>
              </View>
            </View>
            <Text tone={completionSummary.pendingCount > 0 ? 'warning' : 'success'} variant="bodySm">
              {completionSummary.completedCount} of {completionSummary.totalCount} participant
              {completionSummary.totalCount === 1 ? '' : 's'} complete.
            </Text>
            {completionSummary.pendingNames.length > 0 ? (
              <Text tone="secondary" variant="bodySm">
                Waiting on {completionSummary.pendingNames.join(', ')}.
              </Text>
            ) : null}
          </Card>
        ) : null}
        <View style={styles.reviewList}>
          {reviewCards.map((card) => (
            <HomeFeedVisitEntryCard
              footerLabel={card.footerLabel}
              getPhotosForItem={(itemId) => card.photosByFoodItem.get(itemId) ?? []}
              key={card.id}
              onOpenPhotoViewer={openReviewPhotoViewer}
              visit={card.visit}
            />
          ))}
        </View>

        <PhotoViewerModal
          initialIndex={photoViewerInitialIndex}
          onRequestClose={closePhotoViewer}
          previewUrls={photoViewerPreviewUrls}
          urls={photoViewerUrls}
          visible={isPhotoViewerVisible}
        />

        <ConfirmDestructiveModal
          cancelLabel="Review"
          confirmLabel="Complete"
          description={`Complete this tasting and reveal submitted ratings? ${completionSummaryDescription}`}
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

  return (
    <FeatureFormScreenScaffold
      headerBottomCompact
      headerBottomContent={
        <StepProgressBar
          compact
          currentStep={lifecycle.step.currentStep}
          steps={TASTING_SESSION_LIFECYCLE_STEPS}
        />
      }
      onBackPress={() => navigation.navigate('TastingSessions')}
      primaryAction={{
        disabled: approvedItems.length === 0 || !isOnline || isSubmittingRatings,
        label: 'Submit Ratings',
        loading: isSubmittingRatings,
        onPress: () => {
          void handleSubmit();
        },
        testID: 'tasting-submit-ratings-button',
      }}
      subtitle={
        <View style={styles.headerSubtitleRow}>
          <Text style={styles.headerSubtitleText} tone="muted" variant="bodyMd">
            Rate the items you tried. Remove anything you skipped, add notes or photos if useful, then submit.
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
      {lifecycle.onlineOnly.warningMessage ? (
        <Text tone="warning">{lifecycle.onlineOnly.warningMessage}</Text>
      ) : null}
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

    </FeatureFormScreenScaffold>
  );
}
