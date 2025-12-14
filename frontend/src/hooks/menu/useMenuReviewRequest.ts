import { useState, useEffect } from "react";
import {
  requestMenuReview,
  hasPendingReviewRequest,
} from "@/services/menuReviewService";
import { logger } from "@/lib/logger";

export interface UseMenuReviewRequestParams {
  restaurantId: string;
  isOnline: boolean;
  onError?: (error: Error, options?: { customMessage?: string }) => void;
}

export interface UseMenuReviewRequestReturn {
  reviewRequested: boolean;
  hasPendingReview: boolean;
  handleRequestReview: () => Promise<void>;
}

export function useMenuReviewRequest({
  restaurantId,
  isOnline,
  onError,
}: UseMenuReviewRequestParams): UseMenuReviewRequestReturn {
  const [reviewRequested, setReviewRequested] = useState(false);
  const [hasPendingReview, setHasPendingReview] = useState(false);

  // Check if there's already a pending review request
  useEffect(() => {
    const checkPendingReview = async () => {
      if (!isOnline) {
        // Skip when offline - just assume no pending review
        setHasPendingReview(false);
        return;
      }

      try {
        const pending = await hasPendingReviewRequest(restaurantId);
        setHasPendingReview(pending);
      } catch (error) {
        logger.error("Failed to check pending review:", error);
        setHasPendingReview(false);
      }
    };
    checkPendingReview();
  }, [restaurantId, isOnline]);

  const handleRequestReview = async () => {
    try {
      await requestMenuReview(
        restaurantId,
        "User reported incorrect menu items"
      );
      // Show green confirmation first
      setReviewRequested(true);

      // After 3 seconds, switch to the persistent "pending review" state
      setTimeout(() => {
        setReviewRequested(false);
        setHasPendingReview(true);
      }, 3000);
    } catch (error) {
      logger.error("Failed to request menu review:", error);
      if (onError) {
        onError(error as Error, {
          customMessage: "Failed to request review. Please try again.",
        });
      }
    }
  };

  return {
    reviewRequested,
    hasPendingReview,
    handleRequestReview,
  };
}
