import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import {
  buildPocketBaseFileUrl,
  type QuickTrackRecord,
  type VisitRecord,
} from '../../features';
import { getRatingColor, getRatingLabel } from '../../lib/ratingConstants';
import { createThemedStyles, useTheme } from '../../theme';
import { Card, Text } from '../../ui';

export interface HomeBetaFeedPhotoRecord {
  id: string;
  food_item?: string;
  photo: string;
  collectionId?: string;
  collectionName?: string;
  created: string;
}

interface SharePhotoInput {
  itemName: string;
  photo: HomeBetaFeedPhotoRecord;
  rating: number;
  restaurantName: string;
  visitDate: string;
}

interface HomeBetaFeedCardBaseProps {
  ownerLabel: string;
  dateLabel: string;
  timeLabel: string;
  onDelete?: () => void;
  onEdit?: () => void;
}

interface HomeBetaVisitFeedCardProps extends HomeBetaFeedCardBaseProps {
  visit: VisitRecord;
  restaurantMetaLabel?: string;
  photosByFoodItem: Map<string, HomeBetaFeedPhotoRecord[]>;
  onOpenPhotoViewer: (photos: HomeBetaFeedPhotoRecord[], initialIndex?: number) => void;
  onSharePhoto: (input: SharePhotoInput) => void;
  onShareVisit?: () => void;
}

interface HomeBetaQuickTrackFeedCardProps extends HomeBetaFeedCardBaseProps {
  quickTrack: QuickTrackRecord;
  categoryLabel?: string;
  locationLabel?: string;
  photos: HomeBetaFeedPhotoRecord[];
  onOpenPhotoViewer: (photos: HomeBetaFeedPhotoRecord[], initialIndex?: number) => void;
  onSharePhoto: (input: SharePhotoInput) => void;
}

interface VisitCarouselEntry {
  id: string;
  description?: string;
  mediaUrl: string | null;
  name: string;
  notes?: string;
  photos: HomeBetaFeedPhotoRecord[];
  primaryPhoto: HomeBetaFeedPhotoRecord | null;
  rating: number;
}

const useStyles = createThemedStyles((theme) => ({
  card: {
    borderColor: theme.colors.border.default,
    borderRadius: theme.radii.lg,
    overflow: 'hidden',
    padding: 0,
    shadowColor: theme.colors.background.inverse,
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 2,
  },
  headerBlock: {
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
  },
  ownerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  sectionDivider: {
    backgroundColor: theme.colors.border.subtle,
    height: 1,
    width: '100%',
  },
  ownerName: {
    color: theme.colors.text.primary,
    flex: 1,
  },
  headerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.background.surface,
    borderColor: theme.colors.border.default,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  iconButtonDanger: {
    borderColor: theme.colors.border.danger,
  },
  restaurantRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
    paddingBottom: theme.spacing.sm,
  },
  restaurantName: {
    color: theme.colors.text.primary,
    flex: 1,
  },
  restaurantMeta: {
    color: theme.colors.text.muted,
    maxWidth: '45%',
    textAlign: 'right',
    textTransform: 'uppercase',
  },
  mediaViewport: {
    backgroundColor: theme.colors.background.muted,
    width: '100%',
  },
  mediaPage: {
    width: 1,
  },
  mediaFrame: {
    aspectRatio: 1,
    backgroundColor: theme.colors.background.muted,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },
  mediaFramePressable: {
    flex: 1,
  },
  mediaImage: {
    height: '100%',
    width: '100%',
  },
  mediaTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    left: theme.spacing.sm,
    position: 'absolute',
    right: theme.spacing.sm,
    top: theme.spacing.sm,
  },
  mediaTopRightGroup: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  mediaPill: {
    backgroundColor: theme.colors.background.surface,
    borderColor: theme.colors.border.default,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 4,
  },
  mediaPillLabel: {
    color: theme.colors.text.secondary,
    textTransform: 'uppercase',
  },
  paginationRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  paginationArrowButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.background.surface,
    borderColor: theme.colors.border.default,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  paginationArrowButtonDisabled: {
    opacity: 0.45,
  },
  paginationIndicators: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.sm,
  },
  indicatorDot: {
    backgroundColor: theme.colors.border.subtle,
    borderRadius: theme.radii.pill,
    height: 6,
    width: 6,
  },
  indicatorDotActive: {
    backgroundColor: theme.colors.text.brand,
    width: 18,
  },
  contentBlock: {
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
  },
  itemHeaderRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  itemHeaderCopy: {
    flex: 1,
    gap: theme.spacing.xxs,
  },
  itemName: {
    color: theme.colors.text.primary,
    fontStyle: 'italic',
  },
  itemDescription: {
    color: theme.colors.text.secondary,
  },
  itemNotes: {
    color: theme.colors.text.muted,
    fontStyle: 'italic',
  },
  itemMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  metaChip: {
    alignItems: 'center',
    backgroundColor: theme.colors.background.muted,
    borderColor: theme.colors.border.subtle,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 4,
  },
  metaChipLabel: {
    color: theme.colors.text.secondary,
    textTransform: 'uppercase',
  },
  ratingBand: {
    alignItems: 'center',
    borderRadius: theme.radii.md,
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  ratingBandLabel: {
    color: theme.colors.text.inverse,
  },
  footerMeta: {
    color: theme.colors.text.muted,
    textTransform: 'uppercase',
  },
  emptyText: {
    color: theme.colors.text.secondary,
  },
}));

function useHomeBetaFeedCardStyles() {
  const theme = useTheme();
  const styles = useStyles();

  return { styles, theme };
}

function buildPhotoUrl(photo: HomeBetaFeedPhotoRecord): string {
  return buildPocketBaseFileUrl({
    collectionId: photo.collectionId,
    collectionName: photo.collectionName ?? 'visit_photos',
    recordId: photo.id,
    filename: photo.photo,
    thumb: '1200x1200',
  });
}

function formatCategoryLabel(category: string): string {
  return category.replace(/_/g, ' ');
}

function clampIndex(index: number, itemCount: number): number {
  if (itemCount <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(index, itemCount - 1));
}

function HeaderActions({
  onDelete,
  onEdit,
  onShare,
}: {
  onDelete?: () => void;
  onEdit?: () => void;
  onShare?: () => void;
}) {
  const { styles, theme } = useHomeBetaFeedCardStyles();

  if (!onDelete && !onEdit && !onShare) {
    return null;
  }

  return (
    <View style={styles.headerActions}>
      {onShare ? (
        <Pressable accessibilityLabel="Share visit" onPress={onShare} style={styles.iconButton}>
          <Ionicons color={theme.colors.text.secondary} name="share-social-outline" size={16} />
        </Pressable>
      ) : null}
      {onEdit ? (
        <Pressable accessibilityLabel="Edit entry" onPress={onEdit} style={styles.iconButton}>
          <Ionicons color={theme.colors.text.secondary} name="create-outline" size={16} />
        </Pressable>
      ) : null}
      {onDelete ? (
        <Pressable accessibilityLabel="Delete entry" onPress={onDelete} style={[styles.iconButton, styles.iconButtonDanger]}>
          <Ionicons color={theme.colors.text.danger} name="trash-outline" size={16} />
        </Pressable>
      ) : null}
    </View>
  );
}

function PaginationControls({
  activeIndex,
  itemCount,
  onChangeIndex,
}: {
  activeIndex: number;
  itemCount: number;
  onChangeIndex: (index: number) => void;
}) {
  const { styles, theme } = useHomeBetaFeedCardStyles();

  if (itemCount <= 1) {
    return null;
  }

  const previousIndex = clampIndex(activeIndex - 1, itemCount);
  const nextIndex = clampIndex(activeIndex + 1, itemCount);

  return (
    <View style={styles.paginationRow}>
      <Pressable
        accessibilityLabel="Show previous rated item"
        disabled={activeIndex === 0}
        onPress={() => {
          onChangeIndex(previousIndex);
        }}
        style={[
          styles.paginationArrowButton,
          activeIndex === 0 ? styles.paginationArrowButtonDisabled : null,
        ]}
      >
        <Ionicons color={theme.colors.text.primary} name="chevron-back" size={16} />
      </Pressable>

      <View style={styles.paginationIndicators}>
        {Array.from({ length: itemCount }).map((_, index) => (
          <View
            key={`indicator-${index}`}
            style={[
              styles.indicatorDot,
              index === activeIndex ? styles.indicatorDotActive : null,
            ]}
          />
        ))}
      </View>

      <Pressable
        accessibilityLabel="Show next rated item"
        disabled={activeIndex === itemCount - 1}
        onPress={() => {
          onChangeIndex(nextIndex);
        }}
        style={[
          styles.paginationArrowButton,
          activeIndex === itemCount - 1 ? styles.paginationArrowButtonDisabled : null,
        ]}
      >
        <Ionicons color={theme.colors.text.primary} name="chevron-forward" size={16} />
      </Pressable>
    </View>
  );
}

function CarouselMedia({
  activeIndex,
  entryCount,
  mediaLabels,
  onChangeIndex,
  onOpenViewer,
}: {
  activeIndex: number;
  entryCount: number;
  mediaLabels: {
    id: string;
    mediaUrl: string | null;
    name: string;
    photos: HomeBetaFeedPhotoRecord[];
  }[];
  onChangeIndex: (index: number) => void;
  onOpenViewer: (photos: HomeBetaFeedPhotoRecord[], initialIndex?: number) => void;
}) {
  const { styles } = useHomeBetaFeedCardStyles();
  const scrollRef = useRef<ScrollView | null>(null);
  const lastSyncedIndexRef = useRef(activeIndex);
  const [carouselWidth, setCarouselWidth] = useState(0);

  useEffect(() => {
    if (!carouselWidth) {
      return;
    }

    scrollRef.current?.scrollTo({
      animated: lastSyncedIndexRef.current !== activeIndex,
      x: activeIndex * carouselWidth,
      y: 0,
    });
    lastSyncedIndexRef.current = activeIndex;
  }, [activeIndex, carouselWidth]);

  const handleLayout = (event: LayoutChangeEvent) => {
    const nextWidth = Math.round(event.nativeEvent.layout.width);
    if (nextWidth > 0 && nextWidth !== carouselWidth) {
      setCarouselWidth(nextWidth);
    }
  };

  const handleMomentumEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!carouselWidth) {
      return;
    }

    const nextIndex = clampIndex(
      Math.round(event.nativeEvent.contentOffset.x / carouselWidth),
      mediaLabels.length,
    );
    onChangeIndex(nextIndex);
  };

  return (
    <View onLayout={handleLayout} style={styles.mediaViewport}>
      <ScrollView
        horizontal
        nestedScrollEnabled
        onMomentumScrollEnd={handleMomentumEnd}
        pagingEnabled
        ref={scrollRef}
        scrollEnabled={entryCount > 1}
        scrollEventThrottle={16}
        showsHorizontalScrollIndicator={false}
        style={styles.mediaViewport}
      >
        {mediaLabels.map((entry, index) => (
          <View
            key={entry.id}
            style={[styles.mediaPage, carouselWidth ? { width: carouselWidth } : null]}
          >
            {entry.mediaUrl ? (
              <Pressable
                accessibilityLabel={`View photos for ${entry.name}`}
                onPress={() => {
                  onOpenViewer(entry.photos);
                }}
                style={styles.mediaFramePressable}
              >
                <View style={styles.mediaFrame}>
                  <Image source={{ uri: entry.mediaUrl }} style={styles.mediaImage} />

                  <View style={styles.mediaTopRow}>
                    <View style={styles.mediaPill}>
                      <Text style={styles.mediaPillLabel} variant="caption">Visit</Text>
                    </View>
                    <View style={styles.mediaTopRightGroup}>
                      {entry.photos.length > 1 ? (
                        <View style={styles.mediaPill}>
                          <Text style={styles.mediaPillLabel} variant="caption">
                            {entry.photos.length} photos
                          </Text>
                        </View>
                      ) : null}
                      <View style={styles.mediaPill}>
                        <Text style={styles.mediaPillLabel} variant="caption">
                          {index + 1} / {entryCount}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
              </Pressable>
            ) : (
              <View style={styles.mediaFrame} />
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

export function HomeBetaVisitFeedCard({
  ownerLabel,
  dateLabel,
  timeLabel,
  onDelete,
  onEdit,
  onOpenPhotoViewer,
  onSharePhoto,
  onShareVisit,
  photosByFoodItem,
  restaurantMetaLabel,
  visit,
}: HomeBetaVisitFeedCardProps) {
  const { styles, theme } = useHomeBetaFeedCardStyles();
  const carouselEntries = useMemo<VisitCarouselEntry[]>(
    () =>
      visit.items.map((item) => {
        const photos = photosByFoodItem.get(item.id) ?? [];
        const primaryPhoto = photos[0] ?? null;

        return {
          id: item.id,
          description: item.description?.trim() || undefined,
          mediaUrl: primaryPhoto ? buildPhotoUrl(primaryPhoto) : null,
          name: item.name,
          notes: item.notes?.trim() || undefined,
          photos,
          primaryPhoto,
          rating: item.rating,
        };
      }),
    [photosByFoodItem, visit.items],
  );
  const initialActiveIndex = useMemo(() => {
    const firstPhotoIndex = carouselEntries.findIndex((entry) => Boolean(entry.mediaUrl));
    return firstPhotoIndex >= 0 ? firstPhotoIndex : 0;
  }, [carouselEntries]);
  const [activeIndex, setActiveIndex] = useState(initialActiveIndex);

  useEffect(() => {
    setActiveIndex((previousValue) => clampIndex(previousValue, carouselEntries.length));
  }, [carouselEntries.length]);

  useEffect(() => {
    setActiveIndex(initialActiveIndex);
  }, [initialActiveIndex]);

  const activeEntry = carouselEntries[activeIndex] ?? null;
  const ratingColor = activeEntry ? getRatingColor(theme, activeEntry.rating) : theme.colors.background.muted;
  const resolvedRestaurantMetaLabel =
    restaurantMetaLabel || `${visit.items.length} ${visit.items.length === 1 ? 'item' : 'items'}`;

  return (
    <Card style={styles.card}>
      <View style={styles.headerBlock}>
        <View style={styles.ownerRow}>
          <Text numberOfLines={1} style={styles.ownerName} variant="titleSm">
            {ownerLabel}
          </Text>
          <HeaderActions onDelete={onDelete} onEdit={onEdit} onShare={onShareVisit} />
        </View>
        <View style={styles.sectionDivider} />

        <View style={styles.restaurantRow}>
          <Text numberOfLines={1} style={styles.restaurantName} variant="bodyLgBold">
            {visit.restaurantName}
          </Text>
          <Text numberOfLines={1} style={styles.restaurantMeta} variant="bodySmSemiBold">
            {resolvedRestaurantMetaLabel}
          </Text>
        </View>
      </View>

      {carouselEntries.length > 0 ? (
        <>
          {activeEntry?.mediaUrl ? (
            <CarouselMedia
              activeIndex={activeIndex}
              entryCount={carouselEntries.length}
              mediaLabels={carouselEntries.map((entry) => ({
                id: entry.id,
                mediaUrl: entry.mediaUrl,
                name: entry.name,
                photos: entry.photos,
              }))}
              onChangeIndex={setActiveIndex}
              onOpenViewer={onOpenPhotoViewer}
            />
          ) : null}

          {activeEntry ? (
            <View style={styles.contentBlock}>
              <PaginationControls
                activeIndex={activeIndex}
                itemCount={carouselEntries.length}
                onChangeIndex={setActiveIndex}
              />

              <View style={styles.itemHeaderRow}>
                <View style={styles.itemHeaderCopy}>
                  <Text numberOfLines={2} style={styles.itemName} variant="cardTitle">
                    {activeEntry.name}
                  </Text>
                  {activeEntry.description ? (
                    <Text style={styles.itemDescription} variant="bodyMd">{activeEntry.description}</Text>
                  ) : null}
                </View>
                {activeEntry.primaryPhoto ? (
                  <Pressable
                    accessibilityLabel={`Share ${activeEntry.name}`}
                    onPress={() => {
                      onSharePhoto({
                        itemName: activeEntry.name,
                        photo: activeEntry.primaryPhoto!,
                        rating: activeEntry.rating,
                        restaurantName: visit.restaurantName,
                        visitDate: visit.visitedAt || visit.createdAt,
                      });
                    }}
                    style={styles.iconButton}
                  >
                    <Ionicons color={theme.colors.text.secondary} name="share-social-outline" size={16} />
                  </Pressable>
                ) : null}
              </View>

              {activeEntry.notes ? (
                <Text style={styles.itemNotes} variant="bodyMd">"{activeEntry.notes}"</Text>
              ) : null}

              <View style={[styles.ratingBand, { backgroundColor: ratingColor }]}>
                <Text style={styles.ratingBandLabel} variant="label">{getRatingLabel(activeEntry.rating)}</Text>
              </View>

              <View style={styles.sectionDivider} />
              <Text style={styles.footerMeta} variant="bodySm">
                {dateLabel} • {timeLabel}
              </Text>
            </View>
          ) : null}
        </>
      ) : (
        <View style={styles.contentBlock}>
          <Text style={styles.emptyText} variant="bodyMd">No rated items were recorded for this visit.</Text>
          <View style={styles.sectionDivider} />
          <Text style={styles.footerMeta} variant="bodySm">
            {dateLabel} • {timeLabel}
          </Text>
        </View>
      )}
    </Card>
  );
}

export function HomeBetaQuickTrackFeedCard({
  categoryLabel,
  dateLabel,
  locationLabel,
  onDelete,
  onEdit,
  onOpenPhotoViewer,
  onSharePhoto,
  ownerLabel,
  photos,
  quickTrack,
  timeLabel,
}: HomeBetaQuickTrackFeedCardProps) {
  const { styles, theme } = useHomeBetaFeedCardStyles();
  const primaryPhoto = photos[0] ?? null;
  const photoUrl = primaryPhoto ? buildPhotoUrl(primaryPhoto) : null;
  const ratingColor = getRatingColor(theme, quickTrack.rating);
  const resolvedMetaLabel =
    categoryLabel || locationLabel || formatCategoryLabel(quickTrack.itemCategory ?? 'quick track');

  return (
    <Card style={styles.card}>
      <View style={styles.headerBlock}>
        <View style={styles.ownerRow}>
          <Text numberOfLines={1} style={styles.ownerName} variant="titleSm">
            {ownerLabel}
          </Text>
          <HeaderActions onDelete={onDelete} onEdit={onEdit} />
        </View>
        <View style={styles.sectionDivider} />

        <View style={styles.restaurantRow}>
          <Text numberOfLines={1} style={styles.restaurantName} variant="bodyLgBold">
            {quickTrack.restaurantName}
          </Text>
          <Text numberOfLines={1} style={styles.restaurantMeta} variant="bodySmSemiBold">
            {resolvedMetaLabel}
          </Text>
        </View>
      </View>

      {photoUrl ? (
        <View style={styles.mediaViewport}>
          <Pressable
            accessibilityLabel={`View photos for ${quickTrack.itemName}`}
            onPress={() => {
              onOpenPhotoViewer(photos);
            }}
            style={styles.mediaFramePressable}
          >
            <View style={styles.mediaFrame}>
              <Image source={{ uri: photoUrl }} style={styles.mediaImage} />

              <View style={styles.mediaTopRow}>
                <View style={styles.mediaPill}>
                  <Text style={styles.mediaPillLabel} variant="caption">Quick</Text>
                </View>
                <View style={styles.mediaTopRightGroup}>
                  {photos.length > 1 ? (
                    <View style={styles.mediaPill}>
                      <Text style={styles.mediaPillLabel} variant="caption">{photos.length} photos</Text>
                    </View>
                  ) : null}
                  <View style={styles.mediaPill}>
                    <Text style={styles.mediaPillLabel} variant="caption">1 / 1</Text>
                  </View>
                </View>
              </View>
            </View>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.contentBlock}>
        <View style={styles.itemHeaderRow}>
          <View style={styles.itemHeaderCopy}>
            <Text numberOfLines={2} style={styles.itemName} variant="cardTitle">
              {quickTrack.itemName}
            </Text>
            {locationLabel ? (
              <Text style={styles.itemDescription} variant="bodyMd">{locationLabel}</Text>
            ) : null}
          </View>
          {primaryPhoto ? (
            <Pressable
              accessibilityLabel={`Share ${quickTrack.itemName}`}
              onPress={() => {
                onSharePhoto({
                  itemName: quickTrack.itemName,
                  photo: primaryPhoto,
                  rating: quickTrack.rating,
                  restaurantName: quickTrack.restaurantName,
                  visitDate: quickTrack.itemDate || quickTrack.createdAt,
                });
              }}
              style={styles.iconButton}
            >
              <Ionicons color={theme.colors.text.secondary} name="share-social-outline" size={16} />
            </Pressable>
          ) : null}
        </View>

        {categoryLabel ? (
          <View style={styles.itemMetaRow}>
            <View style={styles.metaChip}>
              <Text style={styles.metaChipLabel} variant="caption">{categoryLabel}</Text>
            </View>
          </View>
        ) : null}

        {quickTrack.notes ? (
          <Text style={styles.itemNotes} variant="bodyMd">"{quickTrack.notes.trim()}"</Text>
        ) : null}

        <View style={[styles.ratingBand, { backgroundColor: ratingColor }]}>
          <Text style={styles.ratingBandLabel} variant="label">{getRatingLabel(quickTrack.rating)}</Text>
        </View>

        <View style={styles.sectionDivider} />
        <Text style={styles.footerMeta} variant="bodySm">
          {dateLabel} • {timeLabel}
        </Text>
      </View>
    </Card>
  );
}
