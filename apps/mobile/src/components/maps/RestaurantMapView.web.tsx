import { Ionicons } from '../../ui/AppIcon';
import { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import {
  EmptyState,
  ErrorState,
  LoadingOverlay,
  RatingPill,
} from '../shared';
import type { Coordinates } from '../../lib/coordinates';
import { createThemedStyles, useTheme } from '../../theme';
import { Button, Card, Text } from '../../ui';
import { buildRestaurantMapUrl } from './restaurantMapLink';
import type { RestaurantMapGroup, RestaurantMapSheetTabs } from './restaurantMapTypes';

interface WebRegion {
  latitude: number;
  latitudeDelta: number;
  longitude: number;
  longitudeDelta: number;
}

interface RestaurantMapViewProps {
  groups: RestaurantMapGroup[];
  selectedGroupId: string | null;
  onSelectedGroupChange: (id: string | null) => void;
  resetSignal?: number;
  loading: boolean;
  errorMessage: string | null;
  emptyTitle: string;
  emptyDescription: string;
  omittedWithoutCoordinates: number;
  hiddenLocationSingularLabel?: string;
  hiddenLocationPluralLabel?: string;
  initialUserCoordinates?: Coordinates | null;
  onOpenSelectedGroup?: (group: RestaurantMapGroup) => void;
  selectedGroupActionLabel?: string;
  selectedGroupTabs?: RestaurantMapSheetTabs | null;
  analyticsSource: string;
  testID: string;
  mapTestID: string;
  onRetry: () => void;
  externalTopInset?: number;
  onUserRegionChangeComplete?: (region: WebRegion) => void;
  preserveRegionOnGroupsChange?: boolean;
  showCurrentLocationControl?: boolean;
  style?: StyleProp<ViewStyle>;
}

const useStyles = createThemedStyles((theme) => ({
  container: {
    backgroundColor: theme.colors.background.app,
    flex: 1,
  },
  stateWrap: {
    flex: 1,
    justifyContent: 'center',
    padding: theme.spacing.sm,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
  },
  helperPill: {
    alignItems: 'center',
    backgroundColor: theme.colors.background.surface,
    borderColor: theme.colors.border.default,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
  },
  helperText: {
    color: theme.colors.text.secondary,
    flex: 1,
    textAlign: 'center',
  },
  helperDismissButton: {
    alignItems: 'center',
    borderRadius: theme.radii.pill,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  selectedSummary: {
    gap: theme.spacing.sm,
  },
  selectedTitle: {
    color: theme.colors.text.primary,
  },
  selectedLocation: {
    color: theme.colors.text.secondary,
  },
  selectedDescription: {
    color: theme.colors.text.muted,
  },
  selectedActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  selectedAction: {
    flexGrow: 1,
  },
  mapPlaceholder: {
    alignItems: 'center',
    backgroundColor: theme.colors.background.surface,
    borderColor: theme.colors.border.default,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    gap: theme.spacing.sm,
    justifyContent: 'center',
    minHeight: 180,
    padding: theme.spacing.md,
  },
  mapPlaceholderIcon: {
    alignItems: 'center',
    backgroundColor: theme.colors.background.muted,
    borderRadius: theme.radii.pill,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  mapPlaceholderTitle: {
    color: theme.colors.text.primary,
    textAlign: 'center',
  },
  mapPlaceholderText: {
    color: theme.colors.text.secondary,
    textAlign: 'center',
  },
  groupList: {
    gap: theme.spacing.sm,
  },
  groupCard: {
    gap: theme.spacing.xs,
  },
  groupCardSelected: {
    borderColor: theme.colors.text.brand,
  },
  groupHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  groupPin: {
    alignItems: 'center',
    backgroundColor: theme.colors.background.muted,
    borderRadius: theme.radii.pill,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  groupTitleWrap: {
    flex: 1,
    gap: 2,
  },
  groupTitle: {
    color: theme.colors.text.primary,
  },
  groupLocation: {
    color: theme.colors.text.secondary,
  },
  groupSummary: {
    color: theme.colors.text.muted,
  },
  itemPreview: {
    gap: 2,
    paddingTop: theme.spacing.xs,
  },
  itemRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  itemName: {
    color: theme.colors.text.primary,
  },
  itemMeta: {
    color: theme.colors.text.secondary,
  },
  locationError: {
    color: theme.colors.text.warning,
  },
}));

function buildSelectedRegion(group: RestaurantMapGroup): WebRegion {
  return {
    latitude: group.latitude,
    latitudeDelta: 0.035,
    longitude: group.longitude,
    longitudeDelta: 0.035,
  };
}

export function RestaurantMapView(props: RestaurantMapViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const [hiddenLocationBannerDismissed, setHiddenLocationBannerDismissed] = useState(false);
  const [mapOpenErrorMessage, setMapOpenErrorMessage] = useState<string | null>(null);
  const [mapOpenLoadingGroupId, setMapOpenLoadingGroupId] = useState<string | null>(null);
  const selectedGroup = props.groups.find((group) => group.id === props.selectedGroupId) ?? null;
  const shownGroups = useMemo(() => {
    if (!selectedGroup) {
      return props.groups;
    }

    return [
      selectedGroup,
      ...props.groups.filter((group) => group.id !== selectedGroup.id),
    ];
  }, [props.groups, selectedGroup]);
  const singularLabel = props.hiddenLocationSingularLabel ?? 'entry';
  const pluralLabel = props.hiddenLocationPluralLabel ?? 'entries';
  const showHiddenLocationBanner =
    props.omittedWithoutCoordinates > 0 && !hiddenLocationBannerDismissed;

  useEffect(() => {
    setHiddenLocationBannerDismissed(false);
  }, [props.omittedWithoutCoordinates]);

  useEffect(() => {
    setMapOpenErrorMessage(null);
  }, [props.selectedGroupId]);

  if (props.loading && props.groups.length === 0) {
    return (
      <View style={[styles.container, props.style]} testID={props.testID}>
        <View style={styles.stateWrap}>
          <LoadingOverlay label="Loading map..." visible />
        </View>
      </View>
    );
  }

  if (props.errorMessage && props.groups.length === 0) {
    return (
      <View style={[styles.container, props.style]} testID={props.testID}>
        <View style={styles.stateWrap}>
          <ErrorState
            analyticsSource={props.analyticsSource}
            description={props.errorMessage}
            onRetry={props.onRetry}
            title="Map unavailable"
          />
        </View>
      </View>
    );
  }

  if (props.groups.length === 0) {
    return (
      <View style={[styles.container, props.style]} testID={props.testID}>
        <View style={styles.stateWrap}>
          <EmptyState
            analyticsSource={props.analyticsSource}
            description={props.emptyDescription}
            fill
            title={props.emptyTitle}
          />
        </View>
      </View>
    );
  }

  const handleSelectGroup = (group: RestaurantMapGroup) => {
    props.onSelectedGroupChange(group.id);
    props.onUserRegionChangeComplete?.(buildSelectedRegion(group));
  };
  const handleOpenInMaps = async (group: RestaurantMapGroup) => {
    setMapOpenErrorMessage(null);
    setMapOpenLoadingGroupId(group.id);

    try {
      await Linking.openURL(buildRestaurantMapUrl(group));
    } catch {
      setMapOpenErrorMessage('Could not open this location. Try again from your maps app.');
    } finally {
      setMapOpenLoadingGroupId(null);
    }
  };

  return (
    <View style={[styles.container, props.style]} testID={props.testID}>
      <ScrollView
        style={styles.content}
        contentContainerStyle={[
          styles.scrollContent,
          props.externalTopInset ? { paddingTop: theme.spacing.md + props.externalTopInset } : null,
        ]}
        testID={props.mapTestID}
      >
        {showHiddenLocationBanner ? (
          <View style={styles.helperPill}>
            <Text style={styles.helperText} variant="bodySmTightSemiBold">
              {props.omittedWithoutCoordinates}{' '}
              {props.omittedWithoutCoordinates === 1 ? singularLabel : pluralLabel} without locations are hidden from map.
            </Text>
            <Pressable
              accessibilityLabel="Hide hidden-location message"
              accessibilityRole="button"
              onPress={() => {
                setHiddenLocationBannerDismissed(true);
              }}
              style={styles.helperDismissButton}
            >
              <Ionicons color={theme.colors.text.secondary} name="close" size={16} />
            </Pressable>
          </View>
        ) : null}

        <View style={styles.mapPlaceholder}>
          <View style={styles.mapPlaceholderIcon}>
            <Ionicons color={theme.colors.text.secondary} name="map-outline" size={22} />
          </View>
          <Text style={styles.mapPlaceholderTitle} variant="titleMd">
            Map view is available in the mobile app
          </Text>
          <Text style={styles.mapPlaceholderText} variant="bodySm">
            Web shows the same geocoded locations as a selectable list.
          </Text>
        </View>

        {selectedGroup ? (
          <Card style={styles.selectedSummary}>
            <Text style={styles.selectedTitle} variant="titleSm">
              {selectedGroup.restaurantName}
            </Text>
            {selectedGroup.restaurantLocation ? (
              <Text style={styles.selectedLocation} variant="bodySm">
                {selectedGroup.restaurantLocation}
              </Text>
            ) : null}
            <Text style={styles.selectedDescription} variant="bodySm">
              {selectedGroup.summary}
            </Text>
            {mapOpenErrorMessage ? (
              <Text style={styles.locationError} variant="bodySmTightSemiBold">
                {mapOpenErrorMessage}
              </Text>
            ) : null}
            <View style={styles.selectedActions}>
              {props.onOpenSelectedGroup ? (
                <Button
                  label={props.selectedGroupActionLabel ?? 'Open'}
                  onPress={() => {
                    props.onOpenSelectedGroup?.(selectedGroup);
                  }}
                  style={styles.selectedAction}
                  variant="secondary"
                />
              ) : null}
              <Button
                label="Open in Maps"
                loading={mapOpenLoadingGroupId === selectedGroup.id}
                onPress={() => {
                  void handleOpenInMaps(selectedGroup);
                }}
                style={styles.selectedAction}
                variant="secondary"
              />
            </View>
          </Card>
        ) : null}

        <View style={styles.groupList}>
          {shownGroups.map((group) => {
            const selected = group.id === props.selectedGroupId;
            const previewItems = group.items.slice(0, 3);

            return (
              <Pressable
                accessibilityLabel={`Select ${group.restaurantName}`}
                accessibilityRole="button"
                key={group.id}
                onPress={() => {
                  handleSelectGroup(group);
                }}
              >
                <Card style={[styles.groupCard, selected ? styles.groupCardSelected : null]}>
                  <View style={styles.groupHeader}>
                    <View style={styles.groupPin}>
                      <Ionicons
                        color={selected ? theme.colors.text.brand : theme.colors.text.secondary}
                        name="location"
                        size={16}
                      />
                    </View>
                    <View style={styles.groupTitleWrap}>
                      <Text numberOfLines={1} style={styles.groupTitle} variant="bodyMdSemiBold">
                        {group.restaurantName}
                      </Text>
                      {group.restaurantLocation ? (
                        <Text numberOfLines={1} style={styles.groupLocation} variant="bodySm">
                          {group.restaurantLocation}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  <Text style={styles.groupSummary} variant="bodySm">
                    {group.summary}
                  </Text>
                  {previewItems.length > 0 ? (
                    <View style={styles.itemPreview}>
                      {previewItems.map((item) => (
                        <View key={item.id} style={styles.itemRow}>
                          <Text numberOfLines={1} style={styles.itemName} variant="bodySmTightSemiBold">
                            {item.name}
                          </Text>
                          {item.meta.map((meta, index) =>
                            meta.rating && meta.rating > 0 ? (
                              <RatingPill key={`${item.id}-rating-${index}`} rating={meta.rating} />
                            ) : meta.label || meta.dateLabel ? (
                              <Text
                                key={`${item.id}-meta-${index}`}
                                numberOfLines={1}
                                style={styles.itemMeta}
                                variant="bodySmTight"
                              >
                                {[meta.label, meta.dateLabel].filter(Boolean).join(' · ')}
                              </Text>
                            ) : null,
                          )}
                        </View>
                      ))}
                    </View>
                  ) : null}
                </Card>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}
