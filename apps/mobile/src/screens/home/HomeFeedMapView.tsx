import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { RestaurantMapView, type RestaurantMapGroup } from '../../components/maps';
import {
  homeFeedMapQueryKeys,
  listHomeFeedMapPointDetails,
  type HomeFeedMapMarker,
} from '../../features/store/homeFeedMapQuery';
import type {
  HomeFeedSort,
  HomeFeedTypeFilter,
} from '../../features/store/homeFeedPagination';
import {
  DEFAULT_HOME_FEED_MAP_REGION,
  normalizeHomeFeedMapViewport,
  type HomeFeedMapRegion,
  type HomeFeedMapViewport,
} from '../../features/store/homeFeedMapViewport';
import { buildPhotoThumbnailUrl } from '../../lib/photoUrls';
import { formatMapItemDate } from './homeFeedMapDateFormatting';
import {
  groupHomeFeedMapMarkersByRestaurant,
  groupHomeFeedMapPointsByRestaurant,
} from './homeFeedMapGrouping';
import type { FeedMode } from './homeFeedTypes';
import type { VisitPhotoRecord } from './shared';

interface HomeFeedMapViewProps {
  feedMode: FeedMode;
  points: HomeFeedMapMarker[];
  currentUserId?: string | null;
  selectedGroupId: string | null;
  onSelectedGroupChange: (id: string | null) => void;
  onOpenPhotoViewer?: (photos: VisitPhotoRecord[], initialIndex?: number) => void;
  resetSignal?: number;
  loading: boolean;
  errorMessage: string | null;
  omittedWithoutCoordinates: number;
  onRetry: () => void;
  initialRegion?: HomeFeedMapRegion;
  onRegionChangeComplete?: (region: HomeFeedMapRegion) => void;
  searchQuery?: string;
  sort?: HomeFeedSort;
  typeFilter?: HomeFeedTypeFilter;
  viewport?: HomeFeedMapViewport;
}

function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function HomeFeedMapView({
  feedMode,
  points,
  currentUserId,
  selectedGroupId,
  onSelectedGroupChange,
  onOpenPhotoViewer,
  resetSignal = 0,
  loading,
  errorMessage,
  omittedWithoutCoordinates,
  onRetry,
  initialRegion = DEFAULT_HOME_FEED_MAP_REGION,
  onRegionChangeComplete,
  searchQuery,
  sort = 'created',
  typeFilter = 'all',
  viewport = normalizeHomeFeedMapViewport(DEFAULT_HOME_FEED_MAP_REGION)!,
}: HomeFeedMapViewProps) {
  const markerGroups = useMemo(() => groupHomeFeedMapMarkersByRestaurant(points), [points]);
  const selectedMarkerGroup = markerGroups.find((group) => group.id === selectedGroupId) ?? null;
  const detailQuery = useQuery({
    enabled: Boolean(selectedMarkerGroup && currentUserId),
    queryKey: homeFeedMapQueryKeys.detail(
      currentUserId,
      selectedMarkerGroup?.points.map((point) => `${point.source}:${point.recordId}`) ?? [],
      feedMode,
      typeFilter,
      sort,
      searchQuery ?? '',
      viewport.identity,
    ),
    queryFn: ({ signal }) => listHomeFeedMapPointDetails({
      points: selectedMarkerGroup?.points ?? [],
      scope: feedMode,
      search: searchQuery,
      signal,
      sort,
      typeFilter,
      viewport,
    }),
  });
  const selectedDetailGroup = useMemo(
    () => groupHomeFeedMapPointsByRestaurant(detailQuery.data?.points ?? [], {
      currentUserId,
      photoPreviews: detailQuery.data?.photoPreviews ?? [],
    }).find((group) => group.id === selectedGroupId) ?? null,
    [currentUserId, detailQuery.data, selectedGroupId],
  );
  const groups = useMemo<RestaurantMapGroup[]>(() => {
    return markerGroups.map((group) => {
      const detailGroup = group.id === selectedGroupId ? selectedDetailGroup : null;
      const items = detailGroup?.items ?? [];
      const ratings = pluralize(items.length || group.points.length, 'rating', 'ratings');
      const visits = pluralize(group.visitCount, 'visit', 'visits');
      const foodProducts =
        group.foodProductCount > 0
          ? ` • ${pluralize(group.foodProductCount, 'food product', 'food products')}`
          : '';

      return {
        id: group.id,
        items: items.map((item) => {
          const primaryPhoto = item.photoPreviews[0] ?? null;
          return {
            id: item.id,
            meta: [
              {
                dateLabel: formatMapItemDate(item.eventAt, feedMode),
                label: item.ownerName,
                rating: item.rating,
              },
            ],
            name: item.name,
            notes: item.notes,
            onOpenPhotos:
              onOpenPhotoViewer && item.photoPreviews.length > 0
                ? () => {
                    onOpenPhotoViewer(item.photoPreviews);
                  }
                : undefined,
            photoCount: item.photoPreviews.length,
            photoThumbnailUrl: primaryPhoto ? buildPhotoThumbnailUrl(primaryPhoto) : null,
          };
        }),
        latitude: group.latitude,
        longitude: group.longitude,
        restaurantLocation: group.restaurantLocation,
        restaurantName: group.restaurantName,
        summary: `${ratings} • ${visits}${foodProducts}`,
      };
    });
  }, [feedMode, markerGroups, onOpenPhotoViewer, selectedDetailGroup, selectedGroupId]);

  return (
    <RestaurantMapView
      analyticsSource="HomeFeedMapView"
      emptyDescription="Entries need a saved restaurant location before they can appear here."
      emptyTitle="No map locations yet"
      errorMessage={errorMessage}
      groups={groups}
      initialRegionOverride={initialRegion}
      loading={loading}
      mapTestID="home-feed-map"
      omittedWithoutCoordinates={omittedWithoutCoordinates}
      onRetry={onRetry}
      onUserRegionChangeComplete={onRegionChangeComplete}
      onSelectedGroupChange={onSelectedGroupChange}
      resetSignal={resetSignal}
      selectedGroupId={selectedGroupId}
      selectedGroupDetailErrorMessage={
        detailQuery.isError ? 'Could not load this location’s details.' : null
      }
      selectedGroupDetailLoading={detailQuery.isLoading}
      testID="home-feed-map-view"
    />
  );
}
