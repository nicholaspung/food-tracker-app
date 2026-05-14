import type { ComponentType, ForwardRefExoticComponent, RefAttributes } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import type { MapMarkerProps, MapViewProps } from 'react-native-maps';

import {
  CurrentLocationButton,
  EmptyState,
  ErrorState,
  LoadingOverlay,
} from '../../components/shared';
import type { HomeFeedMapPoint, HomeFeedPhotoPreviewRecord } from '../../features';
import { useForegroundLocationCapture } from '../../hooks/useForegroundLocationCapture';
import type { Coordinates } from '../../lib/coordinates';
import { createThemedStyles, useTheme } from '../../theme';
import { Text } from '../../ui';
import { HomeFeedMapRestaurantSheet } from './HomeFeedMapRestaurantSheet';
import {
  groupHomeFeedMapPointsByRestaurant,
} from './homeFeedMapGrouping';
import {
  buildCurrentLocationRegion,
  buildInitialMapRegion,
  buildSelectedRestaurantRegion,
} from './homeFeedMapRegion';
import type { FeedMode } from './homeFeedTypes';
import type { VisitPhotoRecord } from './shared';

interface HomeFeedMapViewProps {
  feedMode: FeedMode;
  points: HomeFeedMapPoint[];
  photoPreviews?: HomeFeedPhotoPreviewRecord[];
  currentUserId?: string | null;
  selectedGroupId: string | null;
  onSelectedGroupChange: (id: string | null) => void;
  onOpenPhotoViewer?: (photos: VisitPhotoRecord[], initialIndex?: number) => void;
  resetSignal?: number;
  loading: boolean;
  errorMessage: string | null;
  omittedWithoutCoordinates: number;
  onRetry: () => void;
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
  mapControlsWithHelper: {
    top: theme.spacing.xxl + theme.spacing.lg,
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

export function HomeFeedMapView({
  feedMode,
  points,
  photoPreviews = [],
  currentUserId,
  selectedGroupId,
  onSelectedGroupChange,
  onOpenPhotoViewer,
  resetSignal = 0,
  loading,
  errorMessage,
  omittedWithoutCoordinates,
  onRetry,
}: HomeFeedMapViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const mapRef = useRef<MapViewHandle | null>(null);
  const [locationErrorMessage, setLocationErrorMessage] = useState<string | null>(null);
  const [hiddenLocationBannerDismissed, setHiddenLocationBannerDismissed] = useState(false);
  const [userCoordinates, setUserCoordinates] = useState<Coordinates | null>(null);
  const maps = loadMapsComponents();
  const restaurantGroups = useMemo(
    () => groupHomeFeedMapPointsByRestaurant(points, {
      currentUserId,
      photoPreviews,
    }),
    [currentUserId, photoPreviews, points],
  );
  const initialRegion = useMemo(() => buildInitialMapRegion(restaurantGroups), [restaurantGroups]);
  const selectedGroup = restaurantGroups.find((group) => group.id === selectedGroupId) ?? null;
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
    if (selectedGroupId && !selectedGroup) {
      onSelectedGroupChange(null);
    }
  }, [onSelectedGroupChange, selectedGroup, selectedGroupId]);

  useEffect(() => {
    if (!maps || points.length === 0) {
      return;
    }

    mapRef.current?.animateToRegion?.(initialRegion, 0);
  }, [initialRegion, maps, points.length, resetSignal]);

  if (loading && points.length === 0) {
    return (
      <View style={styles.container} testID="home-feed-map-view">
        <View style={styles.stateWrap}>
          <LoadingOverlay label="Loading map..." visible />
        </View>
      </View>
    );
  }

  if (errorMessage && points.length === 0) {
    return (
      <View style={styles.container} testID="home-feed-map-view">
        <View style={styles.stateWrap}>
          <ErrorState
            analyticsSource="HomeFeedMapView"
            description={errorMessage}
            onRetry={onRetry}
            title="Map unavailable"
          />
        </View>
      </View>
    );
  }

  if (points.length === 0) {
    return (
      <View style={styles.container} testID="home-feed-map-view">
        <View style={styles.stateWrap}>
          <EmptyState
            analyticsSource="HomeFeedMapView"
            description="Entries need a saved restaurant location before they can appear here."
            fill
            title="No map locations yet"
          />
        </View>
      </View>
    );
  }

  if (!maps) {
    return (
      <View style={styles.container} testID="home-feed-map-view">
        <View style={styles.stateWrap}>
          <ErrorState
            analyticsSource="HomeFeedMapView"
            description="Map support was added to JavaScript, but this development build does not include the native maps module yet. Rebuild the iOS app to use map view."
            title="Map build required"
          />
        </View>
      </View>
    );
  }

  const { MapView, Marker } = maps;
  const handleRestaurantMarkerPress = (groupId: string) => {
    const group = restaurantGroups.find((candidate) => candidate.id === groupId);
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

  return (
    <View style={styles.container} testID="home-feed-map-view">
      <MapView
        initialRegion={initialRegion}
        onPress={() => {
          onSelectedGroupChange(null);
        }}
        ref={mapRef}
        showsUserLocation={Boolean(userCoordinates)}
        style={styles.map}
        testID="home-feed-map"
      >
        {restaurantGroups.map((group) => {
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
        <View style={styles.helperPill}>
          <Text style={styles.helperText} variant="bodySmTightSemiBold">
            {omittedWithoutCoordinates} {omittedWithoutCoordinates === 1 ? 'entry' : 'entries'} without locations are hidden from map.
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

      <View style={[styles.mapControls, showHiddenLocationBanner ? styles.mapControlsWithHelper : null]}>
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

      <HomeFeedMapRestaurantSheet
        feedMode={feedMode}
        group={selectedGroup}
        onClose={() => {
          onSelectedGroupChange(null);
        }}
        onOpenPhotoViewer={onOpenPhotoViewer}
      />
    </View>
  );
}
