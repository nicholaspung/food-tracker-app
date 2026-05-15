import { useMemo } from 'react';

import { RestaurantMapView, type RestaurantMapGroup } from '../../components/maps';
import type { HomeFeedMapPoint, HomeFeedPhotoPreviewRecord } from '../../features';
import { buildPhotoThumbnailUrl } from '../../lib/photoUrls';
import { formatMapItemDate } from './homeFeedMapDateFormatting';
import {
  groupHomeFeedMapPointsByRestaurant,
} from './homeFeedMapGrouping';
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

function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

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
  const groups = useMemo<RestaurantMapGroup[]>(() => {
    const restaurantGroups = groupHomeFeedMapPointsByRestaurant(points, {
      currentUserId,
      photoPreviews,
    });

    return restaurantGroups.map((group) => {
      const ratings = pluralize(group.items.length, 'rating', 'ratings');
      const visits = pluralize(group.visitCount, 'visit', 'visits');
      const foodProducts =
        group.foodProductCount > 0
          ? ` • ${pluralize(group.foodProductCount, 'food product', 'food products')}`
          : '';

      return {
        id: group.id,
        items: group.items.map((item) => {
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
  }, [currentUserId, feedMode, onOpenPhotoViewer, photoPreviews, points]);

  return (
    <RestaurantMapView
      analyticsSource="HomeFeedMapView"
      emptyDescription="Entries need a saved restaurant location before they can appear here."
      emptyTitle="No map locations yet"
      errorMessage={errorMessage}
      groups={groups}
      loading={loading}
      mapTestID="home-feed-map"
      omittedWithoutCoordinates={omittedWithoutCoordinates}
      onRetry={onRetry}
      onSelectedGroupChange={onSelectedGroupChange}
      resetSignal={resetSignal}
      selectedGroupId={selectedGroupId}
      testID="home-feed-map-view"
    />
  );
}
