import type { AdminUser } from '@/features/auth/types';

export interface RestaurantSummary {
  id: string;
  name?: string;
  location?: string;
  visibility?: 'private' | 'friends' | 'public';
  created?: string;
  updated?: string;
}

export interface MenuReviewRequest {
  id: string;
  restaurant: string;
  requestedBy: string;
  reason?: string;
  adminNotes?: string;
  status: 'pending' | 'reviewed' | 'dismissed';
  created: string;
  updated: string;
  expand?: {
    restaurant?: RestaurantSummary;
    requestedBy?: AdminUser;
  };
}

export interface MenuItemRecord {
  id: string;
  restaurant: string;
  restaurantName?: string;
  name: string;
  visibility?: 'private' | 'friends' | 'public';
  created: string;
  updated: string;
}

export interface UserRestaurantRecord {
  id: string;
  name: string;
  location?: string;
  visibility?: 'private' | 'friends' | 'public';
  created: string;
  updated: string;
}

export interface FeedbackThread {
  id: string;
  user: string;
  title: string;
  description: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  assigned_admin?: string;
  assigned_at?: string;
  admin_unread_count?: number;
  admin_reply_deadline_at?: string;
  user_unread_count?: number;
  last_message_at?: string;
  created: string;
  updated: string;
  expand?: {
    assigned_admin?: AdminUser;
    user?: AdminUser;
  };
}

export interface FeedbackMessage {
  id: string;
  feedback: string;
  user: string;
  message: string;
  is_admin_message: boolean;
  created: string;
  expand?: {
    user?: AdminUser;
  };
}

export interface VisitSummary {
  id: string;
  user: string;
  restaurant?: string;
  visitDate?: string;
  created: string;
  expand?: {
    restaurant?: RestaurantSummary;
  };
}

export interface FoodItemSummary {
  id: string;
  name: string;
  rating: number;
  created: string;
}

export interface NoteSummary {
  id: string;
  content: string;
  created: string;
}

export interface PhotoUpload {
  id: string;
  collectionName?: string;
  user: string;
  visit?: string;
  foodItem?: string;
  photo: string;
  created: string;
  expand?: {
    user?: AdminUser;
    visit?: VisitSummary;
    foodItem?: FoodItemSummary;
  };
}

export interface ModerationPhoto {
  id: string;
  moderationStatus?: ModerationContentStatus;
  photo: string;
  caption?: string;
  created: string;
  collectionName: string;
}

export interface ModerationFeedItem {
  id: string;
  moderationStatus?: ModerationContentStatus;
  name: string;
  rating: number;
  description?: string;
  notes?: string;
  created: string;
  photos: ModerationPhoto[];
}

export type ModerationContentStatus =
  | 'active'
  | 'reviewed'
  | 'under_review'
  | 'hidden'
  | 'removed'
  | 'escalated';

export type ModerationCaseStatus =
  | 'open'
  | 'under_review'
  | 'reviewed'
  | 'hidden'
  | 'removed'
  | 'restored'
  | 'escalated'
  | 'restricted_visibility'
  | 'warned'
  | 'restricted'
  | 'banned';

export type ModerationAction =
  | 'mark_reviewed'
  | 'quarantine'
  | 'hide'
  | 'remove'
  | 'restore'
  | 'escalate'
  | 'restrict_visibility'
  | 'warn'
  | 'restrict'
  | 'ban';

export type ModerationAppealState = 'none' | 'requested' | 'approved' | 'denied';

export type ModerationReasonCode =
  | 'spam'
  | 'harassment'
  | 'hate'
  | 'sexual'
  | 'violence'
  | 'self_harm'
  | 'illegal'
  | 'privacy'
  | 'copyright'
  | 'misinformation'
  | 'other'
  | 'pre_review';

export interface ModerationFeedEntry {
  id: string;
  contentType: 'visit' | 'quick-track';
  moderationStatus?: ModerationContentStatus;
  eventAt: string;
  created: string;
  updated: string;
  visibility?: 'private' | 'friends' | 'public';
  restaurantId?: string;
  restaurantName?: string;
  restaurantLocation?: string;
  restaurantCuisineType?: string;
  items?: ModerationFeedItem[];
  itemName?: string;
  itemCategory?: string;
  rating?: number;
  notes?: string;
  locationText?: string;
  photos?: ModerationPhoto[];
}

export interface ModerationRestaurantListItem {
  id: string;
  moderationStatus?: ModerationContentStatus;
  position: number;
  note?: string;
  created: string;
  restaurantId?: string;
  restaurantName?: string;
  restaurantLocation?: string;
  foodItemId?: string;
  foodItemName?: string;
  foodItemRating?: number;
  userFoodItemId?: string;
  userFoodItemName?: string;
  userFoodItemRating?: number;
}

export interface ModerationRestaurantList {
  id: string;
  name: string;
  moderationStatus?: ModerationContentStatus;
  description?: string;
  visibility: 'private' | 'friends' | 'public';
  isDefault?: boolean;
  isCollaborative?: boolean;
  created: string;
  updated: string;
  items: ModerationRestaurantListItem[];
}

export interface ModerationCase {
  id: string;
  targetType: 'visit' | 'food-item' | 'quick-track' | 'list' | 'list-item' | 'note' | 'photo' | 'user';
  targetRecordId: string;
  targetCollection: string;
  targetLabel?: string;
  status: ModerationCaseStatus;
  action?: ModerationAction;
  reasonCode?: ModerationReasonCode;
  moderatorNote?: string;
  userNotice?: string;
  appealState?: ModerationAppealState;
  assignedAt?: string;
  resolvedAt?: string;
  created: string;
  updated: string;
  expand?: {
    targetUser?: AdminUser;
    assignedAdmin?: AdminUser;
  };
}

export interface UserBillSummary {
  id: string;
  billName: string;
  totalAmount: number;
  tax?: number;
  tip?: number;
  fees?: number;
  splitMode: 'even' | 'itemized' | 'custom';
  extrasSplitMode: 'proportional' | 'equal';
  status: 'active' | 'settled' | 'cancelled';
  participantCount: number;
  itemCount: number;
  isCreator: boolean;
  amountOwed?: number;
  paidStatus?: 'pending' | 'paid';
  paymentMethod?: string;
  created: string;
  updated: string;
}

export interface AuditLogRecord {
  id: string;
  action: 'create' | 'update' | 'delete' | 'view';
  actor?: string;
  actorEmail?: string;
  summary?: string;
  targetCollection: string;
  targetRecordId: string;
  targetLabel?: string;
  requestMethod?: string;
  requestPath?: string;
  requestIp?: string;
  userAgent?: string;
  changedFields?: string[];
  beforeJson?: Record<string, unknown> | null;
  afterJson?: Record<string, unknown> | null;
  metadataJson?: Record<string, unknown> | null;
  created: string;
  expand?: {
    actor?: AdminUser;
  };
}
