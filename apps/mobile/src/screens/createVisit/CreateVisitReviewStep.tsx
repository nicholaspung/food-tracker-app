import { useCallback, useState } from 'react';

import {
  PhotoInputField,
  PhotoViewerModal,
  RatingLegend,
  RatingSelector,
  UpgradePromptCard,
  VisitMetadataCard,
  type VisibilityOptionValue,
} from '../../components/shared';
import { createThemedStyles } from '../../theme';
import { Card, Input, Text } from '../../ui';
import type { DraftVisitItem, DraftVisitItemPhoto } from './shared';

type DraftVisitItemUpdates = Partial<
  Pick<DraftVisitItem, 'rating' | 'description' | 'notes' | 'photos'>
>;

interface CreateVisitReviewStepProps {
  detectedVisitDateValue: string | null;
  draftItems: DraftVisitItem[];
  displayMaxPhotosPerItem: number | null;
  estimatedFreeMonthlyPhotosRemaining: number;
  onAttachPhoto: (itemId: string, source: 'camera' | 'gallery') => void;
  onRemoveDraftItemPhoto: (itemId: string, photoId: string) => void;
  onUpdateDraftItem: (
    itemId: string,
    updates: DraftVisitItemUpdates,
  ) => void;
  onVisitDateChange: (value: string) => void;
  onVisitVisibilityChange: (value: VisibilityOptionValue) => void;
  shouldShowPhotoUpgradePrompt: boolean;
  showOfflineUsageWarning: boolean;
  showUsageEstimate: boolean;
  photoLoadWarningMessage?: string | null;
  visitDate: string;
  visitVisibility: 'friends' | 'private';
}

const useStyles = createThemedStyles((theme) => ({
  itemCard: {
    gap: theme.spacing.sm,
  },
  statusCard: {
    gap: theme.spacing.xs,
  },
}));

export function CreateVisitReviewStep({
  detectedVisitDateValue,
  draftItems,
  displayMaxPhotosPerItem,
  estimatedFreeMonthlyPhotosRemaining,
  onAttachPhoto,
  onRemoveDraftItemPhoto,
  onUpdateDraftItem,
  onVisitDateChange,
  onVisitVisibilityChange,
  shouldShowPhotoUpgradePrompt,
  showOfflineUsageWarning,
  showUsageEstimate,
  photoLoadWarningMessage = null,
  visitDate,
  visitVisibility,
}: CreateVisitReviewStepProps) {
  const styles = useStyles();
  const [photoViewerPreviewUrls, setPhotoViewerPreviewUrls] = useState<string[]>([]);
  const [photoViewerUrls, setPhotoViewerUrls] = useState<string[]>([]);
  const [photoViewerInitialIndex, setPhotoViewerInitialIndex] = useState(0);
  const [isPhotoViewerVisible, setIsPhotoViewerVisible] = useState(false);

  const openPhotoViewer = useCallback(
    (photos: DraftVisitItemPhoto[], initialIndex: number) => {
      if (photos.length === 0) {
        return;
      }

      setPhotoViewerPreviewUrls(photos.map((photo) => photo.thumbnailUri));
      setPhotoViewerUrls(photos.map((photo) => photo.viewerUri));
      setPhotoViewerInitialIndex(initialIndex);
      setIsPhotoViewerVisible(true);
    },
    [],
  );

  const closePhotoViewer = useCallback(() => {
    setIsPhotoViewerVisible(false);
  }, []);

  return (
    <>
      {showOfflineUsageWarning ? (
        <Card style={styles.statusCard}>
          <Text tone="warning">
            Offline estimate may be stale. Backend limits are enforced when sync
            runs.
          </Text>
        </Card>
      ) : null}

      {showUsageEstimate ? (
        <Card style={styles.statusCard} tone="muted">
          <Text tone="secondary">
            Monthly photo estimate: {estimatedFreeMonthlyPhotosRemaining} left.
          </Text>
        </Card>
      ) : null}

      {photoLoadWarningMessage ? (
        <Card style={styles.statusCard} tone="muted">
          <Text tone="warning">{photoLoadWarningMessage}</Text>
        </Card>
      ) : null}

      {shouldShowPhotoUpgradePrompt ? (
        <UpgradePromptCard
          description={
            estimatedFreeMonthlyPhotosRemaining <= 0
              ? "You have reached this month's free photo limit. Subscriber accounts have higher monthly photo limits."
              : `Only ${estimatedFreeMonthlyPhotosRemaining} photo uploads left this month. Subscriber accounts have higher monthly photo limits.`
          }
          title={
            estimatedFreeMonthlyPhotosRemaining <= 0
              ? 'Free limit reached'
              : 'You are close to your free limit'
          }
        />
      ) : null}

      <VisitMetadataCard
        dateLabel="Visit Date"
        dateModalTitle="Select visit date"
        dateValue={visitDate}
        detectedDateValue={detectedVisitDateValue}
        onDateChange={onVisitDateChange}
        onVisibilityChange={onVisitVisibilityChange}
        visibilityValue={visitVisibility}
      />

      <RatingLegend initiallyExpanded />

      {draftItems.map((item, index) => (
        <Card key={item.id} style={styles.itemCard}>
          <Text variant="label">{item.name}</Text>
          <RatingSelector
            onChange={(value) => {
              onUpdateDraftItem(item.id, { rating: value });
            }}
            testIDPrefix={`create-visit-rating-${index}`}
            value={item.rating}
          />
          <Input
            label="Description"
            onChangeText={(value) => {
              onUpdateDraftItem(item.id, { description: value });
            }}
            placeholder="Optional description or modification"
            value={item.description}
          />
          <PhotoInputField
            attachments={item.photos.map((photo, photoIndex) => ({
              id: photo.id,
              label: photo.labelDate,
              uri: photo.thumbnailUri,
              accessibilityLabel: `View attached photo ${photoIndex + 1} full screen`,
              onPress: () => {
                openPhotoViewer(item.photos, photoIndex);
              },
              onRemove: () => {
                closePhotoViewer();
                onRemoveDraftItemPhoto(item.id, photo.id);
              },
            }))}
            cameraSubtitle="Camera"
            cameraTitle="Capture"
            countLabel={
              displayMaxPhotosPerItem === null
                ? null
                : `${item.photos.length}/${displayMaxPhotosPerItem}`
            }
            gallerySubtitle="Photo Library"
            galleryTitle="Upload"
            iconName="images-outline"
            label="Add photos"
            onCameraPress={() => {
              onAttachPhoto(item.id, 'camera');
            }}
            onGalleryPress={() => {
              onAttachPhoto(item.id, 'gallery');
            }}
          />
          <Input
            label="Notes"
            onChangeText={(value) => {
              onUpdateDraftItem(item.id, { notes: value });
            }}
            placeholder='Optional notes, e.g. "tastes the same as every other boba shop"'
            value={item.notes}
          />
        </Card>
      ))}

      <PhotoViewerModal
        initialIndex={photoViewerInitialIndex}
        onRequestClose={closePhotoViewer}
        previewUrls={photoViewerPreviewUrls}
        urls={photoViewerUrls}
        visible={isPhotoViewerVisible}
      />
    </>
  );
}
