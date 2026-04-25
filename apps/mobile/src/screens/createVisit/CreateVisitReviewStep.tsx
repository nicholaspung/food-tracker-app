import { useCallback, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';

import {
  ConfirmDestructiveModal,
  EmptyState,
  PhotoInputField,
  PhotoViewerModal,
  RatingLegend,
  RatingSelector,
  UpgradePromptCard,
  VisitMetadataCard,
  type VisibilityOptionValue,
} from '../../components/shared';
import { createThemedStyles, useTheme } from '../../theme';
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
  allowItemRemoval?: boolean;
  onAttachPhoto: (itemId: string, source: 'camera' | 'gallery') => void;
  onRemoveDraftItem?: (itemId: string) => void;
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
  itemHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  itemTitle: {
    flex: 1,
  },
  removeItemButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
    minWidth: 36,
    padding: theme.spacing.xxs,
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
  allowItemRemoval = false,
  onAttachPhoto,
  onRemoveDraftItem,
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
  const theme = useTheme();
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

      {draftItems.length === 0 ? (
        <EmptyState
          description="Add at least one item before saving this visit."
          title="No items selected"
        />
      ) : null}

      {draftItems.map((item, index) => (
        <Card key={item.id} style={styles.itemCard}>
          <View style={styles.itemHeaderRow}>
            <View style={styles.itemTitle}>
              <Text variant="label">{item.name}</Text>
            </View>
            {canRemoveItems ? (
              <Pressable
                accessibilityLabel={`Remove ${item.name} from visit`}
                accessibilityRole="button"
                hitSlop={12}
                onPress={() => {
                  setPendingRemoveItem(item);
                }}
                style={styles.removeItemButton}
                testID={`create-visit-remove-item-button-${index}`}
              >
                <Ionicons
                  color={theme.colors.text.danger}
                  name="trash-outline"
                  size={18}
                />
              </Pressable>
            ) : null}
          </View>
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
