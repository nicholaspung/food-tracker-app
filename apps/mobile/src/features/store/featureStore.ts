import type {
  ContentReportReasonCode,
  FeedbackRecord,
  NoteRecord,
  RestaurantListCreatorGuideUsageProofRecord,
  RestaurantListItemRecord,
  RestaurantListRecord,
  VisitRecord,
} from '../models';
import type { PaginatedResult, PaginationInput } from './sharedTypes';

export type {
  BillListPage,
  BillListPageSummary,
  BillListSummary,
  CreateBillInput,
  ListBillSummariesPageInput,
  UpdateBillInput,
} from './billTypes';
export type { PaginatedResult } from './sharedTypes';

export interface CreateVisitInput {
  restaurantId?: string;
  restaurantName: string;
  sourceListItemId?: string;
  items: {
    name: string;
    rating: number;
    menuItemId?: string;
    suggestionSource?: VisitItemSuggestionSourceInput;
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

export interface VisitItemSuggestionSourceInput {
  type: 'groupMenuSuggestion';
  sourceMenuItemId: string;
  sourceRestaurantId?: string;
  restaurantGroupId?: string;
  normalizedItemName?: string;
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

export interface AllLocationsHistoryAnchor {
  id: string;
  name: string;
  location?: string;
  city?: string;
  cuisineType?: string;
}

export interface AllLocationsHistoryRestaurantRecord {
  restaurantId: string;
  restaurantName: string;
  restaurantLocation?: string;
  restaurantCity?: string;
  visitCount: number;
  latestVisitedAt?: string;
}

export interface AllLocationsHistoryItemRestaurantRecord {
  restaurantId: string;
  restaurantName: string;
  restaurantLocation?: string;
  orderCount: number;
}

export interface AllLocationsHistoryItemRecord {
  normalizedItemName: string;
  displayName: string;
  orderCount: number;
  averageRating: number;
  latestRating: number;
  latestVisitedAt: string;
  latestRestaurantId: string;
  latestRestaurantName: string;
  latestRestaurantLocation?: string;
  restaurants: AllLocationsHistoryItemRestaurantRecord[];
}

export interface AllLocationsHistoryRecord {
  anchorRestaurant: AllLocationsHistoryAnchor;
  normalizedName: string;
  locationCount: number;
  visitCount: number;
  itemCount: number;
  latestVisitedAt?: string;
  restaurants: AllLocationsHistoryRestaurantRecord[];
  items: AllLocationsHistoryItemRecord[];
}

export interface ConvertVisitItemToFoodProductInput {
  itemId: string;
}

export interface ConvertVisitItemToFoodProductResult {
  foodProductId: string;
  sourceVisitId: string;
  deletedSourceVisit: boolean;
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
  status: 'open' | 'under_review' | 'escalated';
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
  alreadyAdded: boolean;
}

export interface RestaurantListVisitedRestaurantCandidate {
  id: string;
  name: string;
  location?: string;
  cuisineType?: string;
  visibility?: 'private' | 'friends' | 'public';
  itemCount: number;
  latestVisitDate?: string;
  alreadyInList: boolean;
  existingNote?: string;
  linkedItemCount: number;
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
  foodItemId?: string;
  menuItemId?: string;
  note?: string;
  sourceListId?: string;
  sourceListItemId?: string;
  sourceUserId?: string;
}

export interface RemoveRestaurantFoodItemBookmarkFromListInput {
  listId: string;
  restaurantId: string;
  foodItemId?: string;
  menuItemId?: string;
}

export interface SaveRestaurantToDefaultListInput {
  restaurantId: string;
  note?: string;
}

export interface RemoveRestaurantListSourceRatingInput {
  listId: string;
  listItemId: string;
  foodItemId: string;
}

export interface OrganizeRestaurantListItemRepresentationInput {
  foodItemId: string;
  listItemId: string;
}

export interface OrganizeRestaurantListItemInput {
  currentListId: string;
  destinationListIds: string[];
  representations: OrganizeRestaurantListItemRepresentationInput[];
  restaurantId: string;
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
  page?: number;
  pageSize?: number;
  totalItems?: number;
  totalPages?: number;
  hasNextPage?: boolean;
  bookmarkState: RestaurantListDetailBookmarkState;
  photoPreviews: RestaurantListDetailPhotoPreviewRecord[];
  viewerLists: RestaurantListRecord[];
  creatorGuideUsageProof?: RestaurantListCreatorGuideUsageProofRecord;
}

export interface RestaurantListCandidateRestaurantsResult extends PaginatedResult<RestaurantListVisitedRestaurantCandidate> {
  list: RestaurantListRecord | null;
}

export type RestaurantListVisitedRestaurantFoodItemsPage =
  PaginatedResult<RestaurantListVisitedRestaurantFoodItem>;

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

export interface ListRestaurantSuggestionsInput {
  limit?: number;
  search?: string;
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
  capturedAt?: string;
}

export interface MenuItemRecord {
  id: string;
  restaurant: string;
  name: string;
  description?: string;
  createdBy?: string;
  visibility?: 'private' | 'friends' | 'public';
  approvalStatus?: 'unreviewed' | 'approved' | 'rejected';
  groupSuitable?: boolean;
  isFromOCR?: boolean;
  userEatenCount?: number;
  friendEatenCount?: number;
  created?: string;
  updated?: string;
}

export interface GroupMenuSuggestionSourceRecord {
  restaurantId: string;
  restaurantName: string;
  restaurantLocation?: string;
  menuItemIds: string[];
  menuItemCount: number;
  latestUpdatedAt?: string;
}

export interface GroupMenuSuggestionRecord {
  normalizedItemName: string;
  displayName: string;
  sourceRestaurantCount: number;
  sourceItemCount: number;
  latestSourceUpdatedAt?: string;
  ownOrderCount?: number;
  latestOwnOrderedAt?: string;
  sources: GroupMenuSuggestionSourceRecord[];
}

export interface GroupMenuSuggestionsRecord {
  restaurantId: string;
  restaurantGroupId?: string;
  suggestions: GroupMenuSuggestionRecord[];
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
  capturedAt?: string;
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
  joinDurationMinutes: number;
  invitedUserIds?: string[];
}

export interface JoinTastingSessionInput {
  inviteCode: string;
}

export interface ReopenTastingInviteWindowInput {
  joinDurationMinutes: number;
}

export interface SuggestTastingRestaurantInput {
  restaurantId?: string;
  restaurantName: string;
}

export interface SuggestTastingMenuItemInput {
  menuItemId?: string;
  name: string;
}

export interface SubmitTastingRatingsInput {
  restaurants: {
    restaurantSuggestionId: string;
    items: {
      itemId: string;
      rating: number;
      note?: string;
    }[];
  }[];
}
