import { useCallback, useState } from 'react';

import {
  ConfirmDestructiveModal,
  EmptyState,
  LightweightStatusCard,
  OFFLINE_USAGE_WARNING_MESSAGE,
  PhotoInputField,
  PhotoViewerModal,
  RatingLegend,
  VisitItemRatingCard,
  VisitMetadataCard,
  type VisibilityOptionValue,
} from '../../components/shared';
import { createThemedStyles } from '../../theme';
import { Text } from '../../ui';
import type { DraftVisitItem, DraftVisitItemPhoto } from './shared';

type DraftVisitItemUpdates = Partial<
  Pick<DraftVisitItem, 'rating' | 'description' | 'notes' | 'photos'>
>;

interface CreateVisitReviewStepProps {
  detectedVisitDateValue: string | null;
  draftItems: DraftVisitItem[];
  displayMaxPhotosPerItem: number | null;
  allowItemRemoval?: boolean;
  onAttachPhoto: (itemId: string, source: 'camera' | 'gallery') => void;
  onRemoveDraftItem?: (itemId: string) => void;
  onRemoveDraftItemPhoto: (itemId: string, photoId: string) => void;
  photoActionsHidden?: boolean;
  onUpdateDraftItem: (
    itemId: string,
    updates: DraftVisitItemUpdates,
  ) => void;
  onVisitDateChange: (value: string) => void;
  onVisitVisibilityChange: (value: VisibilityOptionValue) => void;
  showOfflineUsageWarning: boolean;
  photoLoadWarningMessage?: string | null;
  photoQuotaStatusMessage?: string | null;
  visitDate: string;
  visitVisibility: 'friends' | 'private';
}

const useStyles = createThemedStyles((theme) => ({
  statusCard: {
    gap: theme.spacing.xs,
  },
}));

export function CreateVisitReviewStep({
  detectedVisitDateValue,
  draftItems,
  displayMaxPhotosPerItem,
  allowItemRemoval = false,
  onAttachPhoto,
  onRemoveDraftItem,
  onRemoveDraftItemPhoto,
  photoActionsHidden = false,
  onUpdateDraftItem,
  onVisitDateChange,
  onVisitVisibilityChange,
  showOfflineUsageWarning,
  photoLoadWarningMessage = null,
  photoQuotaStatusMessage = null,
  visitDate,
  visitVisibility,
}: CreateVisitReviewStepProps) {
  const styles = useStyles();
  const [photoViewerPreviewUrls, setPhotoViewerPreviewUrls] = useState<string[]>([]);
  const [photoViewerUrls, setPhotoViewerUrls] = useState<string[]>([]);
  const [photoViewerInitialIndex, setPhotoViewerInitialIndex] = useState(0);
  const [isPhotoViewerVisible, setIsPhotoViewerVisible] = useState(false);
  const [pendingRemoveItem, setPendingRemoveItem] = useState<DraftVisitItem | null>(null);
  const canRemoveItems = allowItemRemoval && Boolean(onRemoveDraftItem);

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

  const handleConfirmRemoveItem = useCallback(() => {
    if (!pendingRemoveItem || !onRemoveDraftItem) {
      return;
    }

    onRemoveDraftItem(pendingRemoveItem.id);
    setPendingRemoveItem(null);
  }, [onRemoveDraftItem, pendingRemoveItem]);

  return (
    <>
      {showOfflineUsageWarning ? (
        <LightweightStatusCard
          cardTone="default"
          message={OFFLINE_USAGE_WARNING_MESSAGE}
          style={styles.statusCard}
        />
      ) : null}

      {photoLoadWarningMessage ? (
        <LightweightStatusCard message={photoLoadWarningMessage} style={styles.statusCard} />
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

      {draftItems.length === 0 ? (
        <EmptyState
          description="Add at least one item before saving this visit."
          title="No items selected"
        />
      ) : null}

      {draftItems.map((item, index) => (
        <VisitItemRatingCard
          key={item.id}
          descriptionValue={item.description}
          itemName={item.name}
          notesPlaceholder='Optional notes, e.g. "tastes the same as every other boba shop"'
          notesValue={item.notes}
          onDescriptionChange={(value) => {
            onUpdateDraftItem(item.id, { description: value });
          }}
          onNotesChange={(value) => {
            onUpdateDraftItem(item.id, { notes: value });
          }}
          onRatingChange={(value) => {
            onUpdateDraftItem(item.id, { rating: value });
          }}
          onRequestRemove={
            canRemoveItems
              ? () => {
                  setPendingRemoveItem(item);
                }
              : undefined
          }
          photoSection={
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
                displayMaxPhotosPerItem === null ||
                (photoActionsHidden && item.photos.length === 0)
                  ? null
                  : `${item.photos.length}/${displayMaxPhotosPerItem}`
              }
              footerAction={
                photoQuotaStatusMessage ? (
                  <Text tone="secondary" variant="bodySm">
                    {photoQuotaStatusMessage}
                  </Text>
                ) : null
              }
              gallerySubtitle="Photo Library"
              galleryTitle="Upload"
              hideSourceActions={photoActionsHidden}
              iconName="images-outline"
              label="Add photos"
              onCameraPress={() => {
                onAttachPhoto(item.id, 'camera');
              }}
              onGalleryPress={() => {
                onAttachPhoto(item.id, 'gallery');
              }}
            />
          }
          rating={item.rating}
          removeAccessibilityLabel={`Remove ${item.name} from visit`}
          removeTestID={`create-visit-remove-item-button-${index}`}
          showDescription
          testIDPrefix={`create-visit-rating-${index}`}
        />
      ))}

      <PhotoViewerModal
        initialIndex={photoViewerInitialIndex}
        onRequestClose={closePhotoViewer}
        previewUrls={photoViewerPreviewUrls}
        urls={photoViewerUrls}
        visible={isPhotoViewerVisible}
      />

      <ConfirmDestructiveModal
        cancelLabel="Keep Item"
        confirmLabel="Remove Item"
        description={
          pendingRemoveItem
            ? `Remove "${pendingRemoveItem.name}" from this visit? This item will be removed when you save changes.`
            : 'Remove this item from this visit?'
        }
        onCancel={() => {
          setPendingRemoveItem(null);
        }}
        onConfirm={handleConfirmRemoveItem}
        testID="create-visit-remove-item-confirmation-modal"
        title="Remove Item?"
        visible={Boolean(pendingRemoveItem)}
      />
    </>
  );
}
