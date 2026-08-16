import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { createMenuReviewRequest } from './menuParsingGateway';
import { useRestaurantMenuItemsQuery } from './menuItemsQuery';

interface UseTastingPlanMenuCatalogInput {
  activeRestaurantId: string | null;
  enabled: boolean;
  isOnline: boolean;
  searchQuery?: string;
}

export function useTastingPlanMenuCatalog({
  activeRestaurantId,
  enabled,
  isOnline,
  searchQuery = '',
}: UseTastingPlanMenuCatalogInput) {
  const queryClient = useQueryClient();
  const [menuReviewSubmitted, setMenuReviewSubmitted] = useState(false);
  const reviewResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const menuItemsQuery = useRestaurantMenuItemsQuery({
    restaurantId: activeRestaurantId,
    enabled: enabled && Boolean(activeRestaurantId),
    isOnline,
    search: searchQuery,
  });

  useEffect(() => {
    setMenuReviewSubmitted(false);
    if (reviewResetTimerRef.current) {
      clearTimeout(reviewResetTimerRef.current);
      reviewResetTimerRef.current = null;
    }
  }, [activeRestaurantId]);

  useEffect(
    () => () => {
      if (reviewResetTimerRef.current) {
        clearTimeout(reviewResetTimerRef.current);
      }
    },
    [],
  );

  const requestMenuReview = useCallback(async (): Promise<{ status: 'completed' | 'ignored' }> => {
    if (!activeRestaurantId || !isOnline || menuReviewSubmitted) {
      return { status: 'ignored' };
    }

    await createMenuReviewRequest({
      restaurantId: activeRestaurantId,
      reason: 'User reported incorrect menu items',
    });
    setMenuReviewSubmitted(true);
    queryClient.setQueryData(
      ['feature', 'menuReview', 'pending', activeRestaurantId],
      true,
    );
    if (reviewResetTimerRef.current) {
      clearTimeout(reviewResetTimerRef.current);
    }
    reviewResetTimerRef.current = setTimeout(() => {
      setMenuReviewSubmitted(false);
      reviewResetTimerRef.current = null;
    }, 3000);

    return { status: 'completed' };
  }, [activeRestaurantId, isOnline, menuReviewSubmitted, queryClient]);

  return {
    menuItemsQuery,
    menuReviewSubmitted,
    requestMenuReview,
  };
}

export type TastingPlanMenuCatalog = ReturnType<typeof useTastingPlanMenuCatalog>;
