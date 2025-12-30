/**
 * Analytics Event Catalog
 *
 * Complete reference for all tracked events in the application.
 * Import and use these constants instead of hardcoding event names.
 *
 * Usage:
 * import { ANALYTICS_EVENTS } from '@/constants/analyticsEvents';
 * trackEvent(ANALYTICS_EVENTS.VISIT_CREATION_COMPLETED, { ... });
 */

// Re-export from types for centralized access
export { ANALYTICS_EVENTS } from '@/types/posthog';

/**
 * Event naming convention:
 * - Use Title Case with spaces
 * - Format: [Noun] [Verb in Past Tense]
 * - Examples: "Visit Created", "Photo Uploaded", "OCR Completed"
 *
 * Event properties convention:
 * - Use camelCase
 * - Be descriptive but concise
 * - Examples: itemCount, hasPhotos, processingTimeMs
 *
 * Privacy rules:
 * - NEVER include PII (email, name, phone, address)
 * - Use anonymous IDs only (user.id from PocketBase)
 * - Only track user flags: isAdmin, isSubscriber
 */

/**
 * Event Categories:
 *
 * 1. Authentication
 *    - LOGIN_SUCCESS, LOGIN_FAILED
 *    - SIGNUP_SUCCESS, SIGNUP_FAILED
 *    - LOGOUT
 *
 * 2. Visit Flow
 *    - VISIT_CREATION_STARTED
 *    - VISIT_CREATION_COMPLETED
 *    - VISIT_CREATION_FAILED
 *    - VISIT_UPDATED, VISIT_DELETED
 *
 * 3. Quick Track
 *    - QUICK_TRACK_STARTED
 *    - QUICK_TRACK_CREATED
 *    - QUICK_TRACK_UPDATED
 *    - QUICK_TRACK_DELETED
 *
 * 4. Photos & OCR
 *    - PHOTO_PROCESSING_STARTED
 *    - PHOTO_UPLOADED
 *    - OCR_STARTED, OCR_COMPLETED, OCR_FAILED
 *
 * 5. Social Features
 *    - FRIEND_REQUEST_SENT
 *    - FRIEND_REQUEST_ACCEPTED
 *    - FRIEND_REMOVED
 *
 * 6. Lists
 *    - LIST_CREATED, LIST_UPDATED, LIST_DELETED
 *    - LIST_ITEM_ADDED
 *
 * 7. Bills
 *    - BILL_CREATED, BILL_SETTLED
 *    - BILL_INVITE_SENT
 *
 * 8. Performance
 *    - PAGE_LOAD_TIME
 *    - API_RESPONSE_TIME
 *
 * 9. Errors
 *    - ERROR_OCCURRED
 *    - NETWORK_ERROR
 *
 * 10. Offline Sync
 *     - OFFLINE_OPERATION_QUEUED
 *     - OFFLINE_SYNC_COMPLETED
 *     - OFFLINE_SYNC_FAILED
 */
