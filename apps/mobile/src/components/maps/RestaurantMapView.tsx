import type { ComponentType, ForwardRefExoticComponent, RefAttributes } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import type { MapMarkerProps, MapViewProps, Region } from 'react-native-maps';

import {
  CurrentLocationButton,
  EmptyState,
  ErrorState,
  LoadingOverlay,
} from '../shared';
import { useForegroundLocationCapture } from '../../hooks/useForegroundLocationCapture';
import type { Coordinates } from '../../lib/coordinates';
import { createThemedStyles, useTheme } from '../../theme';
import { Text } from '../../ui';
import { RestaurantMapSheet } from './RestaurantMapSheet';
import {
  buildCurrentLocationRegion,
  buildInitialMapRegion,
  buildSelectedRestaurantRegion,
} from './restaurantMapRegion';
import { buildRestaurantDirectionsUrl } from './restaurantDirectionsLink';
import type { RestaurantMapGroup } from './restaurantMapTypes';

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
  analyticsSource: string;
  testID: string;
  mapTestID: string;
  onRetry: () => void;
  externalTopInset?: number;
  onUserRegionChangeComplete?: (region: Region) => void;
  preserveRegionOnGroupsChange?: boolean;
  style?: StyleProp<ViewStyle>;
}

type MapViewHandle = {
  animateToRegion?: (region: ReturnType<typeof buildCurrentLocationRegion>, duration?: number) => void;
};

type MapsComponents = {
  MapView: ForwardRefExoticComponent<MapViewProps & RefAttributes<MapViewHandle>>;
  Marker: ComponentType<MapMarkerProps>;
};

let mapsComponents: MapsComponents | null | undefined;

function loadMapsComponents(): MapsComponents | null {
  if (mapsComponents !== undefined) {
    return mapsComponents;
  }

  try {
    // Lazy-load so older dev-client binaries can render a fallback instead of crashing at module import time.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const maps = require('react-native-maps') as {
      default: ComponentType<MapViewProps>;
      Marker: ComponentType<MapMarkerProps>;
    };
    mapsComponents = {
      MapView: maps.default as ForwardRefExoticComponent<MapViewProps & RefAttributes<MapViewHandle>>,
      Marker: maps.Marker,
    };
  } catch {
    mapsComponents = null;
  }

  return mapsComponents;
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
  map: {
    flex: 1,
  },
  marker: {
    alignItems: 'center',
    backgroundColor: theme.colors.text.secondary,
    borderColor: theme.colors.background.surface,
    borderRadius: theme.radii.pill,
    borderWidth: 2,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  markerSelected: {
    backgroundColor: theme.colors.text.brand,
    height: 30,
    width: 30,
  },
  markerDot: {
    backgroundColor: theme.colors.background.surface,
    borderRadius: theme.radii.pill,
    height: 8,
    width: 8,
  },
  helperPill: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: theme.colors.background.surface,
    borderColor: theme.colors.border.default,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.xs,
    left: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    position: 'absolute',
    right: theme.spacing.sm,
    top: theme.spacing.sm,
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
  mapControls: {
    gap: theme.spacing.xs,
    position: 'absolute',
    right: theme.spacing.sm,
    top: theme.spacing.sm,
    zIndex: 2,
  },
  resetButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.background.surface,
    borderColor: theme.colors.border.default,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    elevation: 2,
    height: theme.sizes.inputMinHeight,
    justifyContent: 'center',
    width: theme.sizes.inputMinHeight,
  },
  gpsButton: {
    elevation: 2,
  },
  locationErrorPill: {
    alignSelf: 'center',
    backgroundColor: theme.colors.background.surface,
    borderColor: theme.colors.border.danger,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    bottom: theme.spacing.sm,
    left: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    position: 'absolute',
    right: theme.spacing.sm,
    zIndex: 2,
  },
  locationErrorText: {
    color: theme.colors.text.danger,
    textAlign: 'center',
  },
}));

export function RestaurantMapView({
  groups,
  selectedGroupId,
  onSelectedGroupChange,
  resetSignal = 0,
  loading,
  errorMessage,
  emptyTitle,
  emptyDescription,
  omittedWithoutCoordinates,
  hiddenLocationSingularLabel = 'entry',
  hiddenLocationPluralLabel = 'entries',
  initialUserCoordinates = null,
  onOpenSelectedGroup,
  selectedGroupActionLabel,
  analyticsSource,
  testID,
  mapTestID,
  onRetry,
  externalTopInset = 0,
  onUserRegionChangeComplete,
  preserveRegionOnGroupsChange = false,
  style,
}: RestaurantMapViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const mapRef = useRef<MapViewHandle | null>(null);
  const userPanPendingRef = useRef(false);
  const didHandleInitialRegionRef = useRef(false);
  const lastHandledResetSignalRef = useRef(resetSignal);
  const [locationErrorMessage, setLocationErrorMessage] = useState<string | null>(null);
  const [directionsErrorMessage, setDirectionsErrorMessage] = useState<string | null>(null);
  const [directionsLoading, setDirectionsLoading] = useState(false);
  const [hiddenLocationBannerDismissed, setHiddenLocationBannerDismissed] = useState(false);
  const [userCoordinates, setUserCoordinates] = useState<Coordinates | null>(initialUserCoordinates);
  const maps = loadMapsComponents();
  const initialRegion = useMemo(() => buildInitialMapRegion(groups), [groups]);
  const selectedGroup = groups.find((group) => group.id === selectedGroupId) ?? null;
  const {
    captureLocation,
    isCapturing: isCapturingLocation,
  } = useForegroundLocationCapture({
    blockedPermissionMessage: 'Location permission is blocked. Enable it in device settings to recenter the map.',
    defaultErrorMessage: 'Could not find your current location.',
    deniedPermissionMessage: 'Location permission is required to recenter the map.',
  });
  const showHiddenLocationBanner = omittedWithoutCoordinates > 0 && !hiddenLocationBannerDismissed;

  useEffect(() => {
    setHiddenLocationBannerDismissed(false);
  }, [omittedWithoutCoordinates]);

  useEffect(() => {
    if (initialUserCoordinates) {
      setUserCoordinates(initialUserCoordinates);
    }
  }, [initialUserCoordinates]);

  useEffect(() => {
    if (selectedGroupId && !selectedGroup) {
      onSelectedGroupChange(null);
    }
  }, [onSelectedGroupChange, selectedGroup, selectedGroupId]);

  useEffect(() => {
    setDirectionsErrorMessage(null);
  }, [selectedGroupId]);

  useEffect(() => {
    if (!maps || groups.length === 0) {
      return;
    }

    if (preserveRegionOnGroupsChange && didHandleInitialRegionRef.current) {
      return;
    }

    didHandleInitialRegionRef.current = true;
    mapRef.current?.animateToRegion?.(initialRegion, 0);
  }, [groups.length, initialRegion, maps, preserveRegionOnGroupsChange]);

  useEffect(() => {
    if (lastHandledResetSignalRef.current === resetSignal) {
      return;
    }

    lastHandledResetSignalRef.current = resetSignal;
    if (!maps || groups.length === 0) {
      return;
    }

    didHandleInitialRegionRef.current = true;
    mapRef.current?.animateToRegion?.(initialRegion, 300);
  }, [groups.length, initialRegion, maps, resetSignal]);

  if (loading && groups.length === 0) {
    return (
      <View style={[styles.container, style]} testID={testID}>
        <View style={styles.stateWrap}>
          <LoadingOverlay label="Loading map..." visible />
        </View>
      </View>
    );
  }

  if (errorMessage && groups.length === 0) {
    return (
      <View style={[styles.container, style]} testID={testID}>
        <View style={styles.stateWrap}>
          <ErrorState
            analyticsSource={analyticsSource}
            description={errorMessage}
            onRetry={onRetry}
            title="Map unavailable"
          />
        </View>
      </View>
    );
  }

  if (groups.length === 0) {
    return (
      <View style={[styles.container, style]} testID={testID}>
        <View style={styles.stateWrap}>
          <EmptyState
            analyticsSource={analyticsSource}
            description={emptyDescription}
            fill
            title={emptyTitle}
          />
        </View>
      </View>
    );
  }

  if (!maps) {
    return (
      <View style={[styles.container, style]} testID={testID}>
        <View style={styles.stateWrap}>
          <ErrorState
            analyticsSource={analyticsSource}
            description="Map support was added to JavaScript, but this development build does not include the native maps module yet. Rebuild the iOS app to use map view."
            title="Map build required"
          />
        </View>
      </View>
    );
  }

  const { MapView, Marker } = maps;
  const helperTop = theme.spacing.sm + externalTopInset;
  const controlsTop = showHiddenLocationBanner
    ? theme.spacing.xxl + theme.spacing.lg + externalTopInset
    : theme.spacing.sm + externalTopInset;
  const handleRestaurantMarkerPress = (groupId: string) => {
    const group = groups.find((candidate) => candidate.id === groupId);
    if (group) {
      mapRef.current?.animateToRegion?.(buildSelectedRestaurantRegion(group), 300);
    }

    onSelectedGroupChange(groupId);
  };
  const handleUseCurrentLocationPress = async () => {
    setLocationErrorMessage(null);
    const result = await captureLocation();
    if (result.status !== 'success') {
      setLocationErrorMessage(result.message);
      return;
    }

    setUserCoordinates(result.coordinates);
    mapRef.current?.animateToRegion?.(buildCurrentLocationRegion(result.coordinates), 350);
  };
  const handleResetMapPress = () => {
    onSelectedGroupChange(null);
    mapRef.current?.animateToRegion?.(initialRegion, 300);
  };
  const handlePanDrag = () => {
    userPanPendingRef.current = true;
  };
  const handleRegionChangeComplete = (region: Region) => {
    if (!userPanPendingRef.current) {
      return;
    }

    userPanPendingRef.current = false;
    onUserRegionChangeComplete?.(region);
  };
  const handleOpenDirections = async (group: RestaurantMapGroup) => {
    setDirectionsErrorMessage(null);
    setDirectionsLoading(true);

    try {
      await Linking.openURL(buildRestaurantDirectionsUrl(group));
    } catch {
      setDirectionsErrorMessage('Could not open directions. Try again from your maps app.');
    } finally {
      setDirectionsLoading(false);
    }
  };

  return (
    <View style={[styles.container, style]} testID={testID}>
      <MapView
        initialRegion={initialRegion}
        onPress={() => {
          onSelectedGroupChange(null);
        }}
        onPanDrag={handlePanDrag}
        onRegionChangeComplete={handleRegionChangeComplete}
        ref={mapRef}
        showsUserLocation={Boolean(userCoordinates)}
        style={styles.map}
        testID={mapTestID}
      >
        {groups.map((group) => {
          const selected = group.id === selectedGroupId;

          return (
            <Marker
              coordinate={{
                latitude: group.latitude,
                longitude: group.longitude,
              }}
              key={group.id}
              onPress={(event) => {
                event.stopPropagation?.();
                handleRestaurantMarkerPress(group.id);
              }}
            >
              <View style={[styles.marker, selected ? styles.markerSelected : null]}>
                <View style={styles.markerDot} />
              </View>
            </Marker>
          );
        })}
      </MapView>

      {showHiddenLocationBanner ? (
        <View style={[styles.helperPill, { top: helperTop }]}>
          <Text style={styles.helperText} variant="bodySmTightSemiBold">
            {omittedWithoutCoordinates} {omittedWithoutCoordinates === 1 ? hiddenLocationSingularLabel : hiddenLocationPluralLabel} without locations are hidden from map.
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

      <View style={[styles.mapControls, { top: controlsTop }]} testID={`${testID}-controls`}>
        <Pressable
          accessibilityLabel="Reset map view"
          accessibilityRole="button"
          onPress={handleResetMapPress}
          style={styles.resetButton}
        >
          <Ionicons color={theme.colors.text.secondary} name="refresh" size={16} />
        </Pressable>
        <CurrentLocationButton
          accessibilityLabel="Recenter map to current location"
          loading={isCapturingLocation}
          onPress={() => {
            void handleUseCurrentLocationPress();
          }}
          style={styles.gpsButton}
          variant="icon"
        />
      </View>

      {locationErrorMessage ? (
        <View style={styles.locationErrorPill}>
          <Text style={styles.locationErrorText} variant="bodySmTightSemiBold">
            {locationErrorMessage}
          </Text>
        </View>
      ) : null}

      <RestaurantMapSheet
        directionsErrorMessage={directionsErrorMessage}
        directionsLoading={directionsLoading}
        group={selectedGroup}
        onClose={() => {
          onSelectedGroupChange(null);
        }}
        onOpenSelectedGroup={onOpenSelectedGroup}
        onOpenDirections={handleOpenDirections}
        selectedGroupActionLabel={selectedGroupActionLabel}
      />
    </View>
  );
}
