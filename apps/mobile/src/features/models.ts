export type ModerationContentStatus =
  | 'active'
  | 'reviewed'
  | 'under_review'
  | 'hidden'
  | 'removed'
  | 'escalated';

export type ContentReportReasonCode =
  | 'spam'
  | 'harassment'
  | 'hate'
  | 'sexual'
  | 'violence'
  | 'privacy'
  | 'other';

export interface VisitItem {
  id: string;
  name: string;
  rating: number;
  description?: string;
  notes?: string;
}

export interface VisitRecord {
  id: string;
  restaurantId?: string;
  restaurantName: string;
  restaurantLocation?: string;
  restaurantCuisineType?: string;
  visitedAt: string;
  items: VisitItem[];
  source: 'visit' | 'quick-track' | 'tasting-result';
  userId?: string;
  userName?: string;
  visibility?: 'friends' | 'private';
  moderationStatus?: ModerationContentStatus;
  createdAt: string;
  updatedAt: string;
}

export interface QuickTrackRecord {
  id: string;
  restaurantName: string;
  itemCategory?: 'convenience_store' | 'packaged_food' | 'homemade' | 'recipe' | 'other' | 'restaurant';
  itemName: string;
  rating: number;
  notes?: string;
  sourceNoteId?: string;
  userId?: string;
  userName?: string;
  visibility?: 'friends' | 'private';
  moderationStatus?: ModerationContentStatus;
  itemDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PhotoDraftAsset {
  id: string;
  source: 'camera' | 'gallery';
  uri: string;
  status: 'pending' | 'processing' | 'succeeded' | 'failed';
  errorMessage?: string;
}

export interface PhotoProcessingDraft {
  assets: PhotoDraftAsset[];
  updatedAt: string;
}

export interface RestaurantRecord {
  id: string;
  name: string;
  city?: string;
  location?: string;
  cuisineType?: string;
  visibility?: 'private' | 'friends' | 'public';
  latitude?: number;
  longitude?: number;
  placeId?: string;
  isGooglePlace?: boolean;
}

export interface RestaurantListRecord {
  id: string;
  name: string;
  description?: string;
  visibility: 'private' | 'friends';
  userId: string;
  ownerName?: string;
  isDefault?: boolean;
  coverImage?: string;
  restaurantCount?: number;
  menuItemCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface InviteCodeRecord {
  id: string;
  code: string;
  locked?: boolean;
  lockedUntil?: string;
}

export interface RestaurantListBookmarkedItemRecord {
  id: string;
  listItemId: string;
  name: string;
  rating: number;
  visitedAt?: string;
  sourceUserId?: string;
  sourceUserName?: string;
  userFoodItemId?: string;
  userFoodItemName?: string;
  userFoodItemRating?: number;
  userFoodItemVisitedAt?: string;
}

export interface RestaurantListItemRecord {
  id: string;
  listId: string;
  restaurantId: string;
  restaurantName: string;
  restaurantCity?: string;
  restaurantCuisineType?: string;
  sourceUserId?: string;
  sourceUserName?: string;
  position: number;
  bookmarkedItems: RestaurantListBookmarkedItemRecord[];
  note?: string;
  createdAt: string;
}

export interface NoteRecord {
  id: string;
  title: string;
  content: string;
  locationText?: string;
  rating?: number;
  status: 'draft' | 'used';
  restaurantId?: string;
  restaurantName?: string;
  usedInVisitId?: string;
  usedInFoodItemId?: string;
  createdAt: string;
  updatedAt: string;
}

export type FriendStatus = 'friend' | 'pending_received' | 'pending_sent';

export interface FriendRecord {
  id: string;
  userId: string;
  name: string;
  email: string;
  status: FriendStatus;
  createdAt: string;
}

export interface ProfileRecord {
  displayName: string;
  bio: string;
  location: string;
  favoriteCuisine: string;
  receiveMarketingEmails: boolean;
}

export interface FeedbackRecord {
  id: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  assignedAdminId?: string;
  adminReplyDeadlineAt?: string;
  title: string;
  description: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  adminUnreadCount: number;
  userUnreadCount: number;
  lastMessageAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FeedbackMessageRecord {
  id: string;
  feedbackId: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  message: string;
  isAdminMessage: boolean;
  createdAt: string;
}

export interface TastingSessionParticipant {
  id: string;
  userId?: string;
  name: string;
  joinedAt: string;
}

export interface TastingSessionRating {
  participantId: string;
  rating: number;
  note?: string;
}

export interface TastingSessionItem {
  id: string;
  name: string;
  description?: string;
  createdByParticipantId: string;
  ratings: TastingSessionRating[];
  createdAt: string;
}

export type TastingSessionStatus = 'lobby' | 'rating' | 'completed';

export interface TastingSessionRecord {
  id: string;
  name: string;
  restaurantName: string;
  inviteCode: string;
  createdByUserId: string;
  status: TastingSessionStatus;
  participants: TastingSessionParticipant[];
  items: TastingSessionItem[];
  createdAt: string;
  updatedAt: string;
}

export interface BillItemRecord {
  id: string;
  itemName: string;
  price: number;
  assignedToParticipantIds: string[];
  splitMode?: 'simple' | 'advanced';
  splitConfig?: BillItemSplitConfig[] | null;
}

export interface BillItemSplitConfig {
  participantId: string;
  type: 'percentage' | 'amount';
  value: number;
}

export interface BillParticipantRecord {
  id: string;
  name: string;
  userId?: string;
  amountOwed: number;
  customTipContribution?: number;
  paidStatus: 'pending' | 'paid';
}

export type BillExtrasSplitMode = 'proportional' | 'equal';
export type BillSplitMode = 'even' | 'itemized' | 'custom';

export interface BillRecord {
  id: string;
  title: string;
  restaurantName: string;
  createdByUserId: string;
  totalAmount?: number;
  items: BillItemRecord[];
  participants: BillParticipantRecord[];
  tax: number;
  tip: number;
  fees: number;
  splitMode?: BillSplitMode;
  extrasSplitMode: BillExtrasSplitMode;
  status: 'open' | 'settled';
  createdAt: string;
  updatedAt: string;
}

export interface FeatureStore {
  restaurants: RestaurantRecord[];
  visits: VisitRecord[];
  quickTracks: QuickTrackRecord[];
  photoDraft: PhotoProcessingDraft;
  restaurantLists: RestaurantListRecord[];
  notes: NoteRecord[];
  friends: FriendRecord[];
  profile: ProfileRecord;
  feedback: FeedbackRecord[];
  tastingSessions: TastingSessionRecord[];
  bills: BillRecord[];
}
