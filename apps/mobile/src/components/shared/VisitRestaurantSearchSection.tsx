import { Ionicons } from '../../ui/AppIcon';
import { useState, type ReactNode } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { createThemedStyles, useTheme } from '../../theme';
import { Button, Card, Input, ListItem, Text } from '../../ui';
import { EmptyState } from './EmptyState';
import { LoadingState } from './LoadingState';
import { PageErrorToast } from './PageErrorToast';
import { UpgradePromptCard } from './UpgradePromptCard';

export interface VisitRestaurantSearchOption {
  key: string;
  title: string;
  description?: ReactNode;
  trailing?: ReactNode;
  selected?: boolean;
  onPress: () => void;
  testID?: string;
}

export interface VisitRestaurantSearchSectionProps {
  locationMetadataHintText?: string | null;
  headerAccessory?: ReactNode;
  searchInputsMode?: 'full' | 'compact';
  hideSearchCard?: boolean;
  onSearchQueryFocus?: () => void;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  manualLocation: string;
  onManualLocationChange: (value: string) => void;
  onSearchPress: () => void;
  searchButtonLabel: string;
  searchButtonLoading?: boolean;
  searchButtonDisabled?: boolean;
  onUseCurrentLocationPress: () => void;
  currentLocationLoading?: boolean;
  currentLocationDisabled?: boolean;
  isUsingCurrentLocation?: boolean;
  connectivityWarningMessage?: string | null;
  quotaWarningMessage?: string | null;
  upgradePromptTitle?: string | null;
  upgradePromptDescription?: string | null;
  searchErrorMessage?: string | null;
  locationPermissionNeedsSettings?: boolean;
  onOpenLocationSettings?: () => void;
  showSearchResults: boolean;
  isSearchResultsLoading?: boolean;
  searchResultsOptions: VisitRestaurantSearchOption[];
  savedOptions: VisitRestaurantSearchOption[];
  onClearSearchResults: () => void;
  savedResultsLoading?: boolean;
  savedResultsErrorMessage?: string | null;
  savedResultsErrorTitle?: string;
  onRetrySavedResults?: () => void;
  searchResultsTitle?: string;
  savedResultsTitle?: string;
  searchEmptyTitle?: string;
  searchEmptyDescription?: string;
  savedEmptyTitle?: string;
  savedEmptyDescription?: string;
  footerContent?: ReactNode;
  onSearchResultsLayout?: (event: LayoutChangeEvent) => void;
  onSavedResultsLayout?: (event: LayoutChangeEvent) => void;
}

const CURRENT_LOCATION_LABEL = 'Current location';
const LEGACY_CURRENT_PHONE_LOCATION_LABEL = 'Your location (phone GPS)';
const LEGACY_CURRENT_PHONE_LOCATION_PARTIAL_PREFIX = 'Your location (phone GPS';

const useStyles = createThemedStyles((theme) => ({
  sectionRoot: {
    gap: theme.spacing.md,
  },
  sectionCard: {
    gap: theme.spacing.sm,
  },
  searchHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
    justifyContent: 'space-between',
  },
  searchHeaderTitle: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  compactSearchRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  compactSearchField: {
    flex: 1,
  },
  compactSearchButton: {
    minWidth: 126,
  },
  row: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  locationField: {
    flex: 1,
  },
  locationInput: {
    height: theme.sizes.inputMinHeight,
    minHeight: theme.sizes.inputMinHeight,
  },
  currentLocationInputText: {
    color: theme.colors.text.info,
  },
  locationAction: {
    alignSelf: 'flex-end',
    height: theme.sizes.inputMinHeight,
    minHeight: theme.sizes.inputMinHeight,
    width: theme.sizes.inputMinHeight,
  },
  searchIconButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.button.primaryBg,
    borderRadius: theme.radii.md,
    justifyContent: 'center',
  },
  searchIconButtonDisabled: {
    backgroundColor: theme.colors.button.primaryDisabledBg,
    opacity: 0.9,
  },
  currentLocationOption: {
    alignItems: 'center',
    backgroundColor: theme.colors.background.surface,
    borderColor: theme.colors.border.default,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  currentLocationOptionPressed: {
    backgroundColor: theme.colors.background.muted,
  },
  currentLocationOptionIcon: {
    alignItems: 'center',
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  clearButton: {
    alignItems: 'center',
    borderRadius: theme.radii.pill,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  clearButtonPressed: {
    backgroundColor: theme.colors.background.muted,
  },
  statusCard: {
    gap: theme.spacing.xs,
  },
  listCard: {
    gap: theme.spacing.xs,
  },
  selectedOption: {
    backgroundColor: theme.colors.status.successBg,
    borderColor: theme.colors.status.successBorder,
  },
}));

export function VisitRestaurantSearchSection({
  locationMetadataHintText,
  headerAccessory,
  searchInputsMode = 'full',
  hideSearchCard = false,
  onSearchQueryFocus,
  searchQuery,
  onSearchQueryChange,
  manualLocation,
  onManualLocationChange,
  onSearchPress,
  searchButtonLabel,
  searchButtonLoading = false,
  searchButtonDisabled = false,
  onUseCurrentLocationPress,
  currentLocationLoading = false,
  currentLocationDisabled = false,
  isUsingCurrentLocation = false,
  connectivityWarningMessage,
  quotaWarningMessage,
  upgradePromptTitle,
  upgradePromptDescription,
  searchErrorMessage,
  locationPermissionNeedsSettings = false,
  onOpenLocationSettings,
  showSearchResults,
  isSearchResultsLoading = false,
  searchResultsOptions,
  savedOptions,
  onClearSearchResults,
  savedResultsLoading = false,
  savedResultsErrorMessage,
  savedResultsErrorTitle = 'Restaurant list unavailable',
  onRetrySavedResults,
  searchResultsTitle = 'Search Results',
  savedResultsTitle = 'Your restaurants',
  searchEmptyTitle = 'No food places found',
  searchEmptyDescription = 'Try a different query or location.',
  savedEmptyTitle = 'No restaurants yet',
  savedEmptyDescription = 'Search nearby places or add a new restaurant to start.',
  footerContent,
  onSearchResultsLayout,
  onSavedResultsLayout,
}: VisitRestaurantSearchSectionProps) {
  const theme = useTheme();
  const styles = useStyles();
  const [isLocationFocused, setIsLocationFocused] = useState(false);
  const isSearchActionDisabled = searchButtonDisabled || searchButtonLoading;
  const canUseCurrentLocation = !currentLocationDisabled && !currentLocationLoading;
  const isCurrentLocationToken =
    isUsingCurrentLocation ||
    manualLocation === CURRENT_LOCATION_LABEL ||
    manualLocation === LEGACY_CURRENT_PHONE_LOCATION_LABEL ||
    manualLocation.startsWith(LEGACY_CURRENT_PHONE_LOCATION_PARTIAL_PREFIX);
  const shouldShowCurrentLocationOption = isLocationFocused && !isCurrentLocationToken;
  const searchQueryClearButton = searchQuery.length > 0 ? (
    <Pressable
      accessibilityLabel="Clear place name or type"
      accessibilityRole="button"
      onPress={() => {
        onSearchQueryChange('');
      }}
      style={({ pressed }) => [styles.clearButton, pressed ? styles.clearButtonPressed : null]}
    >
      <Ionicons color={theme.colors.text.muted} name="close-circle" size={18} />
    </Pressable>
  ) : null;
  const manualLocationClearButton = manualLocation.length > 0 ? (
    <Pressable
      accessibilityLabel="Clear location"
      accessibilityRole="button"
      onPress={() => {
        onManualLocationChange('');
      }}
      style={({ pressed }) => [styles.clearButton, pressed ? styles.clearButtonPressed : null]}
    >
      <Ionicons color={theme.colors.text.muted} name="close-circle" size={18} />
    </Pressable>
  ) : null;
  const handleManualLocationChange = (value: string) => {
    if (
      isCurrentLocationToken &&
      (value === '' ||
        manualLocation.startsWith(value) ||
        CURRENT_LOCATION_LABEL.startsWith(value) ||
        LEGACY_CURRENT_PHONE_LOCATION_LABEL.startsWith(value))
    ) {
      onManualLocationChange('');
      return;
    }

    onManualLocationChange(value);
  };
  const handleManualLocationKeyPress = (key: string) => {
    if (isCurrentLocationToken && key === 'Backspace') {
      onManualLocationChange('');
    }
  };
  const handleManualLocationPress = () => {
    if (isCurrentLocationToken) {
      onManualLocationChange('');
      setIsLocationFocused(true);
    }
  };

  const searchIconButton = (
    <Pressable
      accessibilityLabel={searchButtonLabel}
      accessibilityRole="button"
      disabled={isSearchActionDisabled}
      onPress={onSearchPress}
      style={({ pressed }) => [
        styles.locationAction,
        styles.searchIconButton,
        isSearchActionDisabled ? styles.searchIconButtonDisabled : null,
        pressed && !isSearchActionDisabled ? { opacity: 0.8 } : null,
      ]}
    >
      {searchButtonLoading ? (
        <ActivityIndicator color={theme.colors.button.primaryText} />
      ) : (
        <Ionicons color={theme.colors.button.primaryText} name="search-outline" size={20} />
      )}
    </Pressable>
  );

  const currentLocationOption = shouldShowCurrentLocationOption ? (
    <Pressable
      accessibilityLabel="Use your current phone location"
      accessibilityRole="button"
      disabled={!canUseCurrentLocation}
      onPressIn={() => {
        if (!canUseCurrentLocation) {
          return;
        }

        setIsLocationFocused(false);
        onUseCurrentLocationPress();
      }}
      style={({ pressed }) => [
        styles.currentLocationOption,
        pressed && canUseCurrentLocation ? styles.currentLocationOptionPressed : null,
        !canUseCurrentLocation ? { opacity: 0.55 } : null,
      ]}
      testID="visit-restaurant-current-location-option"
    >
      <View style={styles.currentLocationOptionIcon}>
        {currentLocationLoading ? (
          <ActivityIndicator color={theme.colors.text.secondary} />
        ) : (
          <Ionicons color={theme.colors.text.secondary} name="locate-outline" size={18} />
        )}
      </View>
      <View>
        <Text variant="label">Current location</Text>
        <Text tone="secondary" variant="bodySm">
          Use this phone's current location
        </Text>
      </View>
    </Pressable>
  ) : null;

  return (
    <View style={styles.sectionRoot}>
      {!hideSearchCard ? (
        <Card style={styles.sectionCard}>
          <View style={styles.searchHeader}>
            <View style={styles.searchHeaderTitle}>
              <Ionicons
                color={theme.colors.text.info}
                name="search-outline"
                size={18}
              />
              <Text variant="label">Search for food places</Text>
            </View>
            {searchInputsMode === 'compact' ? null : headerAccessory}
          </View>

          {locationMetadataHintText ? (
            <Text tone="info" variant="bodySm">
              {locationMetadataHintText}
            </Text>
          ) : null}

          {searchInputsMode === 'compact' ? (
            <>
              <Input
                autoCapitalize="words"
                onChangeText={onSearchQueryChange}
                onFocus={onSearchQueryFocus}
                placeholder="Place name or type"
                rightAccessory={searchQueryClearButton}
                value={searchQuery}
              />
            </>
          ) : (
            <>
              <Input
                autoCapitalize="words"
                label="Place name or type"
                onChangeText={onSearchQueryChange}
                onFocus={onSearchQueryFocus}
                placeholder="e.g., Starbucks, cafe, bakery"
                rightAccessory={searchQueryClearButton}
                value={searchQuery}
              />

              <View style={styles.row}>
                <Input
                  autoCapitalize="words"
                  containerStyle={styles.locationField}
                  inputStyle={[
                    styles.locationInput,
                    isCurrentLocationToken ? styles.currentLocationInputText : null,
                  ]}
                  label="Location (city, zip, or address)"
                  onBlur={() => {
                    setIsLocationFocused(false);
                  }}
                  onChangeText={handleManualLocationChange}
                  onFocus={() => {
                    setIsLocationFocused(true);
                  }}
                  onKeyPress={(event) => {
                    handleManualLocationKeyPress(event.nativeEvent.key);
                  }}
                  onPressIn={handleManualLocationPress}
                  placeholder="e.g., 90210, Los Angeles"
                  rightAccessory={manualLocationClearButton}
                  value={manualLocation}
                />
                {searchIconButton}
              </View>
              {currentLocationOption}

              {footerContent}
            </>
          )}

          {connectivityWarningMessage ? <Text tone="warning">{connectivityWarningMessage}</Text> : null}
          {quotaWarningMessage ? <Text tone="warning">{quotaWarningMessage}</Text> : null}

          {upgradePromptTitle && upgradePromptDescription ? (
            <UpgradePromptCard
              description={upgradePromptDescription}
              title={upgradePromptTitle}
            />
          ) : null}
        </Card>
      ) : null}

      {hideSearchCard &&
      (connectivityWarningMessage || quotaWarningMessage || (upgradePromptTitle && upgradePromptDescription)) ? (
        <Card style={styles.statusCard}>
          {connectivityWarningMessage ? <Text tone="warning">{connectivityWarningMessage}</Text> : null}
          {quotaWarningMessage ? <Text tone="warning">{quotaWarningMessage}</Text> : null}
          {upgradePromptTitle && upgradePromptDescription ? (
            <UpgradePromptCard
              description={upgradePromptDescription}
              title={upgradePromptTitle}
            />
          ) : null}
        </Card>
      ) : null}

      {searchErrorMessage ? (
        <Card style={styles.statusCard}>
          <Text tone="danger">{searchErrorMessage}</Text>
          {locationPermissionNeedsSettings && onOpenLocationSettings ? (
            <Button
              label="Open Settings"
              onPress={onOpenLocationSettings}
              variant="secondary"
            />
          ) : null}
        </Card>
      ) : null}

      {showSearchResults ? (
        <>
          {isSearchResultsLoading ? (
            <Card style={styles.statusCard} tone="muted">
              <LoadingState label="Looking up nearby food places..." />
            </Card>
          ) : null}

          <View onLayout={onSearchResultsLayout}>
            <Card style={styles.listCard}>
              <Text variant="label">{searchResultsTitle}</Text>
              {searchResultsOptions.length === 0 ? (
                <EmptyState
                  description={searchEmptyDescription}
                  title={searchEmptyTitle}
                />
              ) : (
                searchResultsOptions.map((option) => (
                  <ListItem
                    description={option.description}
                    key={option.key}
                    onPress={option.onPress}
                    separateTrailingAction={Boolean(option.trailing)}
                    style={option.selected ? styles.selectedOption : undefined}
                    testID={option.testID}
                    title={option.title}
                    trailing={option.trailing}
                  />
                ))
              )}
            </Card>
          </View>

          <Button
            label="Clear Search Results"
            onPress={onClearSearchResults}
            variant="secondary"
          />
        </>
      ) : (
        <View onLayout={onSavedResultsLayout}>
          <Card style={styles.listCard}>
            <Text variant="label">{savedResultsTitle}</Text>
            {savedResultsLoading ? (
              <LoadingState label="Loading restaurants..." />
            ) : savedResultsErrorMessage ? (
              onRetrySavedResults ? (
                <PageErrorToast
                  actionLabel="Retry"
                  errorMessage={savedResultsErrorMessage}
                  onAction={onRetrySavedResults}
                  title={savedResultsErrorTitle}
                />
              ) : (
                <Text tone="danger">{savedResultsErrorMessage}</Text>
              )
            ) : savedOptions.length === 0 ? (
              <EmptyState
                description={savedEmptyDescription}
                title={savedEmptyTitle}
              />
            ) : (
              savedOptions.map((option) => (
                <ListItem
                  description={option.description}
                  key={option.key}
                  onPress={option.onPress}
                  separateTrailingAction={Boolean(option.trailing)}
                  style={option.selected ? styles.selectedOption : undefined}
                  testID={option.testID}
                  title={option.title}
                  trailing={option.trailing}
                />
              ))
            )}
          </Card>
        </View>
      )}
    </View>
  );
}
