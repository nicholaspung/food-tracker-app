import { pb, MenuReviewRequest } from '@/lib/pocketbase';
import { logger } from '@/lib/logger';

/**
 * Request admin review of a restaurant's OCR menu items
 */
export async function requestMenuReview(
  restaurantId: string,
  reason?: string
): Promise<MenuReviewRequest> {
  try {
    // Check if there's already a pending review request for this restaurant
    const existing = await pb
      .collection('menu_review_requests')
      .getFullList<MenuReviewRequest>({
        filter: `restaurant = "${restaurantId}" && status = "pending"`,
      });

    if (existing.length > 0) {
      // Already has a pending review request
      logger.log('Review request already exists for this restaurant');
      return existing[0];
    }

    // Create new review request
    const request = await pb
      .collection('menu_review_requests')
      .create<MenuReviewRequest>({
        restaurant: restaurantId,
        requestedBy: pb.authStore.model?.id,
        reason: reason || '',
        status: 'pending',
      });

    logger.log('Menu review request created successfully');
    return request;
  } catch (error) {
    logger.error('Failed to request menu review:', error);
    throw error;
  }
}

/**
 * Check if a restaurant has a pending review request
 */
export async function hasPendingReviewRequest(
  restaurantId: string
): Promise<boolean> {
  try {
    const existing = await pb
      .collection('menu_review_requests')
      .getFullList<MenuReviewRequest>({
        filter: `restaurant = "${restaurantId}" && status = "pending"`,
      });

    return existing.length > 0;
  } catch (error) {
    logger.error('Failed to check review request status:', error);
    return false;
  }
}

/**
 * Get count of pending review requests (for admin dashboard)
 */
export async function getPendingReviewCount(): Promise<number> {
  try {
    const requests = await pb
      .collection('menu_review_requests')
      .getFullList<MenuReviewRequest>({
        filter: 'status = "pending"',
      });

    return requests.length;
  } catch (error) {
    logger.error('Failed to get pending review count:', error);
    return 0;
  }
}

/**
 * Get all pending review requests (for admin UI)
 */
export async function getPendingReviewRequests(): Promise<MenuReviewRequest[]> {
  try {
    const requests = await pb
      .collection('menu_review_requests')
      .getFullList<MenuReviewRequest>({
        filter: 'status = "pending"',
        sort: '-created',
        expand: 'restaurant,requestedBy',
      });

    return requests;
  } catch (error) {
    logger.error('Failed to get pending review requests:', error);
    return [];
  }
}

/**
 * Update review request status (admin only)
 */
export async function updateReviewRequestStatus(
  requestId: string,
  status: 'reviewed' | 'dismissed',
  adminNotes?: string
): Promise<MenuReviewRequest> {
  try {
    const request = await pb
      .collection('menu_review_requests')
      .update<MenuReviewRequest>(requestId, {
        status,
        adminNotes: adminNotes || '',
      });

    logger.log('Review request status updated');
    return request;
  } catch (error) {
    logger.error('Failed to update review request status:', error);
    throw error;
  }
}
