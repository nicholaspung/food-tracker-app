import { Ionicons } from "../../ui/AppIcon";
import { useMemo } from "react";
import { Pressable, View } from "react-native";

import { createThemedStyles, useTheme } from "../../theme";
import { createPlatformShadow } from "../../theme/shadows";
import { Card, Input, Text } from "../../ui";
import { EmptyState } from "./EmptyState";
import { LoadingState } from "./LoadingState";
import { PageErrorToast } from "./PageErrorToast";
import { RatingPill } from "./RatingPill";
import { VisitMenuItemOptionRow } from "./VisitMenuItemOptionRow";

type MenuItemVisibility = "private" | "friends" | "public";

export interface RestaurantMenuItemPickerItem {
  id: string;
  restaurant: string;
  name: string;
  description?: string;
  createdBy?: string;
  visibility?: MenuItemVisibility;
  userEatenCount?: number;
  friendEatenCount?: number;
}

export interface RestaurantMenuItemPickerCrossLocationItem {
  id: string;
  name: string;
  source?: "relatedLocationSuggestion" | "allLocationsHistory";
  suggestionSource?: {
    type: "groupMenuSuggestion";
    sourceMenuItemId: string;
    sourceRestaurantId?: string;
    restaurantGroupId?: string;
    normalizedItemName?: string;
  };
  latestRating?: number;
  latestRestaurantName?: string;
  latestRestaurantLocation?: string;
  orderCount?: number;
  sourceItemCount?: number;
  sourceRestaurantCount?: number;
}

export interface RestaurantMenuItemPickerProps<
  TMenuItem extends RestaurantMenuItemPickerItem,
> {
  addManualDisabled?: boolean;
  addManualLabel?: string;
  currentUserId?: string;
  emptyDescription?: string;
  hasPendingMenuReview?: boolean;
  crossLocationDisabled?: boolean;
  crossLocationItems?: RestaurantMenuItemPickerCrossLocationItem[];
  crossLocationLabel?: string;
  crossLocationLoadingItemId?: string | null;
  isCrossLocationItemSelected?: (
    item: RestaurantMenuItemPickerCrossLocationItem,
  ) => boolean;
  isItemSelected: (item: TMenuItem) => boolean;
  isLoading: boolean;
  isOnline: boolean;
  isReviewDisabled?: boolean;
  isReviewSubmitted?: boolean;
  isTipVisible: boolean;
  items: TMenuItem[];
  label: string;
  onAddManual: () => void;
  onEditItem?: (item: TMenuItem) => void;
  onRequestMenuReview: () => void;
  onToggleCrossLocationItem?: (
    item: RestaurantMenuItemPickerCrossLocationItem,
  ) => void;
  onRetry: () => void;
  onScanMenuPhoto: () => void;
  onSearchQueryChange: (value: string) => void;
  onTipVisibilityChange: (visible: boolean) => void;
  onToggleItem: (item: TMenuItem) => void;
  scanDisabled?: boolean;
  searchQuery: string;
  selectedCount: number;
  testIDPrefix: string;
  hasError: boolean;
}

const useStyles = createThemedStyles((theme) => ({
  stepContainer: {
    gap: theme.spacing.md,
    position: "relative",
  },
  tipDismissOverlay: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 20,
  },
  tipIconButton: {
    alignItems: "center",
    borderColor: theme.colors.status.warningBorder,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  tipPopover: {
    backgroundColor: theme.colors.background.surface,
    borderColor: theme.colors.border.strong,
    borderRadius: theme.radii.md,
    borderWidth: 2,
    gap: theme.spacing.xs,
    maxWidth: 320,
    minWidth: 230,
    padding: theme.spacing.md,
    position: "absolute",
    right: theme.spacing.md,
    ...createPlatformShadow({
      color: theme.colors.background.inverse,
      elevation: 14,
      offset: { width: 0, height: 12 },
      opacity: 0.2,
      radius: 18,
    }),
    top: 48,
    zIndex: 35,
  },
  tipPopoverArrow: {
    backgroundColor: theme.colors.background.surface,
    borderColor: theme.colors.border.strong,
    borderLeftWidth: 2,
    borderTopWidth: 2,
    height: 14,
    position: "absolute",
    right: 12,
    top: -9,
    transform: [{ rotate: "45deg" }],
    width: 14,
  },
  tipPopoverHeaderRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  tipPopoverTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing.xxs,
  },
  tipPopoverClose: {
    alignItems: "center",
    borderColor: theme.colors.border.subtle,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    height: 22,
    justifyContent: "center",
    width: 22,
  },
  quickActionsCard: {
    backgroundColor: theme.colors.background.surface,
    borderColor: theme.colors.border.strong,
    borderWidth: 1,
    gap: theme.spacing.xs,
    overflow: "visible",
    position: "relative",
  },
  quickActionsCardRaised: {
    elevation: 12,
    zIndex: 30,
  },
  quickActionsPrimaryRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing.xs,
  },
  quickActionsPrimaryButton: {
    flex: 1,
  },
  menuActionButton: {
    alignItems: "center",
    backgroundColor: theme.colors.button.secondaryBg,
    borderColor: theme.colors.button.secondaryBorder,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: theme.spacing.xs,
    justifyContent: "center",
    minHeight: theme.sizes.secondaryButtonHeight,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  listCard: {
    gap: theme.spacing.xs,
  },
  menuSearchInput: {
    marginBottom: theme.spacing.xs,
  },
  menuItemsHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: theme.spacing.xs,
  },
  menuItemsHeaderLeft: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 1,
    gap: theme.spacing.xs,
  },
  reviewBadge: {
    alignItems: "center",
    backgroundColor: theme.colors.background.surface,
    borderColor: theme.colors.border.default,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: theme.spacing.xxs,
    minHeight: 24,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 2,
  },
  reviewBadgeDisabled: {
    opacity: 0.75,
  },
  menuItemDividerRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing.xs,
    marginVertical: theme.spacing.xs,
  },
  menuItemDividerLine: {
    borderTopColor: theme.colors.border.default,
    borderTopWidth: 1,
    flex: 1,
  },
  crossLocationSection: {
    gap: theme.spacing.xs,
    marginTop: theme.spacing.sm,
  },
  crossLocationHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  crossLocationRow: {
    backgroundColor: theme.colors.background.surface,
    borderColor: theme.colors.border.default,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    gap: theme.spacing.xs,
    padding: theme.spacing.sm,
  },
  crossLocationRowSelected: {
    backgroundColor: theme.colors.status.successBg,
    borderColor: theme.colors.status.successBorder,
  },
  crossLocationTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing.xs,
    justifyContent: "space-between",
  },
  crossLocationTitle: {
    flex: 1,
  },
  crossLocationMetaRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.xs,
  },
}));

export function RestaurantMenuItemPicker<
  TMenuItem extends RestaurantMenuItemPickerItem,
>({
  addManualDisabled = false,
  addManualLabel = "Can't find it? Add manually",
  currentUserId = "",
  crossLocationDisabled = false,
  crossLocationItems = [],
  crossLocationLabel = "Ordered at matching locations",
  crossLocationLoadingItemId = null,
  emptyDescription = "No menu items yet. Scan a menu or add one manually.",
  hasError,
  hasPendingMenuReview = false,
  isCrossLocationItemSelected = () => false,
  isItemSelected,
  isLoading,
  isOnline,
  isReviewDisabled = false,
  isReviewSubmitted = false,
  isTipVisible,
  items,
  label,
  onAddManual,
  onEditItem,
  onRequestMenuReview,
  onToggleCrossLocationItem,
  onRetry,
  onScanMenuPhoto,
  onSearchQueryChange,
  onTipVisibilityChange,
  onToggleItem,
  scanDisabled = false,
  searchQuery,
  selectedCount,
  testIDPrefix,
}: RestaurantMenuItemPickerProps<TMenuItem>) {
  const theme = useTheme();
  const styles = useStyles();
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const displayedItems = useMemo(() => {
    const filteredItems = normalizedQuery
      ? items.filter((item) =>
          item.name.toLowerCase().includes(normalizedQuery),
        )
      : items;
    const selectedItems = filteredItems.filter((item) => isItemSelected(item));
    const unselectedItems = filteredItems.filter(
      (item) => !isItemSelected(item),
    );
    return [...selectedItems, ...unselectedItems];
  }, [isItemSelected, items, normalizedQuery]);
  const firstUnselectedIndex = displayedItems.findIndex(
    (item) => !isItemSelected(item),
  );
  const hasCrossLocationItems = crossLocationItems.length > 0;
  const relatedLocationItems = crossLocationItems.filter(
    (item) => item.source === "relatedLocationSuggestion",
  );
  const allLocationsHistoryItems = crossLocationItems.filter(
    (item) => item.source !== "relatedLocationSuggestion",
  );
  const reviewText = hasPendingMenuReview
    ? "Review pending"
    : isReviewSubmitted
      ? "Review requested"
      : "Menu incorrect?";
  const crossLocationSections = [
    {
      key: "relatedLocationSuggestion",
      label: "Related location shortcuts",
      items: relatedLocationItems,
    },
    {
      key: "allLocationsHistory",
      label: crossLocationLabel,
      items: allLocationsHistoryItems,
    },
  ].filter((section) => section.items.length > 0);

  return (
    <View style={styles.stepContainer}>
      {isTipVisible ? (
        <Pressable
          accessibilityLabel="Dismiss tip"
          accessibilityRole="button"
          onPress={() => onTipVisibilityChange(false)}
          style={styles.tipDismissOverlay}
        />
      ) : null}

      <Card
        style={[
          styles.quickActionsCard,
          isTipVisible ? styles.quickActionsCardRaised : null,
        ]}
      >
        <View style={styles.quickActionsPrimaryRow}>
          <Pressable
            accessibilityRole="button"
            disabled={scanDisabled}
            onPress={onScanMenuPhoto}
            style={[
              styles.menuActionButton,
              styles.quickActionsPrimaryButton,
              scanDisabled ? { opacity: 0.55 } : null,
            ]}
            testID={`${testIDPrefix}-scan-menu-photo-button`}
          >
            <Ionicons
              color={theme.colors.text.primary}
              name={isOnline ? "camera-outline" : "cloud-offline-outline"}
              size={16}
            />
            <Text>{isOnline ? "Scan Menu Photo" : "Scan Menu (Offline)"}</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Show item entry tip"
            accessibilityRole="button"
            hitSlop={12}
            onPress={() => onTipVisibilityChange(!isTipVisible)}
            style={styles.tipIconButton}
            testID={`${testIDPrefix}-tip-button`}
          >
            <Ionicons
              color={theme.colors.text.warning}
              name="bulb-outline"
              size={14}
            />
          </Pressable>
        </View>

        {isTipVisible ? (
          <Pressable
            onPress={(event) => {
              event.stopPropagation();
            }}
            style={styles.tipPopover}
            testID={`${testIDPrefix}-tip-popover`}
          >
            <View style={styles.tipPopoverArrow} />
            <View style={styles.tipPopoverHeaderRow}>
              <View style={styles.tipPopoverTitleRow}>
                <Ionicons
                  color={theme.colors.text.warning}
                  name="bulb-outline"
                  size={14}
                />
                <Text variant="label">Tip</Text>
              </View>
              <Pressable
                accessibilityLabel="Close tip"
                accessibilityRole="button"
                hitSlop={12}
                onPress={() => onTipVisibilityChange(false)}
                style={styles.tipPopoverClose}
                testID={`${testIDPrefix}-tip-close-button`}
              >
                <Ionicons
                  color={theme.colors.text.secondary}
                  name="close"
                  size={12}
                />
              </Pressable>
            </View>
            <Text tone="secondary" variant="bodySm">
              Use "Scan Menu Photo" for faster item entry, or add an item
              manually if it is missing.
            </Text>
          </Pressable>
        ) : null}

        <Pressable
          accessibilityRole="button"
          disabled={addManualDisabled}
          onPress={onAddManual}
          style={[
            styles.menuActionButton,
            addManualDisabled ? { opacity: 0.55 } : null,
          ]}
          testID={`${testIDPrefix}-add-menu-item-button`}
        >
          <Ionicons
            color={theme.colors.text.primary}
            name="add-outline"
            size={16}
          />
          <Text>{addManualLabel}</Text>
        </Pressable>
      </Card>

      <Card style={styles.listCard}>
        <View style={styles.menuItemsHeader}>
          <View style={styles.menuItemsHeaderLeft}>
            <Text tone="secondary">{label}</Text>
            <Pressable
              accessibilityRole="button"
              disabled={isReviewDisabled}
              onPress={onRequestMenuReview}
              style={[
                styles.reviewBadge,
                isReviewDisabled ? styles.reviewBadgeDisabled : null,
              ]}
            >
              <Ionicons
                color={
                  hasPendingMenuReview
                    ? theme.colors.text.warning
                    : isReviewSubmitted
                      ? theme.colors.text.success
                      : theme.colors.text.secondary
                }
                name={
                  isReviewSubmitted
                    ? "checkmark-circle-outline"
                    : "flag-outline"
                }
                size={12}
              />
              <Text
                ellipsizeMode="tail"
                numberOfLines={1}
                tone={
                  hasPendingMenuReview
                    ? "warning"
                    : isReviewSubmitted
                      ? "success"
                      : "secondary"
                }
                variant="bodySm"
              >
                {reviewText}
              </Text>
            </Pressable>
          </View>
          {selectedCount > 0 ? (
            <Text tone="success" variant="label">
              {selectedCount} selected
            </Text>
          ) : null}
        </View>
        <Input
          containerStyle={styles.menuSearchInput}
          onChangeText={onSearchQueryChange}
          placeholder="Search menu items..."
          value={searchQuery}
        />

        {isLoading ? (
          <LoadingState label="Loading menu items..." />
        ) : hasError ? (
          <PageErrorToast
            actionLabel="Retry"
            errorMessage="Could not load menu items for this restaurant."
            onAction={onRetry}
            title="Menu unavailable"
          />
        ) : displayedItems.length === 0 && !hasCrossLocationItems ? (
          <EmptyState
            description={
              searchQuery.trim()
                ? "No items found. Try another search or add manually."
                : emptyDescription
            }
            title="No items available"
          />
        ) : displayedItems.length > 0 ? (
          displayedItems.map((item, index) => {
            const selected = isItemSelected(item);
            const isUserCreated = item.createdBy === currentUserId;
            return (
              <View key={item.id}>
                {selectedCount > 0 && index === firstUnselectedIndex ? (
                  <View style={styles.menuItemDividerRow}>
                    <View style={styles.menuItemDividerLine} />
                    <Text tone="muted" variant="bodySm">
                      Other items
                    </Text>
                    <View style={styles.menuItemDividerLine} />
                  </View>
                ) : null}
                <VisitMenuItemOptionRow
                  compactActions={isUserCreated}
                  description={item.description}
                  editButtonTestID={
                    isUserCreated
                      ? `${testIDPrefix}-menu-item-edit-button-${index}`
                      : undefined
                  }
                  friendEatenCount={item.friendEatenCount}
                  name={item.name}
                  onEditPress={
                    isUserCreated && onEditItem
                      ? () => onEditItem(item)
                      : undefined
                  }
                  onPress={() => onToggleItem(item)}
                  optionTestID={`${testIDPrefix}-menu-item-option-${index}`}
                  selectButtonTestID={`${testIDPrefix}-menu-item-select-button-${index}`}
                  selected={selected}
                  userEatenCount={item.userEatenCount}
                  visibility={item.visibility}
                />
              </View>
            );
          })
        ) : null}

        {hasCrossLocationItems ? (
          <View style={styles.crossLocationSection}>
            {crossLocationSections.map((section, sectionIndex) => (
              <View key={section.key} style={styles.crossLocationSection}>
                <View style={styles.crossLocationHeader}>
                  <Text tone="secondary">{section.label}</Text>
                </View>
                {section.items.map((item, itemIndex) => {
                  const selected = isCrossLocationItemSelected(item);
                  const isAllLocationsHistoryItem =
                    item.source !== "relatedLocationSuggestion";
                  const rowDisabled =
                    (isAllLocationsHistoryItem && crossLocationDisabled) ||
                    (crossLocationLoadingItemId !== null &&
                      crossLocationLoadingItemId !== item.id);
                  const latestLocation = [
                    item.latestRestaurantName,
                    item.latestRestaurantLocation,
                  ]
                    .filter(Boolean)
                    .join(" • ");
                  const optionIndex =
                    sectionIndex === 0
                      ? itemIndex
                      : relatedLocationItems.length + itemIndex;
                  const sourceRestaurantCount = item.sourceRestaurantCount ?? 0;
                  const orderCount = item.orderCount ?? 0;

	                  return (
	                    <Pressable
	                      accessibilityLabel={item.name}
	                      accessibilityRole="button"
	                      accessibilityState={{
	                        disabled: rowDisabled,
	                        selected,
	                      }}
	                      disabled={rowDisabled}
                      key={item.id}
                      onPress={() => onToggleCrossLocationItem?.(item)}
                      style={[
                        styles.crossLocationRow,
                        selected ? styles.crossLocationRowSelected : null,
                        rowDisabled ? { opacity: 0.55 } : null,
                      ]}
                      testID={`${testIDPrefix}-cross-location-item-option-${optionIndex}`}
                    >
                      <View style={styles.crossLocationTitleRow}>
                        <Text
                          numberOfLines={1}
                          style={styles.crossLocationTitle}
                          variant="label"
                        >
                          {item.name}
                        </Text>
                        {(item.latestRating ?? 0) > 0 ? (
                          <RatingPill rating={item.latestRating ?? 0} />
                        ) : null}
                      </View>
                      <View style={styles.crossLocationMetaRow}>
                        {item.source === "relatedLocationSuggestion" ? (
                          <>
                            <Text tone="secondary" variant="bodySm">
                              Suggested from {sourceRestaurantCount}{" "}
                              {sourceRestaurantCount === 1
                                ? "related location"
                                : "related locations"}
                            </Text>
                          </>
                        ) : (
                          <>
                            <Text tone="secondary" variant="bodySm">
                              {orderCount}{" "}
                              {orderCount === 1 ? "order" : "orders"}
                            </Text>
                            {latestLocation ? (
                              <Text
                                numberOfLines={1}
                                tone="secondary"
                                variant="bodySm"
                              >
                                Latest at {latestLocation}
                              </Text>
                            ) : null}
                          </>
                        )}
                      </View>
                      {crossLocationLoadingItemId === item.id ? (
                        <Text tone="secondary" variant="bodySm">
                          Adding to this restaurant...
                        </Text>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
        ) : null}
      </Card>
    </View>
  );
}
