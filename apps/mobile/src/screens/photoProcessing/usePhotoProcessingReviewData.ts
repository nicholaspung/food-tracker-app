import { useMemo } from 'react';

import type { HomeFeedPhotoRecord } from '../../components/shared';
import type { VisitRecord } from '../../features';
import { localDateStringToUTC } from '../../lib/dateFormatting';
import {
  buildFoodProductReviewEntries,
  buildRestaurantReviewGroups,
  formatReviewEntryFooterLabel,
  type DraftPhotoAsset,
  type FoodProductReviewEntry,
  type RestaurantPhotoForm,
  type ReviewFoodProductCardData,
  type ReviewVisitCardData,
} from './shared';
import type { FoodProductFormValues } from '../../lib/foodProductForm';

interface UsePhotoProcessingReviewDataParams {
  currentUserId: string | null;
  photos: DraftPhotoAsset[];
  foodProductForms: Record<string, FoodProductFormValues>;
  restaurantForms: Record<string, RestaurantPhotoForm>;
  userName?: string;
  visitVisibility: 'friends' | 'private';
}

export function usePhotoProcessingReviewData({
  currentUserId,
  photos,
  foodProductForms,
  restaurantForms,
  userName,
  visitVisibility,
}: UsePhotoProcessingReviewDataParams) {
  const restaurantReviewGroups = useMemo(
    () => buildRestaurantReviewGroups(photos, restaurantForms),
    [photos, restaurantForms],
  );

  const foodProductReviewEntries = useMemo<FoodProductReviewEntry[]>(
    () => buildFoodProductReviewEntries(photos, foodProductForms),
    [photos, foodProductForms],
  );

  const reviewFoodProductCards = useMemo<ReviewFoodProductCardData[]>(() => {
    return foodProductReviewEntries.map((entry, index) => {
      const eventAt =
        entry.photo.captureDate?.toISOString() ??
        localDateStringToUTC(entry.form.date);

      return {
        id: `review-food-product-${entry.photo.id}-${index}`,
        foodProduct: {
          id: entry.photo.id,
          restaurantName: 'Food Product',
          itemCategory: entry.form.category || undefined,
          itemName: entry.form.itemName.trim(),
          locationText: entry.form.locationText.trim() || undefined,
          rating: entry.form.rating,
          notes: entry.form.notes.trim() || undefined,
          userId: currentUserId ?? undefined,
          userName,
          visibility: entry.form.visibility,
          itemDate: eventAt,
          createdAt: eventAt,
          updatedAt: eventAt,
        },
        photos: [
          {
            id: entry.photo.id,
            food_item: entry.photo.id,
            photo: entry.photo.name,
            uri: entry.photo.uri,
            created: eventAt,
          },
        ],
        entryMeta: formatReviewEntryFooterLabel(eventAt, entry.form.date),
      };
    });
  }, [currentUserId, foodProductReviewEntries, userName]);

  const reviewVisitCards = useMemo<ReviewVisitCardData[]>(() => {
    return restaurantReviewGroups.map((group, groupIndex) => {
      const representativeTimestamp =
        group.items.find((entry) => entry.photo.captureDate)?.photo.captureDate?.toISOString() ??
        null;
      const eventAt = representativeTimestamp ?? localDateStringToUTC(group.date);
      const footerLabel = formatReviewEntryFooterLabel(eventAt, group.date);
      const visitItems = group.items.map((entry, itemIndex) => ({
        id: `review-visit-item-${groupIndex}-${itemIndex}-${entry.photo.id}`,
        name: entry.form.menuItemName.trim(),
        rating: entry.form.rating,
        description: entry.form.description.trim() || undefined,
        notes: entry.form.notes.trim() || undefined,
      }));
      const photosByFoodItem = new Map<string, HomeFeedPhotoRecord[]>();

      group.items.forEach((entry, itemIndex) => {
        const visitItemId = visitItems[itemIndex]?.id;
        if (!visitItemId) {
          return;
        }

        photosByFoodItem.set(visitItemId, [
          {
            id: entry.photo.id,
            food_item: visitItemId,
            photo: entry.photo.name,
            uri: entry.photo.uri,
            created: entry.photo.captureDate?.toISOString() ?? eventAt,
          },
        ]);
      });

      const visit: VisitRecord = {
        id: `review-visit-${groupIndex}-${group.date}`,
        restaurantName: group.restaurantName,
        visitedAt: eventAt,
        items: visitItems,
        source: 'visit',
        userId: currentUserId ?? undefined,
        userName,
        visibility: visitVisibility,
        createdAt: eventAt,
        updatedAt: eventAt,
      };

      return {
        id: visit.id,
        visit,
        photosByFoodItem,
        footerLabel,
      };
    });
  }, [currentUserId, restaurantReviewGroups, userName, visitVisibility]);

  return {
    foodProductReviewEntries,
    restaurantReviewGroups,
    reviewFoodProductCards,
    reviewVisitCards,
  };
}
