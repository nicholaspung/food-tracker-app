import type {
  BillItemRecord,
  BillParticipantRecord,
  BillRecord,
  ContentReportReasonCode,
  FeedbackRecord,
  NoteRecord,
  RestaurantListItemRecord,
  RestaurantListRecord,
  VisitRecord,
} from '../models';

export interface CreateVisitInput {
  restaurantId?: string;
  restaurantName: string;
  items: {
    name: string;
    rating: number;
    description?: string;
    notes?: string;
    photos?: VisitPhotoUploadInput[];
  }[];
  visitedAt?: string;
  visitedOn?: string;
  visibility?: 'friends' | 'private';
  source?: VisitRecord['source'];
  sourceNoteId?: string;
}

export interface UpdateVisitInput {
  restaurantId?: string;
  restaurantName?: string;
  items?: {
    id: string;
    name: string;
    rating: number;
    description?: string;
    notes?: string;
    newPhotos?: VisitPhotoUploadInput[];
    deletePhotoIds?: string[];
  }[];
  visitedAt?: string;
  visitedOn?: string;
  visibility?: 'friends' | 'private';
}

export interface MoveVisitItemInput {
  itemId: string;
  destinationVisitId: string;
}

export interface MoveVisitItemResult {
  itemId: string;
  destinationVisitId: string;
}

export interface CreateFoodProductInput {
  itemName: string;
  locationText?: string;
  rating: number;
  itemCategory?: string;
  notes?: string;
  visibility?: 'friends' | 'private';
  itemDate?: string;
  photo?: VisitPhotoUploadInput;
  sourceNoteId?: string;
}

export interface UpdateFoodProductInput {
  itemName?: string;
  locationText?: string;
  rating?: number;
  itemCategory?: string | null;
  notes?: string;
  visibility?: 'friends' | 'private';
  itemDate?: string;
  newPhoto?: VisitPhotoUploadInput;
  deletePhotoIds?: string[];
}

export interface CreateRestaurantListInput {
  name: string;
  description?: string;
  visibility?: 'private' | 'friends';
}

export interface UpdateRestaurantListInput {
  name?: string;
  description?: string;
  visibility?: 'private' | 'friends';
}

export interface ReportContentInput {
  contentType: 'visit' | 'food-product';
  recordId: string;
  reasonCode: ContentReportReasonCode;
  notes?: string;
}

export interface ReportContentResult {
  caseId: string;
  reportId: string;
  status: 'under_review';
}

export interface RestaurantListItemLinkRecord {
  id: string;
  listId: string;
  restaurantId: string;
  foodItemId?: string;
  userFoodItemId?: string;
  sourceUserId?: string;
  recommendedItemIds?: string[];
}

export interface RestaurantListVisitedRestaurantFoodItemPhotoPreview {
  id: string;
  photo: string;
}

export interface RestaurantListVisitedRestaurantFoodItem {
  id: string;
  name: string;
  rating: number;
  notes?: string;
  visitedAt: string;
  photoPreview?: RestaurantListVisitedRestaurantFoodItemPhotoPreview;
  photoCount?: number;
}

export interface RestaurantListVisitedRestaurantCandidate {
  id: string;
  name: string;
  location?: string;
  cuisineType?: string;
  itemCount: number;
  visitDates: string[];
  foodItems: RestaurantListVisitedRestaurantFoodItem[];
  alreadyInList: boolean;
  existingNote?: string;
  linkedFoodItemIds: string[];
}

export interface AddRestaurantVisitRatingsToListInput {
  listId: string;
  restaurantId: string;
  foodItemIds?: string[];
  note?: string;
}

export interface SaveRestaurantFoodItemToListInput {
  listId: string;
  restaurantId: string;
  foodItemId: string;
  note?: string;
  sourceUserId?: string;
}

export interface LinkVisitToListBookmarkInput {
  listItemId: string;
  userFoodItemId: string;
}

export interface RemoveRestaurantListSourceRatingInput {
  listId: string;
  listItemId: string;
  foodItemId: string;
}

export interface MoveRestaurantListRestaurantInput {
  listId: string;
  restaurantId: string;
  direction: 'up' | 'down';
}

export interface RestaurantListCountSummary {
  restaurantCount: number;
  menuItemCount: number;
}

export interface NoteCountSummary {
  allCount: number;
  draftCount: number;
  usedCount: number;
}

export interface NotePhotoPreviewSummary {
  id: string;
  photo: string;
  count: number;
}

export interface NoteOverviewItemRecord extends NoteRecord {
  photoPreview?: NotePhotoPreviewSummary;
}

export interface FriendsCountSummary {
  friendsCount: number;
  requestsCount: number;
  sentCount: number;
}

export interface FeedbackCountSummary {
  allCount: number;
  activeCount: number;
}

export interface BillListSummary {
  id: string;
  title: string;
  status: BillRecord['status'];
  participantCount: number;
  pendingOtherParticipantCount: number;
  youOwe: number;
  youAreOwed: number;
  isCreator: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RestaurantListDetailBookmarkState {
  savedListIdsByBookmarkLookupId: Record<string, string[]>;
}

export interface RestaurantListDetailPhotoPreviewRecord extends VisitPhotoRecord {
  ownerName?: string;
}

export interface RestaurantListDetailPage extends PaginatedResult<RestaurantListItemRecord> {
  list: RestaurantListRecord | null;
  bookmarkState: RestaurantListDetailBookmarkState;
  photoPreviews: RestaurantListDetailPhotoPreviewRecord[];
}

export interface RestaurantListDetailRecord {
  list: RestaurantListRecord | null;
  items: RestaurantListItemRecord[];
  bookmarkState: RestaurantListDetailBookmarkState;
  photoPreviews: RestaurantListDetailPhotoPreviewRecord[];
  viewerLists: RestaurantListRecord[];
}

export interface RestaurantListCandidateRestaurantsResult {
  list: RestaurantListRecord | null;
  items: RestaurantListVisitedRestaurantCandidate[];
}

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
}

export interface NoteOverviewPage {
  items: NoteOverviewItemRecord[];
  summary?: NoteCountSummary;
  page: number;
  pageSize: number;
  totalItems?: number;
  totalPages?: number;
  hasNextPage: boolean;
}

export interface NoteDetailRecord {
  note: NoteRecord;
  photos: NotePhotoRecord[];
}

interface PaginationInput {
  page?: number;
  pageSize?: number;
  signal?: AbortSignal;
}

export interface ListNotesPageInput extends PaginationInput {
  status?: 'all' | NoteRecord['status'];
  search?: string;
}

export interface ListVisitsPageInput extends PaginationInput {
  scope?: 'all' | 'mine' | 'friends';
  search?: string;
}

export interface ListFoodProductsPageInput extends PaginationInput {
  scope?: 'all' | 'mine' | 'friends';
  search?: string;
}

export interface ListRestaurantListsPageInput extends PaginationInput {
  scope?: 'my' | 'friends';
  search?: string;
}

export interface ListRestaurantListVisitedRestaurantsPageInput extends PaginationInput {
  search?: string;
}

export interface SearchRestaurantsPageInput extends PaginationInput {
  search: string;
}

export interface ListRecentRestaurantsInput {
  limit?: number;
  signal?: AbortSignal;
}

export interface RestaurantListRestaurantNoteRecord {
  restaurantId: string;
  note: string;
}

export interface ListFriendsPageInput extends PaginationInput {
  section?: 'friends' | 'requests' | 'sent';
  search?: string;
  userIds?: string[];
}

export interface ListFeedbackPageInput extends PaginationInput {
  status?: FeedbackStatusFilter;
}

export interface ListFeedbackMessagesPageInput extends PaginationInput {
  order?: 'asc' | 'desc';
}

export interface NotePhotoRecord {
  id: string;
  note: string;
  photo: string;
  created: string;
}

export interface MenuItemRecord {
  id: string;
  restaurant: string;
  name: string;
  description?: string;
  createdBy?: string;
  visibility?: 'private' | 'friends' | 'public';
  isFromOCR?: boolean;
  created?: string;
  updated?: string;
}

export interface AcceptedFriendshipRecord {
  user: string;
  friend: string;
}

export interface VisitPhotoRecord {
  id: string;
  food_item?: string;
  user?: string;
  photo: string;
  collectionId?: string;
  collectionName?: string;
  created: string;
  expand?: {
    user?: {
      id?: string;
      name?: string;
      email?: string;
    };
  };
}

export interface NotePhotoUploadInput {
  uri: string;
  name: string;
  mimeType: string;
}

export interface VisitPhotoUploadInput {
  uri: string;
  name: string;
  mimeType: string;
}

export interface CreateNoteInput {
  title: string;
  content: string;
  locationText?: string;
  rating?: number;
  photos?: NotePhotoUploadInput[];
}

export interface UpdateNoteInput {
  title?: string;
  content?: string;
  locationText?: string;
  rating?: number;
  newPhotos?: NotePhotoUploadInput[];
  deletePhotoIds?: string[];
}

export interface MarkNoteUsedInput {
  noteId: string;
  usedInVisitId?: string;
  usedInFoodItemId?: string;
  usedAt?: string;
}

export interface InviteFriendInput {
  code: string;
}

export interface UpdateProfileInput {
  displayName?: string;
  bio?: string;
  location?: string;
  favoriteCuisine?: string;
  receiveMarketingEmails?: boolean;
}

export interface CreateFeedbackInput {
  title: string;
  description: string;
}

export type FeedbackStatusFilter = 'all' | 'active' | FeedbackRecord['status'];

export interface SendFeedbackMessageInput {
  feedbackId: string;
  message: string;
}

export interface CreateTastingSessionInput {
  name: string;
  restaurantName: string;
}

export interface JoinTastingSessionInput {
  inviteCode: string;
}

export interface AddTastingItemInput {
  name: string;
  description?: string;
}

export interface SubmitTastingRatingInput {
  rating: number;
  note?: string;
}

export interface CreateBillInput {
  title: string;
  restaurantName: string;
  createdByUserId: string;
  items: BillItemRecord[];
  participants: BillParticipantRecord[];
  totalAmount?: number;
  tax: number;
  tip: number;
  fees: number;
  extrasSplitMode: BillRecord['extrasSplitMode'];
}

export interface UpdateBillInput {
  title?: string;
  restaurantName?: string;
  items?: BillItemRecord[];
  participants?: BillParticipantRecord[];
  totalAmount?: number;
  tax?: number;
  tip?: number;
  fees?: number;
  extrasSplitMode?: BillRecord['extrasSplitMode'];
  status?: BillRecord['status'];
}

export {
  createEntityId,
} from './featureStoreRuntime';
export { getProfile, updateProfile } from './profileApiStore';
export {
  addTastingItem,
  createTastingSession,
  deleteTastingItem,
  getTastingSessionById,
  joinTastingSession,
  listTastingSessions,
  regenerateTastingInviteCode,
  setTastingSessionStatus,
  submitTastingRating,
} from './tastingSessionsApiStore';
export {
  deleteAccount,
  generateInviteCodes,
  listInviteCodes,
  lockInviteCode,
  reportContent,
} from './accountStore';
export {
  createFoodProduct,
  deleteFoodProduct,
  getFoodProductById,
  listFoodProductCategorySuggestions,
  listFoodProductPhotos,
  updateFoodProduct,
} from './foodProductsStore';
export {
  listMenuItemsForRestaurant,
  listRecentRestaurants,
  searchRestaurantsPage,
  upsertRestaurantRecord,
} from './restaurantsStore';
// eslint-disable-next-line import/no-unresolved
export {
  createVisit,
  deleteVisit,
  getVisitById,
  listVisitsPage,
  listVisitItemPhotos,
  moveVisitItem,
  updateVisit,
} from './visitsStore';

export {
  addRestaurantVisitRatingsToList,
  createDefaultRestaurantList,
  createRestaurantList,
  deleteRestaurantList,
  getRestaurantListCandidateRestaurants,
  listRestaurantListCandidateFoodItemPhotos,
  getRestaurantListDetail,
  getRestaurantListById,
  linkVisitToListBookmark,
  listRestaurantListsPage,
  moveRestaurantListRestaurant,
  removeRestaurantListSourceRating,
  removeRestaurantListUserRating,
  saveRestaurantFoodItemToList,
  updateRestaurantList,
} from './restaurantListsStore';

export {
  createNote,
  deleteNote,
  getNoteDetail,
  listNotePhotosForNote,
  listNotesOverviewPage,
  markNoteUsed,
  updateNote,
} from './notesStore';

export {
  createFriendSuggestionAcceptance,
  getFriendsCountSummary,
  inviteFriend,
  listFriendsPage,
  markFriendInviteAccepted,
  removeFriend,
} from './friendsStore';

export {
  createFeedback,
  getFeedbackCountSummary,
  getFeedbackThreadDetail,
  listFeedbackMessagesPage,
  listFeedbackPage,
  markFeedbackAsRead,
  sendFeedbackMessage,
} from './feedbackStore';

export type { FeedbackThreadDetailResult } from './feedbackStore';

export {
  createBill,
  deleteBill,
  getBillById,
  listBillSummaries,
  markBillParticipantPaid,
  updateBill,
} from './billsStore';
