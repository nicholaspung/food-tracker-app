import { useRef } from 'react';
import { Keyboard, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { useTheme } from '../../theme';
import { Text } from '../../ui';
import { FilterChipGroup, type FilterChipOption } from './FilterChipGroup';
import { SegmentedControl, type SegmentedControlOption } from './SegmentedControl';

export type FeedModeValue = 'mine' | 'friends' | 'beta';
export type FeedTypeFilterValue = 'all' | 'visits' | 'quick-track';

const FEED_MODE_OPTIONS: readonly SegmentedControlOption<FeedModeValue>[] = [
  { label: 'Mine', value: 'mine' },
  { label: 'Friends', value: 'friends' },
  { label: 'Beta', value: 'beta' },
];

const TYPE_FILTER_OPTIONS: readonly FilterChipOption<FeedTypeFilterValue>[] = [
  { label: 'All', value: 'all' },
  { label: 'Visits', value: 'visits' },
  { label: 'Quick Track', value: 'quick-track' },
];

interface FeedHeaderControlsProps {
  summaryText: string;
  feedMode: FeedModeValue;
  showBetaTab?: boolean;
  onFeedModeChange: (value: FeedModeValue) => void;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  onClearSearch: () => void;
  filtersExpanded: boolean;
  onToggleFilters: () => void;
  typeFilter: FeedTypeFilterValue;
  onTypeFilterChange: (value: FeedTypeFilterValue) => void;
}

export function FeedHeaderControls({
  summaryText,
  feedMode,
  showBetaTab = false,
  onFeedModeChange,
  searchQuery,
  onSearchQueryChange,
  onClearSearch,
  filtersExpanded,
  onToggleFilters,
  typeFilter,
  onTypeFilterChange,
}: FeedHeaderControlsProps) {
  const theme = useTheme();
  const searchInputRef = useRef<TextInput>(null);
  const feedModeOptions = showBetaTab
    ? FEED_MODE_OPTIONS
    : FEED_MODE_OPTIONS.filter((option) => option.value !== 'beta');

  const styles = StyleSheet.create({
    container: {
      gap: theme.spacing.sm,
    },
    titleRow: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: theme.spacing.sm,
    },
    title: {
      color: theme.colors.text.primary,
      ...theme.typography.titleLg,
    },
    segmentedControl: {
      backgroundColor: theme.colors.background.muted,
      borderColor: theme.colors.border.default,
      borderRadius: 10,
      borderWidth: 1,
      padding: 2,
    },
    segmentButton: {
      borderRadius: 8,
      minWidth: 54,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: 7,
    },
    segmentButtonActive: {
      backgroundColor: theme.colors.background.surface,
      shadowColor: theme.colors.background.inverse,
      shadowOffset: {
        width: 0,
        height: 1,
      },
      shadowOpacity: 0.08,
      shadowRadius: 1,
    },
    segmentLabel: {
      color: theme.colors.text.muted,
      ...theme.typography.label,
      textAlign: 'center',
    },
    segmentLabelActive: {
      color: theme.colors.text.primary,
    },
    summaryText: {
      color: theme.colors.text.muted,
      ...theme.typography.bodyMd,
    },
    searchRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: theme.spacing.xs,
    },
    searchField: {
      alignItems: 'center',
      backgroundColor: theme.colors.background.muted,
      borderColor: theme.colors.border.default,
      borderRadius: 10,
      borderWidth: 1,
      flex: 1,
      flexDirection: 'row',
      minHeight: 42,
      paddingHorizontal: theme.spacing.sm,
    },
    searchInput: {
      color: theme.colors.text.primary,
      flex: 1,
      ...theme.typography.bodyLg,
      paddingVertical: theme.spacing.xs,
    },
    clearSearchButton: {
      paddingHorizontal: theme.spacing.xs,
      paddingVertical: theme.spacing.xs,
    },
    clearSearchLabel: {
      color: theme.colors.text.muted,
      ...theme.typography.bodySm,
      fontWeight: '600',
      lineHeight: 16,
    },
    filtersToggle: {
      alignItems: 'center',
      backgroundColor: theme.colors.background.surface,
      borderColor: theme.colors.border.default,
      borderRadius: 10,
      borderWidth: 1,
      flexDirection: 'row',
      justifyContent: 'center',
      minHeight: 42,
      minWidth: 82,
      paddingHorizontal: theme.spacing.sm,
    },
    filtersToggleActive: {
      backgroundColor: theme.colors.text.brand,
      borderColor: theme.colors.text.brand,
    },
    filtersToggleLabel: {
      color: theme.colors.text.primary,
      ...theme.typography.button,
    },
    filtersToggleLabelActive: {
      color: theme.colors.text.inverse,
    },
    filtersRow: {
      flexDirection: 'row',
      gap: theme.spacing.xs,
    },
    filterChip: {
      alignItems: 'center',
      backgroundColor: theme.colors.background.surface,
      borderColor: theme.colors.border.default,
      borderRadius: 8,
      borderWidth: 1,
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: theme.spacing.xs,
      paddingVertical: 8,
    },
    filterChipActive: {
      backgroundColor: theme.colors.status.infoBg,
      borderColor: theme.colors.border.info,
    },
    filterChipLabel: {
      color: theme.colors.text.secondary,
      ...theme.typography.label,
      lineHeight: 16,
      textAlign: 'center',
    },
    filterChipLabelActive: {
      color: theme.colors.text.info,
    },
  });

  return (
    <View style={styles.container}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>Ratings</Text>
        <SegmentedControl
          activeLabelStyle={styles.segmentLabelActive}
          activeSegmentStyle={styles.segmentButtonActive}
          containerStyle={styles.segmentedControl}
          fill={false}
          getOptionTestID={(value) => `home-feed-mode-${value}`}
          labelStyle={styles.segmentLabel}
          onChange={onFeedModeChange}
          options={feedModeOptions}
          segmentStyle={styles.segmentButton}
          value={feedMode}
        />
      </View>

      <Text style={styles.summaryText}>{summaryText}</Text>

      <View style={styles.searchRow}>
        <View style={styles.searchField}>
          <TextInput
            blurOnSubmit
            onChangeText={onSearchQueryChange}
            onSubmitEditing={() => {
              searchInputRef.current?.blur();
              Keyboard.dismiss();
            }}
            placeholder="Search restaurants, food, notes..."
            placeholderTextColor={theme.colors.text.muted}
            ref={searchInputRef}
            returnKeyType="done"
            style={styles.searchInput}
            value={searchQuery}
          />
          {searchQuery ? (
            <Pressable onPress={onClearSearch} style={styles.clearSearchButton}>
              <Text style={styles.clearSearchLabel}>Clear</Text>
            </Pressable>
          ) : null}
        </View>
        <Pressable onPress={onToggleFilters} style={[styles.filtersToggle, filtersExpanded && styles.filtersToggleActive]}>
          <Text style={[styles.filtersToggleLabel, filtersExpanded && styles.filtersToggleLabelActive]}>
            Filters
          </Text>
        </Pressable>
      </View>

      {filtersExpanded ? (
        <FilterChipGroup
          activeChipStyle={styles.filterChipActive}
          activeLabelStyle={styles.filterChipLabelActive}
          chipStyle={styles.filterChip}
          contentContainerStyle={styles.filtersRow}
          labelStyle={styles.filterChipLabel}
          onChange={onTypeFilterChange}
          options={TYPE_FILTER_OPTIONS}
          value={typeFilter}
        />
      ) : null}
    </View>
  );
}
