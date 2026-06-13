import { Ionicons } from '../../ui/AppIcon';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, View } from 'react-native';

import { createThemedStyles, useTheme } from '../../theme';
import { Input, Text } from '../../ui';

interface FocusedRestaurantSearchHeaderProps {
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
  locationOptionsDismissSignal?: number;
  onBackPress: () => void;
  testID?: string;
}

const CURRENT_LOCATION_LABEL = 'Current location';
const LEGACY_CURRENT_PHONE_LOCATION_LABEL = 'Your location (phone GPS)';
const LEGACY_CURRENT_PHONE_LOCATION_PARTIAL_PREFIX = 'Your location (phone GPS';

const useStyles = createThemedStyles((theme) => ({
  header: {
    backgroundColor: theme.colors.background.surface,
    borderBottomColor: theme.colors.border.subtle,
    borderBottomWidth: 1,
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
  },
  row: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  backButton: {
    alignItems: 'center',
    borderRadius: theme.radii.md,
    height: theme.sizes.inputMinHeight,
    justifyContent: 'center',
    width: 40,
  },
  backButtonPressed: {
    backgroundColor: theme.colors.background.muted,
  },
  fields: {
    flex: 1,
    gap: theme.spacing.sm,
  },
  locationRow: {
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
    borderColor: theme.colors.border.strong,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    minHeight: theme.sizes.inputMinHeight,
    paddingLeft: theme.spacing.md,
    paddingRight: theme.spacing.sm,
  },
  currentLocationOptionPressed: {
    backgroundColor: theme.colors.background.muted,
  },
  currentLocationOptionIcon: {
    alignItems: 'center',
    height: 32,
    justifyContent: 'center',
    width: 32,
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
}));

export function FocusedRestaurantSearchHeader({
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
  locationOptionsDismissSignal,
  onBackPress,
  testID,
}: FocusedRestaurantSearchHeaderProps) {
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

  useEffect(() => {
    if (typeof locationOptionsDismissSignal === 'number') {
      setIsLocationFocused(false);
      Keyboard.dismiss();
    }
  }, [locationOptionsDismissSignal]);

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

  return (
    <View style={styles.header} testID={testID}>
      <View style={styles.row}>
        <Pressable
          accessibilityLabel="Back to previous view"
          accessibilityRole="button"
          onPress={onBackPress}
          style={({ pressed }) => [
            styles.backButton,
            pressed ? styles.backButtonPressed : null,
          ]}
          testID={testID ? `${testID}-back-button` : undefined}
        >
          <Ionicons color={theme.colors.text.primary} name="arrow-back-outline" size={22} />
        </Pressable>

        <View style={styles.fields}>
          <Input
            autoCapitalize="words"
            autoFocus
            onChangeText={onSearchQueryChange}
            placeholder="Place name or type"
            rightAccessory={searchQueryClearButton}
            value={searchQuery}
          />
        </View>
      </View>

      <View style={styles.locationRow}>
        <Input
          autoCapitalize="words"
          containerStyle={styles.locationField}
          inputStyle={[
            styles.locationInput,
            isCurrentLocationToken ? styles.currentLocationInputText : null,
          ]}
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
          placeholder="City, zip, address, or your location"
          rightAccessory={manualLocationClearButton}
          value={manualLocation}
        />
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
      </View>

      {shouldShowCurrentLocationOption ? (
        <Pressable
          accessibilityLabel="Use your current phone location"
          accessibilityRole="button"
          disabled={!canUseCurrentLocation}
          onPressIn={() => {
            if (!canUseCurrentLocation) {
              return;
            }

            setIsLocationFocused(false);
            Keyboard.dismiss();
            onUseCurrentLocationPress();
          }}
          style={({ pressed }) => [
            styles.currentLocationOption,
            pressed && canUseCurrentLocation ? styles.currentLocationOptionPressed : null,
            !canUseCurrentLocation ? { opacity: 0.55 } : null,
          ]}
          testID={testID ? `${testID}-current-location-option` : undefined}
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
      ) : null}
    </View>
  );
}
