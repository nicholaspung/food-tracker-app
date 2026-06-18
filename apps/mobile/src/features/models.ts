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
  menuItemId?: string;
  menuItemVisibility?: 'private' | 'friends' | 'public';
  name: string;
  rating: number;
  description?: string;
  notes?: string;
  recommendationSource?: RecommendationSourceRecord;
}

export interface RecommendationSourceRecord {
  kind: 'restaurant' | 'item';
  sourceUserId?: string;
  sourceUserName?: string;
}

export interface VisitRecord {
  id: string;
  restaurantId?: string;
  restaurantName: string;
  restaurantLocation?: string;
  restaurantCuisineType?: string;
  visitedAt: string;
  items: VisitItem[];
  source: 'visit' | 'food-product' | 'tasting-result';
  userId?: string;
  userName?: string;
  visibility?: 'friends' | 'private';
  moderationStatus?: ModerationContentStatus;
  recommendationSource?: RecommendationSourceRecord;
  createdAt: string;
  updatedAt: string;
}

export interface FoodProductRecord {
  id: string;
  restaurantName: string;
  itemCategory?: string;
  itemName: string;
  locationText?: string;
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
  userVisitCount?: number;
  friendCount?: number;
  hasPendingMenuReview?: boolean;
}

export interface RestaurantListRecord {
  id: string;
  name: string;
  description?: string;
  visibility: 'private' | 'friends';
  userId: string;
  ownerName?: string;
  isDefault?: boolean;
  shareEnabled?: boolean;
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
  restaurantId?: string;
  menuItemId?: string;
  visitedAt?: string;
  sourceUserId?: string;
  sourceUserName?: string;
  userFoodItemId?: string;
  userFoodItemRestaurantId?: string;
  userFoodItemName?: string;
  userFoodItemRating?: number;
  userFoodItemVisitedAt?: string;
}

export interface RestaurantListFriendMatchRecord {
  friendId: string;
  friendName: string;
  kind: 'restaurant' | 'menu_item';
  itemName?: string;
  rating?: number;
  savedAt?: string;
}

export interface RestaurantListItemRecord {
  id: string;
  listId: string;
  restaurantId: string;
  restaurantName: string;
  restaurantLocation?: string;
  restaurantCity?: string;
  restaurantCuisineType?: string;
  restaurantVisibility?: 'private' | 'friends' | 'public';
  latitude?: number;
  longitude?: number;
  sourceUserId?: string;
  sourceUserName?: string;
  position: number;
  bookmarkedItems: RestaurantListBookmarkedItemRecord[];
  friendOverlapCount?: number;
  friendMatches?: RestaurantListFriendMatchRecord[];
  note?: string;
  createdAt: string;
}

export interface SharedRestaurantListRecord {
  id: string;
  name: string;
  description?: string;
  ownerName?: string;
  restaurantCount?: number;
  menuItemCount?: number;
  updatedAt: string;
}

export interface SharedRestaurantListPhotoPreviewRecord {
  id: string;
  food_item?: string;
  photo: string;
  collectionId?: string;
  collectionName?: string;
  created: string;
}

export interface SharedRestaurantListDetailRecord {
  list: SharedRestaurantListRecord | null;
  items: RestaurantListItemRecord[];
  page?: number;
  pageSize?: number;
  totalItems?: number;
  totalPages?: number;
  hasNextPage?: boolean;
  photoPreviews: SharedRestaurantListPhotoPreviewRecord[];
  bookmarkState: {
    savedListIdsByBookmarkLookupId: Record<string, string[]>;
  };
  viewerLists: RestaurantListRecord[];
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
  usedAt?: string;
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

export type TastingSessionStatus = 'lobby' | 'planning' | 'tasting' | 'completed' | 'adding_items' | 'rating';
export type TastingSuggestionStatus = 'pending' | 'approved' | 'rejected';

export interface TastingParticipantRecord {
  id: string;
  userId: string;
  name: string;
  role: 'leader' | 'participant';
  joinedAt: string;
  submittedAt?: string;
}

export interface TastingInviteRecord {
  id: string;
  invitedUserId: string;
  invitedUserName: string;
  status: 'pending' | 'accepted' | 'dismissed' | 'revoked';
  createdAt: string;
}

export interface TastingItemRatingRecord {
  id: string;
  participantId: string;
  userId: string;
  rating: number;
  note?: string;
  generatedVisitId?: string;
  generatedFoodItemId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TastingMenuItemRecord {
  id: string;
  restaurantSuggestionId: string;
  menuItemId: string;
  name: string;
  suggestedByParticipantId: string;
  status: TastingSuggestionStatus;
  ratings: TastingItemRatingRecord[];
  createdAt: string;
}

export interface TastingRestaurantRecord {
  id: string;
  restaurantId: string;
  restaurantName: string;
  suggestedByParticipantId: string;
  status: TastingSuggestionStatus;
  items: TastingMenuItemRecord[];
  createdAt: string;
}

export interface TastingSessionRecord {
  id: string;
  name: string;
  leaderUserId: string;
  createdByUserId?: string;
  restaurantName?: string;
  status: TastingSessionStatus;
  inviteCode?: string;
  joinExpiresAt: string;
  joinedCount: number;
  maxParticipants: number;
  maxRestaurants: number;
  maxApprovedItems: number;
  participants: TastingParticipantRecord[];
  invites: TastingInviteRecord[];
  restaurants: TastingRestaurantRecord[];
  items?: unknown[];
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
  friendshipId?: string;
  amountOwed: number;
  customTipContribution?: number;
  paidStatus: 'pending' | 'paid';
  paymentReminderAvailable?: boolean;
  paymentReminderAvailableAt?: string | null;
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
  foodProducts: FoodProductRecord[];
  photoDraft: PhotoProcessingDraft;
  restaurantLists: RestaurantListRecord[];
  notes: NoteRecord[];
  friends: FriendRecord[];
  feedback: FeedbackRecord[];
  bills: BillRecord[];
}
