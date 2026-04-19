import { useCallback, useState } from 'react';
import { View } from 'react-native';

import {
  HomeFeedVisitEntryCard,
  HomeFoodProductEntryCard,
  PageErrorToast,
  PhotoViewerModal,
  UpgradePromptCard,
  type HomeFeedPhotoRecord,
} from '../../components/shared';
import { createThemedStyles } from '../../theme';
import { Card, Text } from '../../ui';
import type {
  ProcessType,
  ReviewQuickTrackCardData,
  ReviewVisitCardData,
} from './shared';

interface PhotoProcessingReviewStepProps {
  errorMessage: string | null;
  estimatedFreeMonthlyPhotoRemaining: number;
  processType: ProcessType;
  reviewQuickTrackCards: ReviewQuickTrackCardData[];
  reviewVisitCards: ReviewVisitCardData[];
  shouldShowPhotoUpgradePrompt: boolean;
  showOfflineUsageWarning: boolean;
  showUsageEstimate: boolean;
  usageEstimateLabel: string;
  visitVisibility: 'friends' | 'private';
}

const useStyles = createThemedStyles((theme) => ({
  reviewCard: {
    gap: theme.spacing.sm,
  },
  reviewFeedList: {
    gap: theme.spacing.md,
  },
  sectionCard: {
    gap: theme.spacing.sm,
  },
}));

export function PhotoProcessingReviewStep({
  errorMessage,
  estimatedFreeMonthlyPhotoRemaining,
  processType,
  reviewQuickTrackCards,
  reviewVisitCards,
  shouldShowPhotoUpgradePrompt,
  showOfflineUsageWarning,
  showUsageEstimate,
  usageEstimateLabel,
  visitVisibility,
}: PhotoProcessingReviewStepProps) {
  const styles = useStyles();
  const [reviewPhotoViewerVisible, setReviewPhotoViewerVisible] = useState(false);
  const [reviewPhotoViewerUrls, setReviewPhotoViewerUrls] = useState<string[]>(
    [],
  );
  const [reviewPhotoViewerInitialIndex, setReviewPhotoViewerInitialIndex] =
    useState(0);

  const openReviewPhotoViewer = useCallback(
    (reviewPhotos: HomeFeedPhotoRecord[], initialIndex = 0) => {
      const urls = reviewPhotos
        .map((photo) => photo.uri?.trim())
        .filter((value): value is string => Boolean(value));
      if (urls.length === 0) {
        return;
      }

      const boundedIndex = Math.max(
        0,
        Math.min(initialIndex, urls.length - 1),
      );
      setReviewPhotoViewerUrls(urls);
      setReviewPhotoViewerInitialIndex(boundedIndex);
      setReviewPhotoViewerVisible(true);
    },
    [],
  );

  const closeReviewPhotoViewer = useCallback(() => {
    setReviewPhotoViewerVisible(false);
  }, []);

  return (
    <>
      <PageErrorToast errorMessage={errorMessage} title="Review issue" />

      {showOfflineUsageWarning ? (
        <Card style={styles.sectionCard} tone="muted">
          <Text tone="warning">
            Offline estimate may be stale. Backend limits are enforced when sync
            runs.
          </Text>
        </Card>
      ) : null}

      {showUsageEstimate ? (
        <Card style={styles.sectionCard} tone="muted">
          <Text tone="secondary">
            Monthly photo estimate: {usageEstimateLabel}.
          </Text>
        </Card>
      ) : null}

      {shouldShowPhotoUpgradePrompt ? (
        <UpgradePromptCard
          description={
            estimatedFreeMonthlyPhotoRemaining <= 0
              ? "You have reached this month's free photo limit. Subscriber accounts have higher monthly limits."
              : `Only ${estimatedFreeMonthlyPhotoRemaining} photo uploads left this month. Subscriber accounts have higher monthly limits.`
          }
          title={
            estimatedFreeMonthlyPhotoRemaining <= 0
              ? 'Free limit reached'
              : 'You are close to your free limit'
          }
        />
      ) : null}

      {processType === 'restaurant' ? (
        <>
          <Card style={styles.reviewCard}>
            <Text variant="label">Visit Visibility</Text>
            <Text tone="secondary">
              {visitVisibility === 'private' ? 'Private' : 'Friends'}
            </Text>
          </Card>

          <View style={styles.reviewFeedList}>
            {reviewVisitCards.map((reviewVisitCard) => (
              <HomeFeedVisitEntryCard
                footerLabel={reviewVisitCard.footerLabel}
                getPhotosForItem={(itemId) =>
                  reviewVisitCard.photosByFoodItem.get(itemId) ?? []
                }
                key={reviewVisitCard.id}
                onOpenPhotoViewer={openReviewPhotoViewer}
                visit={reviewVisitCard.visit}
              />
            ))}
          </View>
        </>
      ) : (
        reviewQuickTrackCards.map((entry) => (
          <HomeFoodProductEntryCard
            entryMeta={entry.entryMeta}
            key={entry.id}
            onOpenPhotoViewer={openReviewPhotoViewer}
            foodProduct={entry.quickTrack}
            photos={entry.photos}
          />
        ))
      )}

      <PhotoViewerModal
        initialIndex={reviewPhotoViewerInitialIndex}
        onRequestClose={closeReviewPhotoViewer}
        urls={reviewPhotoViewerUrls}
        visible={reviewPhotoViewerVisible}
      />
    </>
  );
}
