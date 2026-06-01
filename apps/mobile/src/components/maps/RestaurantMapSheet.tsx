import BottomSheet, {
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import {
  CachedRemoteImage,
  LoadingState,
  RatingPill,
  SegmentedControl,
  type SegmentedControlOption,
} from '../shared';
import { createThemedStyles, useTheme } from '../../theme';
import { Button, Text } from '../../ui';
import type {
  RestaurantMapGroup,
  RestaurantMapItem,
  RestaurantMapSheetTabId,
  RestaurantMapSheetTabs,
} from './restaurantMapTypes';

interface RestaurantMapSheetProps {
  mapOpenErrorMessage: string | null;
  mapOpenLoading: boolean;
  group: RestaurantMapGroup | null;
  onClose: () => void;
  onOpenInMaps: (group: RestaurantMapGroup) => Promise<void>;
  onOpenSelectedGroup?: (group: RestaurantMapGroup) => void;
  selectedGroupActionLabel?: string;
  tabs?: RestaurantMapSheetTabs | null;
}

const COLLAPSED_SNAP = 260;
const SNAP_POINTS = [COLLAPSED_SNAP, '42%', '76%'] as const;
const SHEET_TAB_OPTIONS: readonly SegmentedControlOption<RestaurantMapSheetTabId>[] = [
  { label: 'This Location', value: 'location' },
  { label: 'All Locations', value: 'allLocations' },
];

const useStyles = createThemedStyles((theme) => ({
  sheetBackground: {
    backgroundColor: theme.colors.background.surface,
    borderColor: theme.colors.border.default,
    borderWidth: 1,
  },
  handleIndicator: {
    backgroundColor: theme.colors.border.strong,
    width: 38,
  },
  handle: {
    paddingBottom: theme.spacing.xxs,
    paddingTop: theme.spacing.xs,
  },
  scrollContent: {
    gap: theme.spacing.xs,
    paddingBottom: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
  },
  header: {
    gap: theme.spacing.xxs,
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  title: {
    color: theme.colors.text.primary,
    flex: 1,
  },
  location: {
    color: theme.colors.text.secondary,
  },
  summary: {
    color: theme.colors.text.muted,
  },
  actions: {
    gap: theme.spacing.xxs,
  },
  actionRow: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  actionButton: {
    flex: 1,
  },
  itemRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.xs,
    paddingVertical: 5,
  },
  itemPhoto: {
    backgroundColor: theme.colors.background.muted,
    borderColor: theme.colors.border.default,
    borderRadius: theme.radii.sm,
    borderWidth: 1,
    height: 42,
    width: 42,
  },
  itemPhotoWrap: {
    borderRadius: theme.radii.sm,
  },
  photoCountBadge: {
    alignItems: 'center',
    backgroundColor: theme.colors.background.surface,
    borderColor: theme.colors.border.default,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    bottom: -4,
    minWidth: 20,
    paddingHorizontal: 4,
    position: 'absolute',
    right: -4,
  },
  photoCountText: {
    color: theme.colors.text.primary,
  },
  itemContent: {
    flex: 1,
    gap: 2,
  },
  itemTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  itemName: {
    color: theme.colors.text.primary,
    flex: 1,
  },
  itemMetaRow: {
    alignItems: 'center',
    columnGap: theme.spacing.xxs,
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 3,
  },
  itemMetaLabel: {
    color: theme.colors.text.info,
  },
  itemMetaDate: {
    color: theme.colors.text.secondary,
  },
  itemNotes: {
    color: theme.colors.text.muted,
  },
  groupNotes: {
    gap: 2,
  },
  groupNoteText: {
    color: theme.colors.text.secondary,
    fontStyle: 'italic',
  },
  mapOpenError: {
    color: theme.colors.text.warning,
  },
  tabsWrap: {
    gap: theme.spacing.sm,
    paddingTop: theme.spacing.xs,
  },
  tabState: {
    borderColor: theme.colors.border.default,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    gap: theme.spacing.xs,
    padding: theme.spacing.sm,
  },
  tabStateTitle: {
    color: theme.colors.text.primary,
  },
  tabStateDescription: {
    color: theme.colors.text.secondary,
  },
  showMoreButton: {
    alignItems: 'center',
    alignSelf: 'stretch',
    borderColor: theme.colors.border.default,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: theme.spacing.sm,
  },
  showMoreLabel: {
    color: theme.colors.text.primary,
  },
}));

function RestaurantItemRow({
  item,
}: {
  item: RestaurantMapItem;
}) {
  const styles = useStyles();
  const photoCount = item.photoCount ?? 0;

  return (
    <View style={styles.itemRow}>
      {item.photoThumbnailUrl ? (
        item.onOpenPhotos ? (
          <Pressable
            accessibilityLabel={`View photos for ${item.name}`}
            onPress={item.onOpenPhotos}
            style={styles.itemPhotoWrap}
          >
            <CachedRemoteImage
              accessibilityLabel={`${item.name} photo`}
              resizeMode="cover"
              style={styles.itemPhoto}
              uri={item.photoThumbnailUrl}
            />
            {photoCount > 1 ? (
              <View style={styles.photoCountBadge}>
                <Text style={styles.photoCountText} variant="bodySmTightBold">
                  +{photoCount - 1}
                </Text>
              </View>
            ) : null}
          </Pressable>
        ) : (
          <CachedRemoteImage
            accessibilityLabel={`${item.name} photo`}
            resizeMode="cover"
            style={styles.itemPhoto}
            uri={item.photoThumbnailUrl}
          />
        )
      ) : null}
      <View style={styles.itemContent}>
        <View style={styles.itemTitleRow}>
          <Text numberOfLines={1} style={styles.itemName} variant="bodyMdSemiBold">
            {item.name}
          </Text>
        </View>
        {item.meta.map((meta, index) => {
          const hasMeta = Boolean(meta.label || meta.rating || meta.dateLabel);
          if (!hasMeta) {
            return null;
          }

          return (
            <View key={`${item.id}-meta-${index}`} style={styles.itemMetaRow}>
              {meta.label ? (
                <Text style={styles.itemMetaLabel} variant="bodySmTightSemiBold">
                  {meta.label}
                </Text>
              ) : null}
              {meta.rating && meta.rating > 0 ? <RatingPill rating={meta.rating} /> : null}
              {meta.dateLabel ? (
                <Text numberOfLines={1} style={styles.itemMetaDate} variant="bodySmTightMedium">
                  {meta.dateLabel}
                </Text>
              ) : null}
            </View>
          );
        })}
        {item.notes ? (
          <Text numberOfLines={2} style={styles.itemNotes} variant="bodySmTight">
            {item.notes}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function RestaurantMapSheetTabContent({
  tab,
}: {
  tab: RestaurantMapSheetTabs['location'];
}) {
  const styles = useStyles();

  if (tab.loading) {
    return <LoadingState label={`Loading ${tab.title.toLowerCase()}...`} />;
  }

  if (tab.errorMessage) {
    return (
      <View style={styles.tabState}>
        <Text style={styles.tabStateTitle} variant="bodyMdSemiBold">
          {tab.title} unavailable
        </Text>
        <Text style={styles.tabStateDescription} variant="bodySm">
          {tab.errorMessage}
        </Text>
      </View>
    );
  }

  if (tab.items.length === 0) {
    return (
      <View style={styles.tabState}>
        <Text style={styles.tabStateTitle} variant="bodyMdSemiBold">
          {tab.emptyTitle}
        </Text>
        {tab.emptyDescription ? (
          <Text style={styles.tabStateDescription} variant="bodySm">
            {tab.emptyDescription}
          </Text>
        ) : null}
        {tab.actionLabel && tab.onActionPress ? (
          <Button
            label={tab.actionLabel}
            onPress={tab.onActionPress}
            testID="restaurant-map-sheet-tab-empty-action"
            variant="secondary"
          />
        ) : null}
      </View>
    );
  }

  return (
    <>
      {tab.items.map((item) => (
        <RestaurantItemRow item={item} key={item.id} />
      ))}
    </>
  );
}

export function RestaurantMapSheet({
  mapOpenErrorMessage,
  mapOpenLoading,
  group,
  onClose,
  onOpenInMaps,
  onOpenSelectedGroup,
  selectedGroupActionLabel = 'Open Restaurant',
  tabs = null,
}: RestaurantMapSheetProps) {
  const sheetRef = useRef<BottomSheet>(null);
  const previousGroupIdRef = useRef<string | null>(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const styles = useStyles();
  const theme = useTheme();
  const snapPoints = useMemo(() => [...SNAP_POINTS], []);

  useEffect(() => {
    if (!group) {
      previousGroupIdRef.current = null;
      return;
    }

    if (!previousGroupIdRef.current) {
      sheetRef.current?.snapToIndex(0);
    }
    previousGroupIdRef.current = group.id;
  }, [group]);

  if (!group) {
    return null;
  }

  const visibleItems = sheetIndex === 0 ? group.items.slice(0, 2) : group.items;
  const remainingItemCount = Math.max(group.items.length - 2, 0);
  const showMore = !tabs && group.items.length > 2 && sheetIndex === 0;
  const activeTab = tabs?.activeTab === 'allLocations' ? tabs.allLocations : tabs?.location;

  const expandSheet = () => {
    sheetRef.current?.snapToIndex(1);
  };

  return (
    <BottomSheet
      backgroundStyle={styles.sheetBackground}
      enablePanDownToClose
      handleIndicatorStyle={styles.handleIndicator}
      handleStyle={styles.handle}
      index={0}
      onChange={setSheetIndex}
      onClose={onClose}
      ref={sheetRef}
      snapPoints={snapPoints}
    >
      <BottomSheetScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Text numberOfLines={1} style={styles.title} variant="sectionTitleTight">
              {group.restaurantName}
            </Text>
          </View>
          {group.restaurantLocation ? (
            <Text numberOfLines={1} style={styles.location} variant="bodySmTightMedium">
              {group.restaurantLocation}
            </Text>
          ) : null}
          <Text style={styles.summary} variant="bodySmTightMedium">
            {group.summary}
          </Text>
        </View>

        <View style={styles.actions}>
          <View style={onOpenSelectedGroup ? styles.actionRow : undefined}>
            {onOpenSelectedGroup ? (
              <Button
                accessibilityLabel={`${selectedGroupActionLabel} ${group.restaurantName}`}
                label={selectedGroupActionLabel}
                onPress={() => {
                  onOpenSelectedGroup(group);
                }}
                style={styles.actionButton}
                testID="restaurant-map-open-selected-group-button"
              />
            ) : null}
            <Button
              accessibilityLabel={`Open ${group.restaurantName} in Maps`}
              label="Open in Maps"
              loading={mapOpenLoading}
              onPress={() => {
                void onOpenInMaps(group);
              }}
              style={onOpenSelectedGroup ? styles.actionButton : undefined}
              testID="restaurant-map-open-in-maps-button"
              variant="secondary"
            />
          </View>
          {mapOpenErrorMessage ? (
            <Text style={styles.mapOpenError} variant="bodySmTightSemiBold">
              {mapOpenErrorMessage}
            </Text>
          ) : null}
        </View>

        {tabs && activeTab ? (
          <View style={styles.tabsWrap}>
            <SegmentedControl
              getOptionTestID={(value) => `restaurant-map-sheet-tab-${value}`}
              onChange={tabs.onTabChange}
              options={SHEET_TAB_OPTIONS}
              value={tabs.activeTab}
            />
            <RestaurantMapSheetTabContent tab={activeTab} />
          </View>
        ) : (
          <>
            {visibleItems.map((item) => (
              <RestaurantItemRow item={item} key={item.id} />
            ))}
          </>
        )}

        {!tabs && group.notes?.length ? (
          <View style={styles.groupNotes}>
            {group.notes.map((note, index) => (
              <Text key={`${group.id}-note-${index}`} numberOfLines={2} style={styles.groupNoteText} variant="bodySm">
                "{note}"
              </Text>
            ))}
          </View>
        ) : null}

        {showMore ? (
          <Pressable
            accessibilityLabel={`Show all ${group.items.length} items for ${group.restaurantName}`}
            accessibilityRole="button"
            onPress={expandSheet}
            style={({ pressed }) => [
              styles.showMoreButton,
              pressed ? { backgroundColor: theme.colors.background.muted } : null,
            ]}
          >
            <Text style={styles.showMoreLabel} variant="bodySmTightSemiBold">
              Show {remainingItemCount} more
            </Text>
          </Pressable>
        ) : null}
      </BottomSheetScrollView>
    </BottomSheet>
  );
}
