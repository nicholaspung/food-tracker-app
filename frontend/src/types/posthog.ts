/**
 * PostHog event types and properties
 * Centralized type definitions for all analytics events
 */

// User properties (NO PII - only flags)
export interface UserProperties {
  isAdmin?: boolean;
  isSubscriber?: boolean;
  // Never include: email, name, phone, etc.
}

// Common event properties
export interface BaseEventProperties {
  source?: string; // Component/page that triggered the event
  timestamp?: string;
}

// Visit flow events
export interface VisitCreatedProperties extends BaseEventProperties {
  restaurantVisibility?: 'private' | 'friends' | 'public';
  visitVisibility?: 'private' | 'friends';
  itemCount: number;
  hasPhotos: boolean;
  hasNotes: boolean;
  creationMethod: 'manual' | 'quick_track' | 'ocr';
}

// OCR events
export interface OCRProcessedProperties extends BaseEventProperties {
  processingTimeMs: number;
  itemsExtracted: number;
  compressionTimeMs?: number;
  ocrTimeMs?: number;
  uploadTimeMs?: number;
  success: boolean;
  errorType?: string;
}

// Performance events
export interface PerformanceEventProperties extends BaseEventProperties {
  duration: number;
  metric: string;
}

// Error events
export interface ErrorEventProperties extends BaseEventProperties {
  errorType: string;
  errorMessage: string;
  errorCode?: string | number;
  severity: 'error' | 'warning' | 'info';
  userFacing: boolean;
  retryable?: boolean;
}

// Offline sync events
export interface OfflineSyncProperties extends BaseEventProperties {
  operationCount: number;
  successCount: number;
  failCount: number;
  syncDuration: number;
}

// Feature usage events
export interface FeatureUsedProperties extends BaseEventProperties {
  featureName: string;
  featureCategory: 'visit' | 'quick_track' | 'social' | 'bills' | 'lists' | 'photos';
}

// Quick track events
export interface QuickTrackProperties extends BaseEventProperties {
  category?: string;
  hasPhoto: boolean;
  isOffline?: boolean;
}

// Social events
export interface SocialEventProperties extends BaseEventProperties {
  actionType: string;
}

// List events
export interface ListEventProperties extends BaseEventProperties {
  visibility?: 'private' | 'friends' | 'public';
  isCollaborative?: boolean;
  itemCount?: number;
}

// Bill events
export interface BillEventProperties extends BaseEventProperties {
  splitMode?: string;
  participantCount?: number;
  totalAmount?: number;
}

// Event name constants
export const ANALYTICS_EVENTS = {
  // Authentication
  LOGIN_SUCCESS: 'Login Success',
  LOGIN_FAILED: 'Login Failed',
  SIGNUP_SUCCESS: 'Signup Success',
  SIGNUP_FAILED: 'Signup Failed',
  LOGOUT: 'Logout',

  // Visit flow
  VISIT_CREATION_STARTED: 'Visit Creation Started',
  VISIT_CREATION_COMPLETED: 'Visit Creation Completed',
  VISIT_CREATION_FAILED: 'Visit Creation Failed',
  VISIT_UPDATED: 'Visit Updated',
  VISIT_DELETED: 'Visit Deleted',

  // Quick track
  QUICK_TRACK_STARTED: 'Quick Track Started',
  QUICK_TRACK_CREATED: 'Quick Track Created',
  QUICK_TRACK_UPDATED: 'Quick Track Updated',
  QUICK_TRACK_DELETED: 'Quick Track Deleted',

  // Photo & OCR
  PHOTO_PROCESSING_STARTED: 'Photo Processing Started',
  PHOTO_UPLOADED: 'Photo Uploaded',
  OCR_STARTED: 'OCR Started',
  OCR_COMPLETED: 'OCR Completed',
  OCR_FAILED: 'OCR Failed',

  // Social features
  FRIEND_REQUEST_SENT: 'Friend Request Sent',
  FRIEND_REQUEST_ACCEPTED: 'Friend Request Accepted',
  FRIEND_REMOVED: 'Friend Removed',

  // Lists
  LIST_CREATED: 'List Created',
  LIST_UPDATED: 'List Updated',
  LIST_DELETED: 'List Deleted',
  LIST_ITEM_ADDED: 'List Item Added',

  // Bills
  BILL_CREATED: 'Bill Created',
  BILL_SETTLED: 'Bill Settled',
  BILL_INVITE_SENT: 'Bill Invite Sent',

  // Performance
  PAGE_LOAD_TIME: 'Page Load Time',
  API_RESPONSE_TIME: 'API Response Time',

  // Errors
  ERROR_OCCURRED: 'Error Occurred',
  NETWORK_ERROR: 'Network Error',

  // Offline sync
  OFFLINE_OPERATION_QUEUED: 'Offline Operation Queued',
  OFFLINE_SYNC_COMPLETED: 'Offline Sync Completed',
  OFFLINE_SYNC_FAILED: 'Offline Sync Failed',

  // Page views (auto-captured via router)
  PAGE_VIEW: '$pageview',
} as const;

export type AnalyticsEvent = typeof ANALYTICS_EVENTS[keyof typeof ANALYTICS_EVENTS];
