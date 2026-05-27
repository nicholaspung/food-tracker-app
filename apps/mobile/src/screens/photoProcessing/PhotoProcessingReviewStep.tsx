import { useCallback, useState } from 'react';
import { View } from 'react-native';

import {
  HomeFeedVisitEntryCard,
  HomeFoodProductEntryCard,
  LightweightStatusCard,
  OFFLINE_USAGE_WARNING_MESSAGE,
  PageErrorToast,
  PhotoViewerModal,
  type HomeFeedPhotoRecord,
} from '../../components/shared';
import { createThemedStyles } from '../../theme';
import { Card, Text } from '../../ui';
import type {
  ProcessType,
  ReviewFoodProductCardData,
  ReviewVisitCardData,
} from './shared';

interface PhotoProcessingReviewStepProps {
  errorMessage: string | null;
  processType: ProcessType;
  reviewFoodProductCards: ReviewFoodProductCardData[];
  reviewVisitCards: ReviewVisitCardData[];
  showOfflineUsageWarning: boolean;
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
  processType,
  reviewFoodProductCards,
  reviewVisitCards,
  showOfflineUsageWarning,
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
        <LightweightStatusCard message={OFFLINE_USAGE_WARNING_MESSAGE} style={styles.sectionCard} />
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
        reviewFoodProductCards.map((entry) => (
          <HomeFoodProductEntryCard
            entryMeta={entry.entryMeta}
            key={entry.id}
            onOpenPhotoViewer={openReviewPhotoViewer}
            foodProduct={entry.foodProduct}
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
