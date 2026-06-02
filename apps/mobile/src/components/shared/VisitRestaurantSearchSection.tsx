import { Ionicons } from '../../ui/AppIcon';
import type { ReactNode } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { View } from 'react-native';

import { createThemedStyles, useTheme } from '../../theme';
import { Button, Card, Input, ListItem, Text } from '../../ui';
import { CurrentLocationButton } from './CurrentLocationButton';
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

interface VisitRestaurantSearchSectionProps {
  locationMetadataHintText?: string | null;
  headerAccessory?: ReactNode;
  searchInputsMode?: 'full' | 'compact';
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

const useStyles = createThemedStyles((theme) => ({
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
  locationAction: {
    alignSelf: 'flex-end',
    minWidth: 96,
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

  return (
    <>
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
          {headerAccessory}
        </View>

        {locationMetadataHintText ? (
          <Text tone="info" variant="bodySm">
            {locationMetadataHintText}
          </Text>
        ) : null}

        {searchInputsMode === 'compact' ? (
          <View style={styles.compactSearchRow}>
            <Input
              autoCapitalize="words"
              containerStyle={styles.compactSearchField}
              onChangeText={onSearchQueryChange}
              placeholder="Place name or type"
              value={searchQuery}
            />
            <Button
              disabled={searchButtonDisabled}
              label={searchButtonLoading ? 'Searching...' : searchButtonLabel}
              loading={searchButtonLoading}
              onPress={onSearchPress}
              style={styles.compactSearchButton}
            />
          </View>
        ) : (
          <>
            <Input
              autoCapitalize="words"
              label="Place name or type"
              onChangeText={onSearchQueryChange}
              placeholder="e.g., Starbucks, cafe, bakery"
              value={searchQuery}
            />

            <View style={styles.row}>
              <Input
                autoCapitalize="words"
                containerStyle={styles.locationField}
                inputStyle={styles.locationInput}
                label="Location (city, zip, or address)"
                onChangeText={onManualLocationChange}
                placeholder="e.g., 90210, Los Angeles"
                value={manualLocation}
              />
              <CurrentLocationButton
                accessibilityLabel="Use current location"
                disabled={currentLocationDisabled}
                loading={currentLocationLoading}
                onPress={onUseCurrentLocationPress}
                style={styles.locationAction}
                variant="inline"
              />
            </View>

            <Button
              disabled={searchButtonDisabled}
              label={searchButtonLoading ? 'Searching...' : searchButtonLabel}
              loading={searchButtonLoading}
              onPress={onSearchPress}
            />

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
    </>
  );
}
