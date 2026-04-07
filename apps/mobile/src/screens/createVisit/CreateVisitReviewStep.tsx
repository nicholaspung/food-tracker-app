import { Ionicons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import {
  PhotoAttachmentRow,
  PhotoSourceActionCards,
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
  estimatedFreeMonthlyPhotosRemaining: number;
  isEditMode: boolean;
  onAttachPhoto: (itemId: string, source: 'camera' | 'gallery') => void;
  onRemoveDraftItemPhoto: (itemId: string, uri: string) => void;
  onUpdateDraftItem: (
    itemId: string,
    updates: DraftVisitItemUpdates,
  ) => void;
  onVisitDateChange: (value: string) => void;
  onVisitVisibilityChange: (value: VisibilityOptionValue) => void;
  shouldShowPhotoUpgradePrompt: boolean;
  showOfflineUsageWarning: boolean;
  showUsageEstimate: boolean;
  visitDate: string;
  visitVisibility: 'friends' | 'private';
}

const useStyles = createThemedStyles((theme) => ({
  itemCard: {
    gap: theme.spacing.sm,
  },
  itemPhotoLabelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xxs,
  },
  itemPhotoList: {
    gap: theme.spacing.xs,
  },
  itemPhotoSection: {
    gap: theme.spacing.xs,
  },
  statusCard: {
    gap: theme.spacing.xs,
  },
}));

export function CreateVisitReviewStep({
  detectedVisitDateValue,
  draftItems,
  estimatedFreeMonthlyPhotosRemaining,
  isEditMode,
  onAttachPhoto,
  onRemoveDraftItemPhoto,
  onUpdateDraftItem,
  onVisitDateChange,
  onVisitVisibilityChange,
  shouldShowPhotoUpgradePrompt,
  showOfflineUsageWarning,
  showUsageEstimate,
  visitDate,
  visitVisibility,
}: CreateVisitReviewStepProps) {
  const theme = useTheme();
  const styles = useStyles();
  const [photoViewerUrls, setPhotoViewerUrls] = useState<string[]>([]);
  const [photoViewerInitialIndex, setPhotoViewerInitialIndex] = useState(0);
  const [isPhotoViewerVisible, setIsPhotoViewerVisible] = useState(false);

  const openPhotoViewer = useCallback(
    (photos: DraftVisitItemPhoto[], initialIndex: number) => {
      if (photos.length === 0) {
        return;
      }

      setPhotoViewerUrls(photos.map((photo) => photo.uri));
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

      {isEditMode ? (
        <Card style={styles.statusCard} tone="muted">
          <Text tone="secondary">
            Edit mode currently updates restaurant, date, visibility, ratings,
            descriptions, and notes.
          </Text>
        </Card>
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
          {!isEditMode ? (
            <>
              <View style={styles.itemPhotoSection}>
                <View style={styles.itemPhotoLabelRow}>
                  <Ionicons
                    color={theme.colors.text.secondary}
                    name="images-outline"
                    size={14}
                  />
                  <Text variant="label">Add photos</Text>
                </View>
                <PhotoSourceActionCards
                  cameraSubtitle="Camera"
                  cameraTitle="Capture"
                  gallerySubtitle="Photo Library"
                  galleryTitle="Upload"
                  onCameraPress={() => {
                    onAttachPhoto(item.id, 'camera');
                  }}
                  onGalleryPress={() => {
                    onAttachPhoto(item.id, 'gallery');
                  }}
                />
              </View>
              {item.photos.length > 0 ? (
                <View style={styles.itemPhotoList}>
                  {item.photos.map((photo, photoIndex) => (
                    <PhotoAttachmentRow
                      accessibilityLabel={`View attached photo ${photoIndex + 1} full screen`}
                      key={photo.uri}
                      name={photo.name}
                      onPress={() => {
                        openPhotoViewer(item.photos, photoIndex);
                      }}
                      onRemove={() => {
                        closePhotoViewer();
                        onRemoveDraftItemPhoto(item.id, photo.uri);
                      }}
                      uri={photo.uri}
                    />
                  ))}
                </View>
              ) : null}
            </>
          ) : null}
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
        urls={photoViewerUrls}
        visible={isPhotoViewerVisible}
      />
    </>
  );
}
