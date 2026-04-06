import AsyncStorage from '@react-native-async-storage/async-storage';
import { ClientResponseError } from 'pocketbase';

import { pb } from '../../lib/pocketbase';
import { resolveEffectiveAdminFlag } from '../../lib/rolePreview';
import { trackObservabilityEvent } from '../../observability';
import { createLocalDomainStore } from './localDomainStore';
import {
  getCollectionCount,
  listCollectionPage,
  listCollectionRecords,
  sendApiRequest,
  type CollectionPageResult,
} from './pocketbaseGateway';
import type {
  BillItemRecord,
  BillParticipantRecord,
  BillRecord,
  ContentReportReasonCode,
  FeedbackMessageRecord,
  FeatureStore,
  FeedbackRecord,
  FriendRecord,
  FriendStatus,
  ModerationContentStatus,
  NoteRecord,
  PhotoDraftAsset,
  PhotoProcessingDraft,
  ProfileRecord,
  QuickTrackRecord,
  RestaurantListBookmarkedItemRecord,
  RestaurantListItemRecord,
  RestaurantListRecord,
  RestaurantRecord,
  TastingSessionRecord,
  TastingSessionStatus,
  VisitItem,
  VisitRecord,
} from '../models';

const FEATURE_STORE_KEY = 'food_tracker_mobile_phase4_store_v1';

let cachedStore: FeatureStore | null = null;

interface ParsedFeatureStore {
  restaurants?: RestaurantRecord[];
  visits?: VisitRecord[];
  quickTracks?: QuickTrackRecord[];
  photoDraft?: PhotoProcessingDraft;
  restaurantLists?: RestaurantListRecord[];
  notes?: NoteRecord[];
  friends?: (Partial<FriendRecord> & { status?: string })[];
  profile?: Partial<ProfileRecord>;
  feedback?: FeedbackRecord[];
  tastingSessions?: TastingSessionRecord[];
  bills?: BillRecord[];
}

export interface CreateVisitInput {
  restaurantName: string;
  items: {
    name: string;
    rating: number;
    description?: string;
    notes?: string;
    photos?: VisitPhotoUploadInput[];
  }[];
  visitedAt?: string;
  visibility?: 'friends' | 'private';
  source?: VisitRecord['source'];
}

export interface UpdateVisitInput {
  restaurantName?: string;
  items?: VisitItem[];
  visitedAt?: string;
  visibility?: 'friends' | 'private';
}

export interface CreateQuickTrackInput {
  itemName: string;
  rating: number;
  itemCategory?: 'convenience_store' | 'packaged_food' | 'homemade' | 'recipe' | 'other';
  notes?: string;
  visibility?: 'friends' | 'private';
  itemDate?: string;
  photo?: VisitPhotoUploadInput;
  sourceNoteId?: string;
}

export interface UpdateQuickTrackInput {
  itemName?: string;
  rating?: number;
  itemCategory?: 'convenience_store' | 'packaged_food' | 'homemade' | 'recipe' | 'other' | null;
  notes?: string;
  visibility?: 'friends' | 'private';
  itemDate?: string;
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

export interface ListRestaurantListsInput {
  scope?: 'my' | 'friends';
}

export interface ReportContentInput {
  contentType: 'visit' | 'quick-track';
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

export interface RestaurantVisitStatsSummary {
  restaurantId: string;
  userVisitCount: number;
  friendCount: number;
}

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
}

interface PaginationInput {
  page?: number;
  pageSize?: number;
}

export interface ListNotesPageInput extends PaginationInput {
  status?: 'all' | NoteRecord['status'];
}

export interface ListVisitsPageInput extends PaginationInput {
  scope?: 'all' | 'mine' | 'friends';
  search?: string;
}

export interface ListQuickTracksPageInput extends PaginationInput {
  scope?: 'all' | 'mine' | 'friends';
  search?: string;
}

export interface ListRestaurantListsPageInput extends PaginationInput {
  scope?: 'my' | 'friends';
  search?: string;
}

export interface SearchRestaurantsPageInput extends PaginationInput {
  search: string;
}

export interface ListRecentRestaurantsInput {
  limit?: number;
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
  rating?: number;
  photos?: NotePhotoUploadInput[];
}

export interface UpdateNoteInput {
  title?: string;
  content?: string;
  rating?: number;
  newPhotos?: NotePhotoUploadInput[];
  deletePhotoIds?: string[];
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
  createdByUserId: string;
  createdByName: string;
}

export interface JoinTastingSessionInput {
  inviteCode: string;
  userId: string;
  participantName: string;
}

export interface AddTastingItemInput {
  name: string;
  description?: string;
  createdByParticipantId: string;
}

export interface SubmitTastingRatingInput {
  participantId: string;
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

function nowIso(): string {
  return new Date().toISOString();
}

type MutationPropertyValue = string | number | boolean | null | undefined;
type MutationProperties = Record<string, MutationPropertyValue>;

function compactMutationProperties(
  properties: MutationProperties | undefined,
): Record<string, string | number | boolean | null> {
  if (!properties) {
    return {};
  }

  const compacted: Record<string, string | number | boolean | null> = {};
  Object.entries(properties).forEach(([key, value]) => {
    if (value !== undefined) {
      compacted[key] = value;
    }
  });
  return compacted;
}

function normalizeMutationError(error: unknown): { errorName: string; errorMessage: string } {
  if (error instanceof Error) {
    return {
      errorName: error.name || 'Error',
      errorMessage: error.message || 'Unknown error',
    };
  }

  return {
    errorName: 'UnknownError',
    errorMessage: String(error),
  };
}

async function trackFeatureMutation<T>(
  action: string,
  operation: () => Promise<T>,
  properties?: MutationProperties,
): Promise<T> {
  const startedAtMs = Date.now();
  const baseProperties = {
    action,
    ...compactMutationProperties(properties),
  };

  trackObservabilityEvent('FEATURE_MUTATION_STARTED', baseProperties);

  try {
    const result = await operation();
    trackObservabilityEvent('FEATURE_MUTATION_SUCCEEDED', {
      ...baseProperties,
      durationMs: Date.now() - startedAtMs,
    });
    return result;
  } catch (error) {
    const normalizedError = normalizeMutationError(error);
    trackObservabilityEvent('FEATURE_MUTATION_FAILED', {
      ...baseProperties,
      durationMs: Date.now() - startedAtMs,
      ...normalizedError,
    });
    throw error;
  }
}

function createId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

function createInviteCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let index = 0; index < 6; index += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

function cloneStore(store: FeatureStore): FeatureStore {
  return JSON.parse(JSON.stringify(store)) as FeatureStore;
}

function normalizeFriendStatus(status: string | undefined): FriendStatus {
  if (status === 'friend') {
    return 'friend';
  }

  if (status === 'pending_received') {
    return 'pending_received';
  }

  if (status === 'pending_sent' || status === 'invited') {
    return 'pending_sent';
  }

  return 'friend';
}

function normalizeFriendRecord(friend: Partial<FriendRecord> & { status?: string }): FriendRecord {
  const id = typeof friend.id === 'string' && friend.id.length > 0 ? friend.id : createId('friend');
  const userId =
    typeof friend.userId === 'string' && friend.userId.length > 0
      ? friend.userId
      : id;
  const fallbackEmail = 'unknown@invite.local';

  return {
    id,
    userId,
    name: typeof friend.name === 'string' && friend.name.trim() ? friend.name.trim() : 'Unknown Friend',
    email:
      typeof friend.email === 'string' && friend.email.trim()
        ? friend.email.trim().toLowerCase()
        : fallbackEmail,
    status: normalizeFriendStatus(friend.status),
    createdAt:
      typeof friend.createdAt === 'string' && friend.createdAt.trim().length > 0
        ? friend.createdAt
        : nowIso(),
  };
}

function seedStore(): FeatureStore {
  return {
    restaurants: [
      { id: createId('restaurant'), name: 'Golden Lantern', city: 'San Francisco' },
      { id: createId('restaurant'), name: 'Bluebird Tacos', city: 'Oakland' },
      { id: createId('restaurant'), name: 'Riverfront Ramen', city: 'San Jose' },
    ],
    visits: [],
    quickTracks: [],
    photoDraft: {
      assets: [],
      updatedAt: nowIso(),
    },
    restaurantLists: [],
    notes: [],
    friends: [],
    profile: {
      displayName: '',
      bio: '',
      location: '',
      favoriteCuisine: '',
      receiveMarketingEmails: false,
    },
    feedback: [],
    tastingSessions: [],
    bills: [],
  };
}

function mergeStore(rawStore: ParsedFeatureStore | null): FeatureStore {
  const defaultStore = seedStore();
  if (!rawStore) {
    return defaultStore;
  }

  return {
    restaurants: rawStore.restaurants ?? defaultStore.restaurants,
    visits: rawStore.visits ?? [],
    quickTracks: rawStore.quickTracks ?? [],
    photoDraft: rawStore.photoDraft ?? defaultStore.photoDraft,
    restaurantLists: rawStore.restaurantLists ?? [],
    notes: rawStore.notes ?? [],
    friends: (rawStore.friends ?? defaultStore.friends).map((friend) => normalizeFriendRecord(friend)),
    profile: {
      ...defaultStore.profile,
      ...(rawStore.profile ?? {}),
    },
    feedback: rawStore.feedback ?? [],
    tastingSessions: rawStore.tastingSessions ?? [],
    bills: rawStore.bills ?? [],
  };
}

async function saveStore(store: FeatureStore): Promise<void> {
  cachedStore = store;
  await AsyncStorage.setItem(FEATURE_STORE_KEY, JSON.stringify(store));
}

export async function getStore(): Promise<FeatureStore> {
  if (cachedStore) {
    return cachedStore;
  }

  const rawStore = await AsyncStorage.getItem(FEATURE_STORE_KEY);
  if (!rawStore) {
    const seededStore = seedStore();
    await saveStore(seededStore);
    return seededStore;
  }

  try {
    const parsedStore = JSON.parse(rawStore) as ParsedFeatureStore;
    const mergedStore = mergeStore(parsedStore);
    cachedStore = mergedStore;
    return mergedStore;
  } catch {
    const fallbackStore = seedStore();
    await saveStore(fallbackStore);
    return fallbackStore;
  }
}

async function mutateStore<T>(mutator: (store: FeatureStore) => T): Promise<T> {
  const currentStore = await getStore();
  const mutableStore = cloneStore(currentStore);
  const result = mutator(mutableStore);
  await saveStore(mutableStore);
  return result;
}

function upsertRestaurant(store: FeatureStore, restaurantName: string): RestaurantRecord {
  const normalizedName = restaurantName.trim().toLowerCase();
  const existingRestaurant = store.restaurants.find(
    (restaurant) => restaurant.name.trim().toLowerCase() === normalizedName,
  );

  if (existingRestaurant) {
    return existingRestaurant;
  }

  const restaurant: RestaurantRecord = {
    id: createId('restaurant'),
    name: restaurantName.trim(),
  };
  store.restaurants.unshift(restaurant);
  return restaurant;
}

function mapAndSortByDateDescending<T extends { updatedAt: string }>(records: T[]): T[] {
  return [...records].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

const localDomainStore = createLocalDomainStore({
  getStore,
  mutateStore,
  nowIso,
  createId,
  createInviteCode,
  upsertRestaurant,
  mapAndSortByDateDescending,
});

interface FriendshipUser {
  id: string;
  name?: string;
  email?: string;
}

interface FriendshipRecord {
  id: string;
  user: string;
  friend: string;
  status: 'pending' | 'accepted' | 'blocked';
  created: string;
  updated: string;
  expand?: {
    user?: FriendshipUser;
    friend?: FriendshipUser;
  };
}

interface FriendCodeLookupResponse {
  found: boolean;
  user?: {
    id: string;
    displayName?: string;
  };
}

interface FriendListApiItem {
  id: string;
  userId: string;
  displayName?: string;
  status: FriendStatus;
  createdAt: string;
}

interface FriendListApiResponse {
  items: FriendListApiItem[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
}

interface CollectionUserExpand {
  id: string;
  name?: string;
  email?: string;
}

interface RestaurantCollectionRecord {
  id: string;
  name: string;
  location?: string;
  cuisineType?: string;
  visibility?: 'private' | 'friends' | 'public';
  latitude?: number;
  longitude?: number;
  placeId?: string;
  isGooglePlace?: boolean;
  created: string;
  updated: string;
}

interface RecentRestaurantApiRecord {
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

interface VisitCollectionRecord {
  id: string;
  restaurant: string;
  user: string;
  visitDate: string;
  visibility?: 'friends' | 'private';
  moderationStatus?: ModerationContentStatus;
  notes?: string;
  created: string;
  updated: string;
  expand?: {
    restaurant?: RestaurantCollectionRecord;
    user?: CollectionUserExpand;
  };
}

interface FoodItemCollectionRecord {
  id: string;
  name: string;
  rating: number;
  description?: string;
  itemCategory?: 'convenience_store' | 'packaged_food' | 'homemade' | 'recipe' | 'other' | 'restaurant';
  notes?: string;
  visit?: string;
  user: string;
  isQuickTrack?: boolean;
  visibility?: 'friends' | 'private';
  moderationStatus?: ModerationContentStatus;
  location_text?: string;
  latitude?: number;
  longitude?: number;
  itemDate?: string;
  created: string;
  updated: string;
  expand?: {
    user?: CollectionUserExpand;
    visit?: VisitCollectionRecord;
  };
}

interface RestaurantListCollectionRecord {
  id: string;
  name: string;
  description?: string;
  visibility?: 'private' | 'friends' | 'public';
  user: string;
  coverImage?: string;
  isCollaborative?: boolean;
  isDefault?: boolean;
  created: string;
  updated: string;
  expand?: {
    user?: CollectionUserExpand;
  };
}

interface ListItemCollectionRecord {
  id: string;
  list: string;
  restaurant: string;
  addedBy: string;
  sourceUser?: string;
  recommendedItems?: string[];
  foodItem?: string;
  userFoodItem?: string;
  position: number;
  note?: string;
  created: string;
  expand?: {
    restaurant?: RestaurantCollectionRecord;
    sourceUser?: CollectionUserExpand;
    foodItem?: FoodItemCollectionRecord;
    userFoodItem?: FoodItemCollectionRecord;
    recommendedItems?: FoodItemCollectionRecord[];
  };
}

interface NoteCollectionRecord {
  id: string;
  user: string;
  content: string;
  restaurant?: string;
  location_text?: string;
  latitude?: number;
  longitude?: number;
  status?: 'draft' | 'used';
  usedInVisit?: string;
  usedInFoodItem?: string;
  created: string;
  updated: string;
  expand?: {
    restaurant?: RestaurantCollectionRecord;
  };
}

interface FeedbackCollectionUserExpand {
  id: string;
  name?: string;
  email?: string;
}

interface FeedbackCollectionRecord {
  id: string;
  user: string;
  assigned_admin?: string;
  assigned_at?: string;
  admin_reply_deadline_at?: string;
  title: string;
  description: string;
  status: string;
  admin_unread_count?: number;
  user_unread_count?: number;
  last_message_at?: string;
  created: string;
  updated: string;
  expand?: {
    user?: FeedbackCollectionUserExpand;
  };
}

interface FeedbackMessageCollectionRecord {
  id: string;
  feedback: string;
  user: string;
  message: string;
  is_admin_message?: boolean;
  created: string;
  expand?: {
    user?: FeedbackCollectionUserExpand;
  };
}

interface BillParticipantCollectionUserExpand {
  id: string;
  name?: string;
  email?: string;
}

interface BillCollectionRecord {
  id: string;
  creator_user: string;
  bill_name: string;
  total_amount: number;
  tax?: number;
  tip?: number;
  fees?: number;
  split_mode: 'even' | 'itemized' | 'custom';
  extras_split_mode: BillRecord['extrasSplitMode'];
  status: 'active' | 'settled' | 'cancelled';
  created: string;
  updated: string;
}

interface BillParticipantCollectionRecord {
  id: string;
  bill: string;
  user?: string | null;
  participant_name?: string;
  amount_owed: number;
  paid_status: BillParticipantRecord['paidStatus'];
  paid_date?: string | null;
  payment_method?: string | null;
  custom_tip_contribution?: number | null;
  created: string;
  updated: string;
  expand?: {
    user?: BillParticipantCollectionUserExpand;
  };
}

interface BillItemCollectionRecord {
  id: string;
  bill: string;
  item_name: string;
  price: number;
  assigned_to: string[];
  split_mode?: 'simple' | 'advanced';
  split_config?: {
    participant_id: string;
    type: 'percentage' | 'amount';
    value: number;
  }[] | null;
  created: string;
}

interface BillListSummaryApiResponseItem {
  id: string;
  title: string;
  status: string;
  participantCount?: number;
  pendingOtherParticipantCount?: number;
  youOwe?: number;
  youAreOwed?: number;
  isCreator?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

const RESTAURANT_LIST_FIELDS =
  'id,name,location,cuisineType,visibility,latitude,longitude,placeId,isGooglePlace,created,updated';
const VISIT_ITEM_LIST_FIELDS = 'id,name,rating,description,notes,visit';
const RESTAURANT_LIST_ITEM_LINK_FIELDS = 'id,list,restaurant,foodItem,userFoodItem,sourceUser,recommendedItems';
const BILL_ITEM_LIST_FIELDS = 'id,bill,item_name,price,assigned_to,split_mode,split_config,created';
const DEFAULT_FEATURE_PAGE_SIZE = 20;
const DEFAULT_RECENT_RESTAURANT_LIMIT = 12;
const MAX_RECENT_RESTAURANT_LIMIT = 24;

function resolvePaginationInput(input?: PaginationInput): { page: number; pageSize: number } {
  const page =
    typeof input?.page === 'number' && Number.isFinite(input.page) ? Math.max(1, Math.floor(input.page)) : 1;
  const pageSize =
    typeof input?.pageSize === 'number' && Number.isFinite(input.pageSize)
      ? Math.max(1, Math.floor(input.pageSize))
      : DEFAULT_FEATURE_PAGE_SIZE;

  return {
    page,
    pageSize,
  };
}

function mapPaginatedResult<TInput, TOutput>(
  pageResult: CollectionPageResult<TInput>,
  items: TOutput[],
): PaginatedResult<TOutput> {
  return {
    items,
    page: pageResult.page,
    pageSize: pageResult.pageSize,
    totalItems: pageResult.totalItems,
    totalPages: pageResult.totalPages,
    hasNextPage: pageResult.hasNextPage,
  };
}

function createEmptyPaginatedResult<T>(input?: PaginationInput): PaginatedResult<T> {
  const { page, pageSize } = resolvePaginationInput(input);
  return {
    items: [],
    page,
    pageSize,
    totalItems: 0,
    totalPages: 0,
    hasNextPage: false,
  };
}

function resolveRecentRestaurantLimit(limit?: number): number {
  if (typeof limit !== 'number' || Number.isNaN(limit)) {
    return DEFAULT_RECENT_RESTAURANT_LIMIT;
  }

  return Math.min(MAX_RECENT_RESTAURANT_LIMIT, Math.max(1, Math.floor(limit)));
}

function normalizeFeedbackStatus(status: unknown): FeedbackRecord['status'] {
  if (status === 'open' || status === 'in_progress' || status === 'resolved' || status === 'closed') {
    return status;
  }

  return 'open';
}

function parseCount(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0;
  }

  return Math.max(0, Math.floor(value));
}

function sanitizeCurrency(value: number | null | undefined): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0;
  }

  return Math.round(value * 100) / 100;
}

function normalizeBillRecordStatus(status: BillCollectionRecord['status']): BillRecord['status'] {
  return status === 'settled' ? 'settled' : 'open';
}

function toBillCollectionStatus(participants: BillParticipantRecord[]): BillCollectionRecord['status'] {
  return participants.every((participant) => participant.paidStatus === 'paid') ? 'settled' : 'active';
}

function toBillCollectionStatusFromRecord(status: BillRecord['status']): BillCollectionRecord['status'] {
  return status === 'settled' ? 'settled' : 'active';
}

function resolveBillParticipantName(record: BillParticipantCollectionRecord): string {
  const explicitName = record.participant_name?.trim();
  if (explicitName) {
    return explicitName;
  }

  const expandedName = record.expand?.user?.name?.trim();
  if (expandedName) {
    return expandedName;
  }

  const expandedEmail = record.expand?.user?.email?.trim();
  if (expandedEmail) {
    return expandedEmail.split('@')[0];
  }

  return 'Unknown';
}

function mapBillParticipantRecord(record: BillParticipantCollectionRecord): BillParticipantRecord {
  const customTipContribution =
    typeof record.custom_tip_contribution === 'number'
      ? sanitizeCurrency(record.custom_tip_contribution)
      : undefined;

  return {
    id: record.id,
    name: resolveBillParticipantName(record),
    userId: record.user ?? undefined,
    amountOwed: sanitizeCurrency(record.amount_owed),
    customTipContribution,
    paidStatus: record.paid_status === 'paid' ? 'paid' : 'pending',
  };
}

function mapBillItemRecord(record: BillItemCollectionRecord): BillItemRecord {
  const normalizedSplitConfig = Array.isArray(record.split_config)
    ? record.split_config
        .filter((entry) => {
          if (!entry || typeof entry !== 'object') {
            return false;
          }

          if (typeof entry.participant_id !== 'string' || !entry.participant_id) {
            return false;
          }

          const isSupportedType = entry.type === 'percentage' || entry.type === 'amount';
          const isValidValue = typeof entry.value === 'number' && Number.isFinite(entry.value);
          return isSupportedType && isValidValue;
        })
        .map((entry) => ({
          participantId: entry.participant_id,
          type: entry.type,
          value: sanitizeCurrency(entry.value),
        }))
    : null;

  return {
    id: record.id,
    itemName: record.item_name,
    price: sanitizeCurrency(record.price),
    assignedToParticipantIds: Array.isArray(record.assigned_to) ? record.assigned_to : [],
    splitMode: record.split_mode === 'advanced' ? 'advanced' : 'simple',
    splitConfig: normalizedSplitConfig,
  };
}

function mapBillRecord(
  bill: BillCollectionRecord,
  participants: BillParticipantCollectionRecord[],
  items: BillItemCollectionRecord[],
): BillRecord {
  const billTax = sanitizeCurrency(bill.tax);
  const billTip = sanitizeCurrency(bill.tip);
  const billFees = sanitizeCurrency(bill.fees);

  return {
    id: bill.id,
    title: bill.bill_name,
    restaurantName: bill.bill_name,
    createdByUserId: bill.creator_user,
    totalAmount: sanitizeCurrency(bill.total_amount),
    items: items.map(mapBillItemRecord),
    participants: participants.map(mapBillParticipantRecord),
    tax: billTax,
    tip: billTip,
    fees: billFees,
    splitMode: bill.split_mode,
    extrasSplitMode: bill.extras_split_mode,
    status: normalizeBillRecordStatus(bill.status),
    createdAt: bill.created,
    updatedAt: bill.updated,
  };
}

function mapBillListSummaryApiItem(item: BillListSummaryApiResponseItem): BillListSummary {
  return {
    id: item.id,
    title: item.title,
    status: item.status === 'settled' ? 'settled' : 'open',
    participantCount: parseCount(item.participantCount),
    pendingOtherParticipantCount: parseCount(item.pendingOtherParticipantCount),
    youOwe: sanitizeCurrency(item.youOwe),
    youAreOwed: sanitizeCurrency(item.youAreOwed),
    isCreator: item.isCreator === true,
    createdAt: typeof item.createdAt === 'string' ? item.createdAt : '',
    updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : '',
  };
}

async function listBillParticipantsForBillId(
  billId: string,
): Promise<BillParticipantCollectionRecord[]> {
  return listCollectionRecords<BillParticipantCollectionRecord>('bill_participants', {
    filter: `bill = "${escapeFilterValue(billId)}"`,
    sort: 'created',
    expand: 'user',
  });
}

async function listBillItemsForBillId(
  billId: string,
): Promise<BillItemCollectionRecord[]> {
  return listCollectionRecords<BillItemCollectionRecord>('bill_items', {
    filter: `bill = "${escapeFilterValue(billId)}"`,
    sort: 'created',
    fields: BILL_ITEM_LIST_FIELDS,
  });
}

async function mapBillWithRelations(bill: BillCollectionRecord): Promise<BillRecord> {
  const [participants, items] = await Promise.all([
    listBillParticipantsForBillId(bill.id),
    listBillItemsForBillId(bill.id),
  ]);

  return mapBillRecord(bill, participants, items);
}

function mapFeedbackRecord(record: FeedbackCollectionRecord): FeedbackRecord {
  return {
    id: record.id,
    userId: record.user,
    userName: resolveExpandedUserName(record.expand?.user),
    userEmail: record.expand?.user?.email,
    assignedAdminId: record.assigned_admin,
    adminReplyDeadlineAt: record.admin_reply_deadline_at,
    title: record.title,
    description: record.description,
    status: normalizeFeedbackStatus(record.status),
    adminUnreadCount: parseCount(record.admin_unread_count),
    userUnreadCount: parseCount(record.user_unread_count),
    lastMessageAt: record.last_message_at,
    createdAt: record.created,
    updatedAt: record.updated,
  };
}

function mapFeedbackMessageRecord(record: FeedbackMessageCollectionRecord): FeedbackMessageRecord {
  return {
    id: record.id,
    feedbackId: record.feedback,
    userId: record.user,
    userName: resolveExpandedUserName(record.expand?.user),
    userEmail: record.expand?.user?.email,
    message: record.message,
    isAdminMessage: record.is_admin_message === true,
    createdAt: record.created,
  };
}

function isCurrentUserAdmin(): boolean {
  return resolveEffectiveAdminFlag(pb.authStore.record?.isAdmin === true);
}

function getAuthenticatedUserId(): string {
  const userId = pb.authStore.record?.id;
  if (!userId) {
    throw new Error('Authentication required.');
  }

  return userId;
}

function resolveFriendName(user: FriendshipUser | undefined): string {
  const trimmedName = user?.name?.trim();
  if (trimmedName) {
    return trimmedName;
  }

  const trimmedEmail = user?.email?.trim();
  if (trimmedEmail) {
    return trimmedEmail.split('@')[0];
  }

  return 'Unknown';
}

function resolveFriendEmail(user: FriendshipUser | undefined): string {
  return user?.email?.trim().toLowerCase() ?? '';
}

function resolveAcceptedFriendIds(
  friendships: AcceptedFriendshipRecord[],
  currentUserId: string,
): string[] {
  return Array.from(
    new Set(
      friendships.map((friendship) => (friendship.user === currentUserId ? friendship.friend : friendship.user)),
    ),
  );
}

function mapFriendshipRecord(friendship: FriendshipRecord, currentUserId: string): FriendRecord | null {
  if (friendship.status === 'blocked') {
    return null;
  }

  const isSender = friendship.user === currentUserId;
  const otherUser = isSender ? friendship.expand?.friend : friendship.expand?.user;
  const otherUserId = isSender ? friendship.friend : friendship.user;

  const status: FriendStatus =
    friendship.status === 'accepted'
      ? 'friend'
      : friendship.friend === currentUserId
        ? 'pending_received'
        : 'pending_sent';

  return {
    id: friendship.id,
    userId: otherUser?.id ?? otherUserId,
    name: resolveFriendName(otherUser),
    email: resolveFriendEmail(otherUser),
    status,
    createdAt: friendship.created,
  };
}

function mapFriendListApiItem(item: FriendListApiItem): FriendRecord {
  const trimmedName = item.displayName?.trim();
  return {
    id: item.id,
    userId: item.userId,
    name: trimmedName && trimmedName.length > 0 ? trimmedName : 'Unknown',
    email: '',
    status: item.status,
    createdAt: item.createdAt,
  };
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof ClientResponseError && error.status === 404;
}

function escapeFilterValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function buildOrFilter(fieldName: string, values: string[]): string {
  const filter = values.map((value) => `${fieldName} = "${escapeFilterValue(value)}"`).join(' || ');
  return values.length > 1 ? `(${filter})` : filter;
}

function buildAnyMatchFilter(fieldName: string, values: string[]): string {
  const filter = values.map((value) => `${fieldName} ?= "${escapeFilterValue(value)}"`).join(' || ');
  return values.length > 1 ? `(${filter})` : filter;
}

function buildSearchFilter(fieldNames: string[], search: string): string | undefined {
  const trimmedSearch = search.trim();
  if (!trimmedSearch) {
    return undefined;
  }

  const escapedSearch = escapeFilterValue(trimmedSearch);
  const filter = fieldNames.map((fieldName) => `${fieldName} ~ "${escapedSearch}"`).join(' || ');
  return fieldNames.length > 1 ? `(${filter})` : filter;
}

function combineFilterClauses(...clauses: (string | undefined)[]): string | undefined {
  const normalizedClauses = clauses
    .map((clause) => clause?.trim())
    .filter((clause): clause is string => Boolean(clause));

  if (normalizedClauses.length === 0) {
    return undefined;
  }

  return normalizedClauses.map((clause) => `(${clause})`).join(' && ');
}

function combineOrFilterClauses(...clauses: (string | undefined)[]): string | undefined {
  const normalizedClauses = clauses
    .map((clause) => clause?.trim())
    .filter((clause): clause is string => Boolean(clause));

  if (normalizedClauses.length === 0) {
    return undefined;
  }

  return normalizedClauses.map((clause) => `(${clause})`).join(' || ');
}

function normalizeQuickTrackVisibility(value: unknown): 'friends' | 'private' {
  return value === 'private' ? 'private' : 'friends';
}

function getDefaultVisitVisibility(): 'friends' | 'private' {
  return normalizeQuickTrackVisibility(pb.authStore.record?.defaultVisitVisibility);
}

function getDefaultRestaurantVisibility(): 'private' | 'friends' | 'public' {
  const value = pb.authStore.record?.defaultRestaurantVisibility;
  if (value === 'private' || value === 'public') {
    return value;
  }
  return 'friends';
}

function resolveExpandedUserName(user: CollectionUserExpand | undefined): string | undefined {
  const trimmedName = user?.name?.trim();
  if (trimmedName) {
    return trimmedName;
  }

  const trimmedEmail = user?.email?.trim();
  if (trimmedEmail) {
    return trimmedEmail.split('@')[0];
  }

  return undefined;
}

function mapRestaurantCollectionRecord(record: RestaurantCollectionRecord): RestaurantRecord {
  return {
    id: record.id,
    name: record.name.trim(),
    location: record.location?.trim() || undefined,
    city: record.location?.trim() || undefined,
    cuisineType: record.cuisineType?.trim() || undefined,
    visibility: record.visibility,
    latitude: typeof record.latitude === 'number' ? record.latitude : undefined,
    longitude: typeof record.longitude === 'number' ? record.longitude : undefined,
    placeId: record.placeId?.trim() || undefined,
    isGooglePlace: record.isGooglePlace === true,
  };
}

function normalizeListVisibility(value: unknown): 'private' | 'friends' {
  return value === 'friends' || value === 'public' ? 'friends' : 'private';
}

function mapRestaurantListCollectionRecord(record: RestaurantListCollectionRecord): RestaurantListRecord {
  return {
    id: record.id,
    name: record.name.trim(),
    description: record.description?.trim() || undefined,
    visibility: normalizeListVisibility(record.visibility),
    userId: record.user,
    ownerName: resolveExpandedUserName(record.expand?.user),
    isDefault: record.isDefault === true,
    coverImage: record.coverImage,
    createdAt: record.created,
    updatedAt: record.updated || record.created,
  };
}

function mapRestaurantListBookmarkedItemRecord(
  listItemId: string,
  sourceUser: CollectionUserExpand | undefined,
  sourceUserId: string | undefined,
  foodItem: FoodItemCollectionRecord,
  userFoodItem?: FoodItemCollectionRecord,
): RestaurantListBookmarkedItemRecord {
  const normalizedSourceUserId = sourceUser?.id ?? sourceUserId?.trim() ?? undefined;

  return {
    id: foodItem.id,
    listItemId,
    name: foodItem.name?.trim() || 'Unknown item',
    rating: foodItem.rating,
    visitedAt: foodItem.expand?.visit?.visitDate || foodItem.itemDate || foodItem.created,
    sourceUserId: normalizedSourceUserId,
    sourceUserName: resolveExpandedUserName(sourceUser),
    userFoodItemId: userFoodItem?.id,
    userFoodItemName: userFoodItem?.name?.trim() || undefined,
    userFoodItemRating: userFoodItem?.rating,
    userFoodItemVisitedAt:
      userFoodItem?.expand?.visit?.visitDate || userFoodItem?.itemDate || userFoodItem?.created,
  };
}

function mapListItemCollectionRecord(record: ListItemCollectionRecord): RestaurantListItemRecord {
  const expandedFoodItem = record.expand?.foodItem;
  const expandedRecommendedItems = record.expand?.recommendedItems ?? [];
  const bookmarkedItems = expandedFoodItem
      ? [
        mapRestaurantListBookmarkedItemRecord(
          record.id,
          record.expand?.sourceUser,
          record.sourceUser,
          expandedFoodItem,
          record.expand?.userFoodItem,
        ),
      ]
    : expandedRecommendedItems.map((foodItem) =>
        mapRestaurantListBookmarkedItemRecord(
          record.id,
          record.expand?.sourceUser,
          record.sourceUser,
          foodItem,
          record.expand?.userFoodItem,
        ),
      );

  return {
    id: record.id,
    listId: record.list,
    restaurantId: record.restaurant,
    restaurantName: record.expand?.restaurant?.name?.trim() || 'Unknown restaurant',
    restaurantCity: record.expand?.restaurant?.location?.trim() || undefined,
    restaurantCuisineType: record.expand?.restaurant?.cuisineType?.trim() || undefined,
    sourceUserId: record.expand?.sourceUser?.id ?? record.sourceUser?.trim() ?? undefined,
    sourceUserName: resolveExpandedUserName(record.expand?.sourceUser),
    position: record.position,
    bookmarkedItems,
    note: record.note?.trim() || undefined,
    createdAt: record.created,
  };
}

function mapRestaurantListItemLinkRecord(record: ListItemCollectionRecord): RestaurantListItemLinkRecord {
  return {
    id: record.id,
    listId: record.list,
    restaurantId: record.restaurant,
    foodItemId: record.foodItem?.trim() || undefined,
    userFoodItemId: record.userFoodItem?.trim() || undefined,
    sourceUserId: record.sourceUser?.trim() || undefined,
    recommendedItemIds: (record.recommendedItems ?? [])
      .map((itemId) => itemId?.trim())
      .filter((itemId): itemId is string => Boolean(itemId)),
  };
}

export function getRestaurantListItemLinkFoodItemIds(
  record: Pick<RestaurantListItemLinkRecord, 'foodItemId' | 'userFoodItemId' | 'recommendedItemIds'>,
): string[] {
  const foodItemIds = new Set<string>();

  if (record.foodItemId?.trim()) {
    foodItemIds.add(record.foodItemId.trim());
  }

  if (record.userFoodItemId?.trim()) {
    foodItemIds.add(record.userFoodItemId.trim());
  }

  for (const recommendedItemId of record.recommendedItemIds ?? []) {
    if (recommendedItemId?.trim()) {
      foodItemIds.add(recommendedItemId.trim());
    }
  }

  return Array.from(foodItemIds);
}

function buildRestaurantListItemLinkFoodItemLookupFilter(foodItemIds: string[]): string | undefined {
  const normalizedFoodItemIds = Array.from(new Set(foodItemIds.map((id) => id.trim()).filter((id) => id.length > 0)));
  if (normalizedFoodItemIds.length === 0) {
    return undefined;
  }

  return combineOrFilterClauses(
    buildOrFilter('foodItem', normalizedFoodItemIds),
    buildOrFilter('userFoodItem', normalizedFoodItemIds),
    buildAnyMatchFilter('recommendedItems', normalizedFoodItemIds),
  );
}

function mapVisitItemRecord(record: FoodItemCollectionRecord): VisitItem {
  return {
    id: record.id,
    name: record.name,
    rating: record.rating,
    description: record.description?.trim() || undefined,
    notes: record.notes,
  };
}

function mapVisitCollectionRecord(visit: VisitCollectionRecord, visitItems: FoodItemCollectionRecord[]): VisitRecord {
  return {
    id: visit.id,
    restaurantId: visit.restaurant,
    restaurantName: visit.expand?.restaurant?.name?.trim() || 'Unknown Restaurant',
    restaurantLocation: visit.expand?.restaurant?.location?.trim() || undefined,
    restaurantCuisineType: visit.expand?.restaurant?.cuisineType?.trim() || undefined,
    visitedAt: visit.visitDate || visit.created,
    items: visitItems.map(mapVisitItemRecord),
    source: 'visit',
    userId: visit.user,
    userName: resolveExpandedUserName(visit.expand?.user),
    visibility: normalizeQuickTrackVisibility(visit.visibility),
    moderationStatus: normalizeModerationContentStatus(visit.moderationStatus),
    createdAt: visit.created,
    updatedAt: visit.updated,
  };
}

function mapQuickTrackCollectionRecord(record: FoodItemCollectionRecord): QuickTrackRecord {
  return {
    id: record.id,
    restaurantName: record.expand?.visit?.expand?.restaurant?.name?.trim() || 'Quick Track',
    itemCategory: record.itemCategory,
    itemName: record.name,
    rating: record.rating,
    notes: record.notes,
    userId: record.user,
    userName: resolveExpandedUserName(record.expand?.user),
    visibility: normalizeQuickTrackVisibility(record.visibility),
    moderationStatus: normalizeModerationContentStatus(record.moderationStatus),
    itemDate: record.itemDate,
    createdAt: record.created,
    updatedAt: record.updated,
  };
}

function normalizeModerationContentStatus(value: unknown): ModerationContentStatus | undefined {
  switch (value) {
    case 'active':
    case 'reviewed':
    case 'under_review':
    case 'hidden':
    case 'removed':
    case 'escalated':
      return value;
    default:
      return undefined;
  }
}

function normalizeNoteStatus(status: unknown): NoteRecord['status'] {
  return status === 'used' ? 'used' : 'draft';
}

function buildNoteTitle(content: string): string {
  const firstLine = content
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (!firstLine) {
    return 'Note';
  }

  if (firstLine.length <= 48) {
    return firstLine;
  }

  return `${firstLine.slice(0, 45).trimEnd()}...`;
}

function buildNoteContent(title: string | undefined, content: string | undefined): string {
  const trimmedTitle = title?.trim() ?? '';
  const trimmedContent = content?.trim() ?? '';

  if (trimmedTitle && trimmedContent) {
    if (trimmedContent.toLowerCase().startsWith(trimmedTitle.toLowerCase())) {
      return trimmedContent;
    }

    return `${trimmedTitle}\n\n${trimmedContent}`;
  }

  return trimmedContent || trimmedTitle;
}

function mapNoteCollectionRecord(record: NoteCollectionRecord): NoteRecord {
  const normalizedContent = record.content?.trim() ?? '';

  return {
    id: record.id,
    title: buildNoteTitle(normalizedContent),
    content: normalizedContent,
    status: normalizeNoteStatus(record.status),
    restaurantId: record.restaurant,
    restaurantName: record.expand?.restaurant?.name?.trim() || undefined,
    usedInVisitId: record.usedInVisit,
    usedInFoodItemId: record.usedInFoodItem,
    createdAt: record.created,
    updatedAt: record.updated,
  };
}

function buildNotePhotoFormData(
  noteId: string,
  userId: string,
  photo: NotePhotoUploadInput,
): FormData {
  const formData = new FormData();
  formData.append('note', noteId);
  formData.append('user', userId);
  formData.append('photo', {
    uri: photo.uri,
    name: photo.name,
    type: photo.mimeType,
  } as unknown as Blob);
  return formData;
}

async function uploadNotePhotos(
  noteId: string,
  userId: string,
  photos: NotePhotoUploadInput[],
): Promise<void> {
  if (photos.length === 0) {
    return;
  }

  for (const photo of photos) {
    const formData = buildNotePhotoFormData(noteId, userId, photo);
    await pb.collection('note_photos').create(formData);
  }
}

function buildVisitPhotoFormData(
  visitId: string | undefined,
  foodItemId: string,
  userId: string,
  photo: VisitPhotoUploadInput,
  caption?: string,
): FormData {
  const formData = new FormData();
  if (visitId) {
    formData.append('visit', visitId);
  }
  formData.append('food_item', foodItemId);
  formData.append('user', userId);
  formData.append('photo', {
    uri: photo.uri,
    name: photo.name,
    type: photo.mimeType,
  } as unknown as Blob);

  const trimmedCaption = caption?.trim();
  if (trimmedCaption) {
    formData.append('caption', trimmedCaption);
  }

  return formData;
}

async function uploadVisitPhotos(
  visitId: string | undefined,
  foodItemId: string,
  userId: string,
  photos: VisitPhotoUploadInput[],
  caption?: string,
): Promise<void> {
  if (photos.length === 0) {
    return;
  }

  for (const photo of photos) {
    const formData = buildVisitPhotoFormData(visitId, foodItemId, userId, photo, caption);
    await pb.collection('visit_photos').create(formData);
  }
}

async function listFoodItemsForVisitIds(visitIds: string[]): Promise<FoodItemCollectionRecord[]> {
  if (visitIds.length === 0) {
    return [];
  }

  const records: FoodItemCollectionRecord[] = [];
  const chunkSize = 20;

  for (let index = 0; index < visitIds.length; index += chunkSize) {
    const chunk = visitIds.slice(index, index + chunkSize);
    const chunkRecords = await listCollectionRecords<FoodItemCollectionRecord>('food_items', {
      filter: buildOrFilter('visit', chunk),
      sort: '-created',
      fields: VISIT_ITEM_LIST_FIELDS,
    });
    records.push(...chunkRecords);
  }

  return records;
}

async function listRestaurantIdsMatchingSearch(search: string): Promise<string[]> {
  const searchFilter = buildSearchFilter(['name', 'location', 'cuisineType'], search);
  if (!searchFilter) {
    return [];
  }

  const records = await listCollectionRecords<Pick<RestaurantCollectionRecord, 'id'>>('restaurants', {
    filter: searchFilter,
    fields: 'id',
  });

  return Array.from(new Set(records.map((record) => record.id)));
}

async function listVisitIdsMatchingSearch(
  search: string,
  scope: 'all' | 'mine' | 'friends',
  currentUserId: string,
): Promise<string[]> {
  const searchFilter = buildSearchFilter(['name', 'notes'], search);
  if (!searchFilter) {
    return [];
  }

  const escapedCurrentUserId = escapeFilterValue(currentUserId);
  const scopeFilter =
    scope === 'mine'
      ? `user = "${escapedCurrentUserId}"`
      : scope === 'friends'
        ? `user != "${escapedCurrentUserId}"`
        : undefined;

  const records = await listCollectionRecords<Pick<FoodItemCollectionRecord, 'visit'>>('food_items', {
    filter: combineFilterClauses('visit != ""', 'isQuickTrack != true', scopeFilter, searchFilter),
    fields: 'visit',
  });

  return Array.from(new Set(records.map((record) => record.visit).filter((visitId): visitId is string => Boolean(visitId))));
}

async function findRestaurantByName(name: string): Promise<RestaurantCollectionRecord | null> {
  const trimmedName = name.trim();
  if (!trimmedName) {
    return null;
  }

  const escapedName = escapeFilterValue(trimmedName);
  const normalizedName = trimmedName.toLowerCase();
  let page = 1;

  while (true) {
    const response = await pb.collection('restaurants').getList<RestaurantCollectionRecord>(page, 50, {
      filter: `name ~ "${escapedName}"`,
      sort: '-updated',
      fields: RESTAURANT_LIST_FIELDS,
    });

    const exactMatch = response.items.find((record) => record.name.trim().toLowerCase() === normalizedName);
    if (exactMatch) {
      return exactMatch;
    }

    if (response.items.length === 0 || page >= response.totalPages) {
      break;
    }

    page += 1;
  }

  return null;
}

async function findOrCreateRestaurantByName(
  restaurantName: string,
  currentUserId: string,
  locationText?: string,
): Promise<RestaurantCollectionRecord> {
  const trimmedName = restaurantName.trim();
  if (!trimmedName) {
    throw new Error('Restaurant name is required.');
  }

  const existingRestaurant = await findRestaurantByName(trimmedName);
  if (existingRestaurant) {
    return existingRestaurant;
  }

  return pb.collection('restaurants').create<RestaurantCollectionRecord>({
    name: trimmedName,
    location: locationText?.trim() || trimmedName,
    createdBy: currentUserId,
    visibility: getDefaultRestaurantVisibility(),
  });
}

export async function listVisitsPage(input?: ListVisitsPageInput): Promise<PaginatedResult<VisitRecord>> {
  if (!pb.authStore.record?.id) {
    return createEmptyPaginatedResult(input);
  }

  const { page, pageSize } = resolvePaginationInput(input);
  const currentUserId = getAuthenticatedUserId();
  const scope = input?.scope ?? 'all';
  const escapedCurrentUserId = escapeFilterValue(currentUserId);
  const scopeFilter =
    scope === 'mine'
      ? `user = "${escapedCurrentUserId}"`
      : scope === 'friends'
        ? `user != "${escapedCurrentUserId}"`
        : undefined;
  const trimmedSearch = input?.search?.trim() ?? '';
  let searchFilter: string | undefined;
  if (trimmedSearch) {
    const [matchingRestaurantIds, matchingVisitIds] = await Promise.all([
      listRestaurantIdsMatchingSearch(trimmedSearch),
      listVisitIdsMatchingSearch(trimmedSearch, scope, currentUserId),
    ]);

    const searchClauses = [
      matchingRestaurantIds.length > 0 ? buildOrFilter('restaurant', matchingRestaurantIds) : undefined,
      matchingVisitIds.length > 0 ? buildOrFilter('id', matchingVisitIds) : undefined,
    ].filter((clause): clause is string => Boolean(clause));

    if (searchClauses.length === 0) {
      return createEmptyPaginatedResult(input);
    }

    searchFilter = searchClauses.length > 1 ? `(${searchClauses.join(' || ')})` : searchClauses[0];
  }

  const pageResult = await listCollectionPage<VisitCollectionRecord>('visits', {
    page,
    pageSize,
    filter: combineFilterClauses(scopeFilter, searchFilter),
    expand: 'restaurant,user',
    sort: '-visitDate',
  });

  if (pageResult.items.length === 0) {
    return mapPaginatedResult(pageResult, []);
  }

  const visitItems = await listFoodItemsForVisitIds(pageResult.items.map((visit) => visit.id));
  const itemsByVisitId = new Map<string, FoodItemCollectionRecord[]>();
  for (const item of visitItems) {
    if (!item.visit) {
      continue;
    }
    const existingItems = itemsByVisitId.get(item.visit) ?? [];
    existingItems.push(item);
    itemsByVisitId.set(item.visit, existingItems);
  }

  return mapPaginatedResult(
    pageResult,
    pageResult.items.map((visit) => mapVisitCollectionRecord(visit, itemsByVisitId.get(visit.id) ?? [])),
  );
}

export async function getVisitById(visitId: string): Promise<VisitRecord | null> {
  if (!pb.authStore.record?.id) {
    return null;
  }

  try {
    const visit = await pb.collection('visits').getOne<VisitCollectionRecord>(visitId, {
      expand: 'restaurant,user',
    });
    const visitItems = await listCollectionRecords<FoodItemCollectionRecord>('food_items', {
      filter: `visit = "${escapeFilterValue(visitId)}"`,
      sort: '-created',
      fields: VISIT_ITEM_LIST_FIELDS,
    });

    return mapVisitCollectionRecord(visit, visitItems);
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }
    throw error;
  }
}

export async function createVisit(input: CreateVisitInput): Promise<VisitRecord> {
  return trackFeatureMutation(
    'visit.create',
    async () => {
      const currentUserId = getAuthenticatedUserId();
      const trimmedRestaurantName = input.restaurantName.trim();

      if (!trimmedRestaurantName) {
        throw new Error('Restaurant name is required.');
      }

      if (input.items.length === 0) {
        throw new Error('At least one item is required.');
      }

      const restaurant = await findOrCreateRestaurantByName(trimmedRestaurantName, currentUserId);
      const visit = await pb.collection('visits').create<VisitCollectionRecord>(
        {
          restaurant: restaurant.id,
          user: currentUserId,
          visitDate: input.visitedAt ?? nowIso(),
          visibility: input.visibility ?? getDefaultVisitVisibility(),
        },
        {
          expand: 'restaurant,user',
        },
      );

      const createdItems: FoodItemCollectionRecord[] = [];
      for (const item of input.items) {
        const createdItem = await pb.collection('food_items').create<FoodItemCollectionRecord>({
          name: item.name.trim(),
          rating: item.rating,
          description: item.description?.trim() || undefined,
          notes: item.notes?.trim() || undefined,
          visit: visit.id,
          user: currentUserId,
        });

        createdItems.push(createdItem);

        await uploadVisitPhotos(
          visit.id,
          createdItem.id,
          currentUserId,
          item.photos ?? [],
          item.description || item.name,
        );
      }

      return mapVisitCollectionRecord(visit, createdItems);
    },
    {
      itemCount: input.items.length,
      hasVisitedAt: Boolean(input.visitedAt),
      visibility: input.visibility ?? getDefaultVisitVisibility(),
      source: input.source ?? 'unknown',
    },
  );
}

export async function updateVisit(visitId: string, updates: UpdateVisitInput): Promise<VisitRecord> {
  return trackFeatureMutation(
    'visit.update',
    async () => {
      const currentUserId = getAuthenticatedUserId();
      const currentVisit = await pb.collection('visits').getOne<VisitCollectionRecord>(visitId, {
        expand: 'restaurant,user',
      });

      const updatePayload: Record<string, unknown> = {};
      const nextRestaurantName = updates.restaurantName?.trim();
      if (nextRestaurantName && nextRestaurantName !== (currentVisit.expand?.restaurant?.name ?? '')) {
        const restaurant = await findOrCreateRestaurantByName(nextRestaurantName, currentUserId);
        updatePayload.restaurant = restaurant.id;
      }

      if (updates.visitedAt) {
        updatePayload.visitDate = updates.visitedAt;
      }

      if (updates.visibility) {
        updatePayload.visibility = updates.visibility;
      }

      const updatedVisit =
        Object.keys(updatePayload).length > 0
          ? await pb.collection('visits').update<VisitCollectionRecord>(visitId, updatePayload, {
              expand: 'restaurant,user',
            })
          : currentVisit;

      if (updates.items) {
        const existingItems = await listCollectionRecords<Pick<FoodItemCollectionRecord, 'id'>>('food_items', {
          filter: `visit = "${escapeFilterValue(visitId)}"`,
          fields: 'id',
        });
        const existingItemsById = new Map(existingItems.map((item) => [item.id, item]));
        const requestedIds = new Set<string>();

        for (const item of updates.items) {
          const trimmedName = item.name.trim();
          if (!trimmedName) {
            continue;
          }

          requestedIds.add(item.id);
          if (existingItemsById.has(item.id)) {
            await pb.collection('food_items').update(item.id, {
              name: trimmedName,
              rating: item.rating,
              description: item.description?.trim() || '',
              notes: item.notes?.trim() || '',
            });
          } else {
            await pb.collection('food_items').create({
              name: trimmedName,
              rating: item.rating,
              description: item.description?.trim() || undefined,
              notes: item.notes?.trim() || undefined,
              visit: visitId,
              user: currentUserId,
            });
          }
        }

        const deletedItems = existingItems.filter((item) => !requestedIds.has(item.id));
        await Promise.all(deletedItems.map((item) => pb.collection('food_items').delete(item.id)));
      }

      const nextItems = await listCollectionRecords<FoodItemCollectionRecord>('food_items', {
        filter: `visit = "${escapeFilterValue(visitId)}"`,
        sort: '-created',
        fields: VISIT_ITEM_LIST_FIELDS,
      });

      return mapVisitCollectionRecord(updatedVisit, nextItems);
    },
    {
      hasRestaurantNameUpdate: updates.restaurantName !== undefined,
      hasVisitedAtUpdate: updates.visitedAt !== undefined,
      hasVisibilityUpdate: updates.visibility !== undefined,
      hasItemsUpdate: updates.items !== undefined,
      itemCount: updates.items?.length,
    },
  );
}

export async function listQuickTracksPage(input?: ListQuickTracksPageInput): Promise<PaginatedResult<QuickTrackRecord>> {
  if (!pb.authStore.record?.id) {
    return createEmptyPaginatedResult(input);
  }

  const { page, pageSize } = resolvePaginationInput(input);
  const currentUserId = getAuthenticatedUserId();
  const escapedCurrentUserId = escapeFilterValue(currentUserId);
  const scope = input?.scope ?? 'all';
  const scopeFilter =
    scope === 'mine'
      ? `user = "${escapedCurrentUserId}"`
      : scope === 'friends'
        ? `user != "${escapedCurrentUserId}"`
        : undefined;
  const searchFilter = buildSearchFilter(['name', 'itemCategory', 'notes'], input?.search ?? '');
  const filter = combineFilterClauses('isQuickTrack = true', scopeFilter, searchFilter);

  const pageResult = await listCollectionPage<FoodItemCollectionRecord>('food_items', {
    page,
    pageSize,
    filter,
    expand: 'user,visit,visit.restaurant',
    sort: '-itemDate,-created',
  });

  return mapPaginatedResult(pageResult, pageResult.items.map(mapQuickTrackCollectionRecord));
}

export async function getQuickTrackById(quickTrackId: string): Promise<QuickTrackRecord | null> {
  if (!pb.authStore.record?.id) {
    return null;
  }

  try {
    const record = await pb.collection('food_items').getOne<FoodItemCollectionRecord>(quickTrackId, {
      expand: 'user,visit,visit.restaurant',
    });
    if (record.isQuickTrack !== true) {
      return null;
    }
    return mapQuickTrackCollectionRecord(record);
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }
    throw error;
  }
}

export async function createQuickTrack(input: CreateQuickTrackInput): Promise<QuickTrackRecord> {
  return trackFeatureMutation(
    'quick_track.create',
    async () => {
      const currentUserId = getAuthenticatedUserId();
      const itemName = input.itemName.trim();
      if (!itemName) {
        throw new Error('Item name is required.');
      }
      const payload: Record<string, unknown> = {
        name: itemName,
        rating: input.rating,
        user: currentUserId,
        isQuickTrack: true,
        visibility: input.visibility ?? getDefaultVisitVisibility(),
        itemDate: input.itemDate ?? nowIso(),
      };

      if (input.notes !== undefined) {
        payload.notes = input.notes.trim() || '';
      }

      if (input.itemCategory !== undefined) {
        payload.itemCategory = input.itemCategory;
      }

      const record = await pb.collection('food_items').create<FoodItemCollectionRecord>(
        payload,
        {
          expand: 'user,visit,visit.restaurant',
        },
      );

      if (input.photo) {
        await uploadVisitPhotos(undefined, record.id, currentUserId, [input.photo]);
      }

      if (input.sourceNoteId) {
        try {
          await pb.collection('notes').update(input.sourceNoteId, {
            status: 'used',
            usedInFoodItem: record.id,
          });
        } catch {
          // Best effort only: quick-track create should still succeed if note linking fails.
        }
      }

      return {
        ...mapQuickTrackCollectionRecord(record),
        sourceNoteId: input.sourceNoteId,
      };
    },
    {
      rating: input.rating,
      visibility: input.visibility ?? getDefaultVisitVisibility(),
      hasPhoto: Boolean(input.photo),
      hasSourceNote: Boolean(input.sourceNoteId),
      hasItemCategory: Boolean(input.itemCategory),
    },
  );
}

export async function updateQuickTrack(
  quickTrackId: string,
  updates: UpdateQuickTrackInput,
): Promise<QuickTrackRecord> {
  return trackFeatureMutation(
    'quick_track.update',
    async () => {
      const currentRecord = await pb.collection('food_items').getOne<FoodItemCollectionRecord>(quickTrackId);
      if (currentRecord.isQuickTrack !== true) {
        throw new Error('Quick track record not found.');
      }

      const payload: Record<string, unknown> = {};
      if (updates.itemName !== undefined) {
        const trimmedName = updates.itemName.trim();
        if (!trimmedName) {
          throw new Error('Item name is required.');
        }
        payload.name = trimmedName;
      }

      if (updates.rating !== undefined) {
        payload.rating = updates.rating;
      }

      if (updates.notes !== undefined) {
        payload.notes = updates.notes.trim() || '';
      }

      if (updates.itemCategory !== undefined) {
        payload.itemCategory = updates.itemCategory ?? '';
      }

      if (updates.visibility !== undefined) {
        payload.visibility = updates.visibility;
      }

      if (updates.itemDate !== undefined) {
        payload.itemDate = updates.itemDate;
      }

      payload.location_text = '';
      payload.latitude = null;
      payload.longitude = null;

      const updatedRecord =
        Object.keys(payload).length > 0
          ? await pb.collection('food_items').update<FoodItemCollectionRecord>(quickTrackId, payload, {
              expand: 'user,visit,visit.restaurant',
            })
          : await pb.collection('food_items').getOne<FoodItemCollectionRecord>(quickTrackId, {
              expand: 'user,visit,visit.restaurant',
            });

      return mapQuickTrackCollectionRecord(updatedRecord);
    },
    {
      hasItemNameUpdate: updates.itemName !== undefined,
      hasRatingUpdate: updates.rating !== undefined,
      hasNotesUpdate: updates.notes !== undefined,
      hasVisibilityUpdate: updates.visibility !== undefined,
      hasItemDateUpdate: updates.itemDate !== undefined,
      clearsLegacyLocationData: true,
    },
  );
}

export async function deleteQuickTrack(quickTrackId: string): Promise<void> {
  return trackFeatureMutation('quick_track.delete', async () => {
    try {
      await pb.collection('food_items').delete(quickTrackId);
    } catch (error) {
      if (isNotFoundError(error)) {
        return;
      }
      throw error;
    }
  });
}

export async function deleteVisit(visitId: string): Promise<void> {
  return trackFeatureMutation('visit.delete', async () => {
    try {
      await pb.collection('visits').delete(visitId);
    } catch (error) {
      if (isNotFoundError(error)) {
        return;
      }
      throw error;
    }
  });
}

export async function getPhotoDraft(): Promise<PhotoProcessingDraft> {
  const store = await getStore();
  return store.photoDraft;
}

export async function savePhotoDraft(assets: PhotoDraftAsset[]): Promise<PhotoProcessingDraft> {
  return mutateStore((store) => {
    store.photoDraft = {
      assets,
      updatedAt: nowIso(),
    };
    return store.photoDraft;
  });
}

export async function clearPhotoDraft(): Promise<void> {
  await mutateStore((store) => {
    store.photoDraft = {
      assets: [],
      updatedAt: nowIso(),
    };
  });
}

export async function searchRestaurantsPage(
  input: SearchRestaurantsPageInput,
): Promise<PaginatedResult<RestaurantRecord>> {
  if (!pb.authStore.record?.id) {
    return createEmptyPaginatedResult(input);
  }

  const trimmedSearch = input.search.trim();
  if (!trimmedSearch) {
    return createEmptyPaginatedResult(input);
  }

  const { page, pageSize } = resolvePaginationInput(input);
  const pageResult = await listCollectionPage<RestaurantCollectionRecord>('restaurants', {
    page,
    pageSize,
    filter: buildSearchFilter(['name', 'location', 'cuisineType'], trimmedSearch),
    sort: 'name',
    fields: RESTAURANT_LIST_FIELDS,
  });

  return mapPaginatedResult(pageResult, pageResult.items.map(mapRestaurantCollectionRecord));
}

export async function listRecentRestaurants(
  input?: ListRecentRestaurantsInput,
): Promise<RestaurantRecord[]> {
  if (!pb.authStore.record?.id) {
    return [];
  }

  const limit = resolveRecentRestaurantLimit(input?.limit);
  const response = await sendApiRequest<RecentRestaurantApiRecord[]>(
    `/api/restaurants/recent?limit=${encodeURIComponent(String(limit))}`,
    {
      method: 'GET',
    },
  );

  return response.map((restaurant) => {
    const location = restaurant.location?.trim() || undefined;

    return {
      id: restaurant.id,
      name: restaurant.name.trim(),
      city: restaurant.city?.trim() || location,
      location,
      cuisineType: restaurant.cuisineType?.trim() || undefined,
      visibility: restaurant.visibility,
      latitude: typeof restaurant.latitude === 'number' ? restaurant.latitude : undefined,
      longitude: typeof restaurant.longitude === 'number' ? restaurant.longitude : undefined,
      placeId: restaurant.placeId?.trim() || undefined,
      isGooglePlace: restaurant.isGooglePlace === true,
    };
  });
}

export async function listVisitPhotosForFoodItemIds(foodItemIds: string[]): Promise<VisitPhotoRecord[]> {
  if (!pb.authStore.record?.id || foodItemIds.length === 0) {
    return [];
  }

  const records: VisitPhotoRecord[] = [];
  const chunkSize = 20;

  for (let index = 0; index < foodItemIds.length; index += chunkSize) {
    const chunk = foodItemIds.slice(index, index + chunkSize);
    const chunkRecords = await listCollectionRecords<VisitPhotoRecord>('visit_photos', {
      filter: buildOrFilter('food_item', chunk),
      sort: '-created',
      expand: 'user',
    });
    records.push(...chunkRecords);
  }

  return records;
}

export async function listRestaurantLists(input?: ListRestaurantListsInput): Promise<RestaurantListRecord[]> {
  if (!pb.authStore.record?.id) {
    return [];
  }

  const currentUserId = getAuthenticatedUserId();
  const escapedCurrentUserId = escapeFilterValue(currentUserId);
  const scope = input?.scope === 'friends' ? 'friends' : 'my';

  let filter: string | undefined;
  let expand: string | undefined;

  if (scope === 'my') {
    filter = `user = "${escapedCurrentUserId}"`;
  } else {
    const friendships = await listAcceptedFriendships();
    const friendIds = resolveAcceptedFriendIds(friendships, currentUserId);

    if (friendIds.length === 0) {
      return [];
    }

    const friendFilter = friendIds.map((friendId) => `user = "${escapeFilterValue(friendId)}"`).join(' || ');
    filter = `(${friendFilter}) && visibility = "friends"`;
    expand = 'user';
  }

  const records = await listCollectionRecords<RestaurantListCollectionRecord>('restaurant_lists', {
    filter,
    expand,
    sort: '-updated',
  });

  const mappedRecords = records.map(mapRestaurantListCollectionRecord);
  const recordsWithCounts = await hydrateRestaurantListCountSummaries(mappedRecords);
  if (scope !== 'my') {
    return recordsWithCounts;
  }

  return recordsWithCounts.sort((left, right) => {
    if (left.isDefault && !right.isDefault) {
      return -1;
    }

    if (!left.isDefault && right.isDefault) {
      return 1;
    }

    return right.updatedAt.localeCompare(left.updatedAt);
  });
}

export async function listRestaurantListsPage(
  input?: ListRestaurantListsPageInput,
): Promise<PaginatedResult<RestaurantListRecord>> {
  if (!pb.authStore.record?.id) {
    return createEmptyPaginatedResult(input);
  }

  const { page, pageSize } = resolvePaginationInput(input);
  const currentUserId = getAuthenticatedUserId();
  const escapedCurrentUserId = escapeFilterValue(currentUserId);
  const scope = input?.scope === 'friends' ? 'friends' : 'my';
  const searchFilter = buildSearchFilter(['name', 'description'], input?.search ?? '');

  let filter: string | undefined;
  let expand: string | undefined;

  if (scope === 'my') {
    filter = combineFilterClauses(`user = "${escapedCurrentUserId}"`, searchFilter);
  } else {
    const friendships = await listAcceptedFriendships();
    const friendIds = resolveAcceptedFriendIds(friendships, currentUserId);

    if (friendIds.length === 0) {
      return createEmptyPaginatedResult(input);
    }

    const matchingOwnerIds = input?.search?.trim()
      ? Array.from(
          new Set(
            (
              await listCollectionRecords<Pick<CollectionUserExpand, 'id'>>('users', {
                filter: buildSearchFilter(['name', 'email'], input.search) ?? undefined,
                fields: 'id',
              })
            )
              .map((record) => record.id)
              .filter((recordId) => friendIds.includes(recordId)),
          ),
        )
      : [];

    const friendFilter = friendIds.map((friendId) => `user = "${escapeFilterValue(friendId)}"`).join(' || ');
    const ownerSearchFilter = matchingOwnerIds.length > 0 ? buildOrFilter('user', matchingOwnerIds) : undefined;
    const combinedSearchFilter =
      searchFilter && ownerSearchFilter
        ? `(${searchFilter} || ${ownerSearchFilter})`
        : searchFilter ?? ownerSearchFilter;
    filter = combineFilterClauses(`(${friendFilter})`, `visibility = "friends"`, combinedSearchFilter);
    expand = 'user';
  }

  const pageResult = await listCollectionPage<RestaurantListCollectionRecord>('restaurant_lists', {
    page,
    pageSize,
    filter,
    expand,
    sort: scope === 'my' ? '-isDefault,-updated' : '-updated',
  });

  const mappedItems = pageResult.items.map(mapRestaurantListCollectionRecord);
  const itemsWithCounts = await hydrateRestaurantListCountSummaries(mappedItems);
  return mapPaginatedResult(pageResult, itemsWithCounts);
}

export async function getRestaurantListById(listId: string): Promise<RestaurantListRecord | null> {
  if (!pb.authStore.record?.id) {
    return null;
  }

  try {
    const record = await pb.collection('restaurant_lists').getOne<RestaurantListCollectionRecord>(listId, {
      expand: 'user',
    });
    return mapRestaurantListCollectionRecord(record);
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }
    throw error;
  }
}

export async function createDefaultRestaurantList(): Promise<RestaurantListRecord> {
  return trackFeatureMutation('restaurant_list.default.create', async () => {
    const currentUserId = getAuthenticatedUserId();
    const escapedCurrentUserId = escapeFilterValue(currentUserId);

    const existingDefault = await pb.collection('restaurant_lists').getList<RestaurantListCollectionRecord>(1, 1, {
      filter: `user = "${escapedCurrentUserId}" && isDefault = true`,
      sort: '-updated',
      expand: 'user',
    });

    const existingRecord = existingDefault.items[0];
    if (existingRecord) {
      return mapRestaurantListCollectionRecord(existingRecord);
    }

    const createdRecord = await pb.collection('restaurant_lists').create<RestaurantListCollectionRecord>(
      {
        name: 'Saved',
        description: 'Items saved from other lists',
        visibility: 'private',
        user: currentUserId,
        isDefault: true,
      },
      {
        expand: 'user',
      },
    );

    return mapRestaurantListCollectionRecord(createdRecord);
  });
}

export async function createRestaurantList(input: CreateRestaurantListInput): Promise<RestaurantListRecord> {
  return trackFeatureMutation(
    'restaurant_list.create',
    async () => {
      const currentUserId = getAuthenticatedUserId();
      const trimmedName = input.name.trim();
      const visibility = normalizeListVisibility(input.visibility);
      if (!trimmedName) {
        throw new Error('List name is required.');
      }

      const createdRecord = await pb.collection('restaurant_lists').create<RestaurantListCollectionRecord>(
        {
          name: trimmedName,
          description: input.description?.trim() || '',
          visibility,
          user: currentUserId,
        },
        {
          expand: 'user',
        },
      );

      return mapRestaurantListCollectionRecord(createdRecord);
    },
    {
      visibility: normalizeListVisibility(input.visibility),
      hasDescription: Boolean(input.description?.trim()),
    },
  );
}

export async function updateRestaurantList(
  listId: string,
  updates: UpdateRestaurantListInput,
): Promise<RestaurantListRecord> {
  return trackFeatureMutation(
    'restaurant_list.update',
    async () => {
      getAuthenticatedUserId();

      const payload: Record<string, unknown> = {};
      if (updates.name !== undefined) {
        const trimmedName = updates.name.trim();
        if (!trimmedName) {
          throw new Error('List name is required.');
        }
        payload.name = trimmedName;
      }

      if (updates.description !== undefined) {
        payload.description = updates.description.trim();
      }

      if (updates.visibility !== undefined) {
        payload.visibility = normalizeListVisibility(updates.visibility);
      }

      const existingRecord = await pb.collection('restaurant_lists').getOne<RestaurantListCollectionRecord>(listId, {
        expand: 'user',
      });

      if (existingRecord.isDefault === true && Object.keys(payload).length > 0) {
        throw new Error('The Saved list cannot be edited.');
      }

      const updatedRecord =
        Object.keys(payload).length > 0
          ? await pb.collection('restaurant_lists').update<RestaurantListCollectionRecord>(listId, payload, {
              expand: 'user',
            })
          : existingRecord;

      return mapRestaurantListCollectionRecord(updatedRecord);
    },
    {
      hasNameUpdate: updates.name !== undefined,
      hasDescriptionUpdate: updates.description !== undefined,
      hasVisibilityUpdate: updates.visibility !== undefined,
    },
  );
}

export async function deleteRestaurantList(listId: string): Promise<void> {
  return trackFeatureMutation('restaurant_list.delete', async () => {
    getAuthenticatedUserId();

    try {
      await pb.collection('restaurant_lists').delete(listId);
    } catch (error) {
      if (isNotFoundError(error)) {
        return;
      }
      throw error;
    }
  });
}

export async function listRestaurantListItemsPage(
  listId: string,
  input?: PaginationInput,
): Promise<PaginatedResult<RestaurantListItemRecord>> {
  if (!pb.authStore.record?.id) {
    return createEmptyPaginatedResult(input);
  }

  const { page, pageSize } = resolvePaginationInput(input);
  const pageResult = await listCollectionPage<ListItemCollectionRecord>('list_items', {
    page,
    pageSize,
    filter: `list = "${escapeFilterValue(listId)}"`,
    expand: 'restaurant,sourceUser,foodItem.visit,foodItem.user,userFoodItem.visit,userFoodItem.user,recommendedItems.visit,recommendedItems.user',
    sort: 'position,-created',
  });

  return mapPaginatedResult(pageResult, pageResult.items.map(mapListItemCollectionRecord));
}

export async function listRestaurantListItemLinks(listId: string): Promise<RestaurantListItemLinkRecord[]> {
  if (!pb.authStore.record?.id) {
    return [];
  }

  const escapedListId = escapeFilterValue(listId);
  const records = await listCollectionRecords<ListItemCollectionRecord>('list_items', {
    filter: `list = "${escapedListId}"`,
    fields: RESTAURANT_LIST_ITEM_LINK_FIELDS,
  });

  return records.map(mapRestaurantListItemLinkRecord);
}

export async function listRestaurantListItemLinksForRestaurantIds(
  listId: string,
  restaurantIds: string[],
): Promise<RestaurantListItemLinkRecord[]> {
  if (!pb.authStore.record?.id || restaurantIds.length === 0) {
    return [];
  }

  const records = await listCollectionRecords<ListItemCollectionRecord>('list_items', {
    filter: combineFilterClauses(`list = "${escapeFilterValue(listId)}"`, buildOrFilter('restaurant', restaurantIds)),
    fields: RESTAURANT_LIST_ITEM_LINK_FIELDS,
  });

  return records.map(mapRestaurantListItemLinkRecord);
}

export async function listRestaurantListNotesForRestaurantIds(
  listId: string,
  restaurantIds: string[],
): Promise<RestaurantListRestaurantNoteRecord[]> {
  if (!pb.authStore.record?.id || restaurantIds.length === 0) {
    return [];
  }

  const records = await listCollectionRecords<Pick<ListItemCollectionRecord, 'restaurant' | 'note' | 'position'>>(
    'list_items',
    {
      filter: combineFilterClauses(`list = "${escapeFilterValue(listId)}"`, buildOrFilter('restaurant', restaurantIds)),
      fields: 'restaurant,note,position',
      sort: 'position',
    },
  );

  const noteByRestaurantId = new Map<string, RestaurantListRestaurantNoteRecord>();
  for (const record of records) {
    const trimmedNote = record.note?.trim();
    if (!trimmedNote || noteByRestaurantId.has(record.restaurant)) {
      continue;
    }

    noteByRestaurantId.set(record.restaurant, {
      restaurantId: record.restaurant,
      note: trimmedNote,
    });
  }

  return Array.from(noteByRestaurantId.values());
}

export async function listMyBookmarkedListItemLinksForFoodItemIds(
  foodItemIds: string[],
): Promise<RestaurantListItemLinkRecord[]> {
  if (!pb.authStore.record?.id || foodItemIds.length === 0) {
    return [];
  }

  const currentUserId = getAuthenticatedUserId();
  const normalizedFoodItemIds = Array.from(new Set(foodItemIds.map((id) => id.trim()).filter((id) => id.length > 0)));
  if (normalizedFoodItemIds.length === 0) {
    return [];
  }

  const linksById = new Map<string, RestaurantListItemLinkRecord>();
  const itemChunkSize = 20;
  const escapedCurrentUserId = escapeFilterValue(currentUserId);
  for (let itemIndex = 0; itemIndex < normalizedFoodItemIds.length; itemIndex += itemChunkSize) {
    const itemChunk = normalizedFoodItemIds.slice(itemIndex, itemIndex + itemChunkSize);
    const lookupFilter = buildRestaurantListItemLinkFoodItemLookupFilter(itemChunk);
    if (!lookupFilter) {
      continue;
    }

    const records = await listCollectionRecords<ListItemCollectionRecord>('list_items', {
      filter: combineFilterClauses(`list.user = "${escapedCurrentUserId}"`, lookupFilter),
      fields: RESTAURANT_LIST_ITEM_LINK_FIELDS,
    });

    for (const record of records) {
      const link = mapRestaurantListItemLinkRecord(record);
      linksById.set(link.id, link);
    }
  }

  return Array.from(linksById.values());
}

export async function getRestaurantListItemCounts(
  listIds: string[],
): Promise<Record<string, RestaurantListCountSummary>> {
  const counts = Object.fromEntries(
    listIds.map((listId) => [
      listId,
      {
        restaurantCount: 0,
        menuItemCount: 0,
      },
    ]),
  );
  if (!pb.authStore.record?.id || listIds.length === 0) {
    return counts;
  }

  const restaurantIdsByList = new Map<string, Set<string>>();
  for (const listId of listIds) {
    restaurantIdsByList.set(listId, new Set<string>());
  }

  const chunkSize = 20;
  for (let index = 0; index < listIds.length; index += chunkSize) {
    const chunk = listIds.slice(index, index + chunkSize);
    const chunkItems = await listCollectionRecords<Pick<ListItemCollectionRecord, 'list' | 'restaurant'>>(
      'list_items',
      {
        filter: buildOrFilter('list', chunk),
        fields: 'list,restaurant',
      },
    );

    for (const item of chunkItems) {
      if (counts[item.list] !== undefined) {
        counts[item.list].menuItemCount += 1;
        const restaurantSet = restaurantIdsByList.get(item.list);
        if (restaurantSet && item.restaurant) {
          restaurantSet.add(item.restaurant);
        }
      }
    }
  }

  for (const [listId, restaurantIds] of restaurantIdsByList.entries()) {
    if (counts[listId] !== undefined) {
      counts[listId].restaurantCount = restaurantIds.size;
    }
  }

  return counts;
}

async function hydrateRestaurantListCountSummaries(
  lists: RestaurantListRecord[],
): Promise<RestaurantListRecord[]> {
  if (lists.length === 0) {
    return lists;
  }

  try {
    const countsByListId = await getRestaurantListItemCounts(lists.map((list) => list.id));
    return lists.map((list) => ({
      ...list,
      restaurantCount: countsByListId[list.id]?.restaurantCount ?? 0,
      menuItemCount: countsByListId[list.id]?.menuItemCount ?? 0,
    }));
  } catch {
    return lists;
  }
}

export async function saveRestaurantFoodItemToList(input: SaveRestaurantFoodItemToListInput): Promise<void> {
  return trackFeatureMutation(
    'restaurant_list.food_item.save',
    async () => {
      const currentUserId = getAuthenticatedUserId();
      const listId = input.listId.trim();
      const restaurantId = input.restaurantId.trim();
      const foodItemId = input.foodItemId.trim();
      const sourceUserId = input.sourceUserId?.trim() || undefined;
      const trimmedNote = input.note?.trim() || undefined;

      if (!listId) {
        throw new Error('List is required.');
      }

      if (!restaurantId) {
        throw new Error('Restaurant is required.');
      }

      if (!foodItemId) {
        throw new Error('Food item is required.');
      }

      const list = await pb.collection('restaurant_lists').getOne<RestaurantListCollectionRecord>(listId, {
        fields: 'id,user',
      });
      if (list.user !== currentUserId) {
        throw new Error('You can only save items to your own lists.');
      }

      await pb.collection('restaurants').getOne<RestaurantCollectionRecord>(restaurantId, { fields: 'id' });
      await pb.collection('food_items').getOne<FoodItemCollectionRecord>(foodItemId, { fields: 'id' });

      const escapedListId = escapeFilterValue(listId);
      const escapedRestaurantId = escapeFilterValue(restaurantId);
      const escapedFoodItemId = escapeFilterValue(foodItemId);
      const existingItem = await pb.collection('list_items').getList<ListItemCollectionRecord>(1, 1, {
        filter: `list = "${escapedListId}" && restaurant = "${escapedRestaurantId}" && foodItem = "${escapedFoodItemId}"`,
        fields: 'id',
      });
      if (existingItem.totalItems > 0) {
        return;
      }

      const itemsWithHighestPosition = await pb.collection('list_items').getList<ListItemCollectionRecord>(1, 1, {
        filter: `list = "${escapedListId}"`,
        sort: '-position',
        fields: 'position',
      });
      const nextPosition = (itemsWithHighestPosition.items[0]?.position ?? 0) + 1;

      await pb.collection('list_items').create<ListItemCollectionRecord>({
        list: listId,
        restaurant: restaurantId,
        addedBy: currentUserId,
        sourceUser: sourceUserId,
        foodItem: foodItemId,
        position: nextPosition,
        note: trimmedNote,
      });
    },
    {
      hasSourceUser: Boolean(input.sourceUserId?.trim()),
      hasNote: Boolean(input.note?.trim()),
    },
  );
}

export async function linkVisitToListBookmark(input: LinkVisitToListBookmarkInput): Promise<void> {
  return trackFeatureMutation('restaurant_list.bookmark.link', async () => {
    const currentUserId = getAuthenticatedUserId();
    const listItemId = input.listItemId.trim();
    const userFoodItemId = input.userFoodItemId.trim();

    if (!listItemId) {
      throw new Error('List item is required.');
    }

    if (!userFoodItemId) {
      throw new Error('Food item is required.');
    }

    const [listItem, userFoodItem] = await Promise.all([
      pb.collection('list_items').getOne<ListItemCollectionRecord>(listItemId, {
        fields: 'id,list,addedBy',
      }),
      pb.collection('food_items').getOne<FoodItemCollectionRecord>(userFoodItemId, {
        fields: 'id,user',
      }),
    ]);

    if (userFoodItem.user !== currentUserId) {
      throw new Error('You can only link your own rated items.');
    }

    const list = await pb.collection('restaurant_lists').getOne<RestaurantListCollectionRecord>(listItem.list, {
      fields: 'id,user',
    });
    const canUpdateListItem = list.user === currentUserId || listItem.addedBy === currentUserId;
    if (!canUpdateListItem) {
      throw new Error('You can only link bookmarks in your own lists.');
    }

    await pb.collection('list_items').update<ListItemCollectionRecord>(listItemId, {
      userFoodItem: userFoodItemId,
    });
  });
}

export async function addRestaurantToList(
  listId: string,
  restaurantName: string,
  city?: string,
): Promise<RestaurantListItemRecord> {
  return trackFeatureMutation(
    'restaurant_list.restaurant.add',
    async () => {
      const currentUserId = getAuthenticatedUserId();
      const trimmedName = restaurantName.trim();
      if (!trimmedName) {
        throw new Error('Restaurant name is required.');
      }

      const escapedListId = escapeFilterValue(listId);

      // Ensure the list exists and is accessible to the current user.
      await pb.collection('restaurant_lists').getOne<RestaurantListCollectionRecord>(listId);

      const restaurant = await findOrCreateRestaurantByName(trimmedName, currentUserId, city);
      const escapedRestaurantId = escapeFilterValue(restaurant.id);

      const existingItems = await pb.collection('list_items').getList<ListItemCollectionRecord>(1, 1, {
        filter: `list = "${escapedListId}" && restaurant = "${escapedRestaurantId}"`,
        expand: 'restaurant',
      });
      if (existingItems.totalItems > 0 && existingItems.items[0]) {
        return mapListItemCollectionRecord(existingItems.items[0]);
      }

      const itemsWithHighestPosition = await pb.collection('list_items').getList<ListItemCollectionRecord>(1, 1, {
        filter: `list = "${escapedListId}"`,
        sort: '-position',
      });
      const nextPosition = (itemsWithHighestPosition.items[0]?.position ?? 0) + 1;

      const createdItem = await pb.collection('list_items').create<ListItemCollectionRecord>(
        {
          list: listId,
          restaurant: restaurant.id,
          addedBy: currentUserId,
          position: nextPosition,
        },
        {
          expand: 'restaurant',
        },
      );

      return mapListItemCollectionRecord(createdItem);
    },
    {
      hasCity: Boolean(city?.trim()),
    },
  );
}

export async function addRestaurantVisitRatingsToList(
  input: AddRestaurantVisitRatingsToListInput,
): Promise<void> {
  return trackFeatureMutation(
    'restaurant_list.visit_ratings.add',
    async () => {
      const currentUserId = getAuthenticatedUserId();
      const listId = input.listId.trim();
      const restaurantId = input.restaurantId.trim();

      if (!listId) {
        throw new Error('List is required.');
      }

      if (!restaurantId) {
        throw new Error('Restaurant is required.');
      }

      await pb.collection('restaurant_lists').getOne<RestaurantListCollectionRecord>(listId);
      await pb.collection('restaurants').getOne<RestaurantCollectionRecord>(restaurantId);

      const escapedListId = escapeFilterValue(listId);
      const escapedRestaurantId = escapeFilterValue(restaurantId);

      const existingItems = await listCollectionRecords<
        Pick<ListItemCollectionRecord, 'id' | 'foodItem' | 'userFoodItem' | 'recommendedItems'>
      >('list_items', {
        filter: `list = "${escapedListId}" && restaurant = "${escapedRestaurantId}"`,
        fields: 'id,foodItem,userFoodItem,recommendedItems',
      });

      const existingFoodItemIds = new Set<string>();
      for (const item of existingItems) {
        if (item.foodItem?.trim()) {
          existingFoodItemIds.add(item.foodItem.trim());
        }

        if (item.userFoodItem?.trim()) {
          existingFoodItemIds.add(item.userFoodItem.trim());
        }

        for (const recommendedItemId of item.recommendedItems ?? []) {
          if (recommendedItemId?.trim()) {
            existingFoodItemIds.add(recommendedItemId.trim());
          }
        }
      }

      const uniqueRequestedFoodItemIds = Array.from(
        new Set((input.foodItemIds ?? []).map((itemId) => itemId.trim()).filter((itemId) => itemId.length > 0)),
      );
      const newFoodItemIds = uniqueRequestedFoodItemIds.filter((itemId) => !existingFoodItemIds.has(itemId));
      const noteProvided = input.note !== undefined;
      const trimmedNote = input.note?.trim() ?? '';
      const firstExistingItemId = existingItems[0]?.id;

      if (noteProvided && firstExistingItemId) {
        await pb.collection('list_items').update(firstExistingItemId, {
          note: trimmedNote,
        });

        if (newFoodItemIds.length === 0) {
          return;
        }
      }

      if (newFoodItemIds.length === 0 && existingItems.length > 0) {
        return;
      }

      const highestPositionItem = await pb.collection('list_items').getList<ListItemCollectionRecord>(1, 1, {
        filter: `list = "${escapedListId}"`,
        sort: '-position',
        fields: 'position',
      });
      let nextPosition = (highestPositionItem.items[0]?.position ?? 0) + 1;

      if (newFoodItemIds.length === 0) {
        await pb.collection('list_items').create<ListItemCollectionRecord>({
          list: listId,
          restaurant: restaurantId,
          addedBy: currentUserId,
          position: nextPosition,
          note: noteProvided ? trimmedNote : undefined,
        });
        return;
      }

      for (let index = 0; index < newFoodItemIds.length; index += 1) {
        const foodItemId = newFoodItemIds[index];
        const shouldAttachNote = !firstExistingItemId && index === 0 && noteProvided;
        await pb.collection('list_items').create<ListItemCollectionRecord>({
          list: listId,
          restaurant: restaurantId,
          addedBy: currentUserId,
          position: nextPosition,
          foodItem: foodItemId,
          note: shouldAttachNote ? trimmedNote : undefined,
        });
        nextPosition += 1;
      }
    },
    {
      requestedFoodItemCount: input.foodItemIds?.length ?? 0,
      hasNote: Boolean(input.note?.trim()),
    },
  );
}

export async function moveRestaurantListRestaurant(
  input: MoveRestaurantListRestaurantInput,
): Promise<void> {
  return trackFeatureMutation(
    'restaurant_list.restaurant.move',
    async () => {
      const currentUserId = getAuthenticatedUserId();
      const listId = input.listId.trim();
      const restaurantId = input.restaurantId.trim();
      const direction = input.direction;

      if (!listId) {
        throw new Error('List is required.');
      }

      if (!restaurantId) {
        throw new Error('Restaurant is required.');
      }

      if (direction !== 'up' && direction !== 'down') {
        throw new Error('Direction must be up or down.');
      }

      const list = await pb.collection('restaurant_lists').getOne<RestaurantListCollectionRecord>(listId, {
        fields: 'id,user',
      });
      if (list.user !== currentUserId) {
        throw new Error('You can only reorder restaurants in your own lists.');
      }

      const listItems = await listCollectionRecords<Pick<ListItemCollectionRecord, 'id' | 'restaurant' | 'position' | 'created'>>(
        'list_items',
        {
          filter: `list = "${escapeFilterValue(listId)}"`,
          sort: 'position,created',
          fields: 'id,restaurant,position,created',
        },
      );

      if (listItems.length < 2) {
        return;
      }

      const listItemIdsByRestaurant = new Map<
        string,
        Pick<ListItemCollectionRecord, 'id' | 'restaurant' | 'position' | 'created'>[]
      >();
      const restaurantOrder: string[] = [];
      for (const item of listItems) {
        const existingItems = listItemIdsByRestaurant.get(item.restaurant);
        if (existingItems) {
          existingItems.push(item);
          continue;
        }

        listItemIdsByRestaurant.set(item.restaurant, [item]);
        restaurantOrder.push(item.restaurant);
      }

      const currentIndex = restaurantOrder.indexOf(restaurantId);
      if (currentIndex === -1) {
        return;
      }

      const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
      if (targetIndex < 0 || targetIndex >= restaurantOrder.length) {
        return;
      }

      const [movedRestaurantId] = restaurantOrder.splice(currentIndex, 1);
      if (!movedRestaurantId) {
        return;
      }
      restaurantOrder.splice(targetIndex, 0, movedRestaurantId);

      const reorderedItems: Pick<ListItemCollectionRecord, 'id' | 'restaurant' | 'position' | 'created'>[] = [];
      for (const orderedRestaurantId of restaurantOrder) {
        const itemsForRestaurant = listItemIdsByRestaurant.get(orderedRestaurantId);
        if (!itemsForRestaurant) {
          continue;
        }
        reorderedItems.push(...itemsForRestaurant);
      }

      for (let index = 0; index < reorderedItems.length; index += 1) {
        const listItem = reorderedItems[index];
        if (!listItem) {
          continue;
        }

        const nextPosition = index + 1;
        if (listItem.position === nextPosition) {
          continue;
        }

        await pb.collection('list_items').update<ListItemCollectionRecord>(listItem.id, {
          position: nextPosition,
        });
      }
    },
    {
      direction: input.direction,
    },
  );
}

export async function removeRestaurantFromList(
  listId: string,
  listItemId: string,
): Promise<void> {
  return trackFeatureMutation('restaurant_list.restaurant.remove', async () => {
    getAuthenticatedUserId();

    try {
      const listItem = await pb.collection('list_items').getOne<ListItemCollectionRecord>(listItemId);
      if (listItem.list !== listId) {
        throw new Error('List item not found.');
      }

      await pb.collection('list_items').delete(listItemId);
    } catch (error) {
      if (isNotFoundError(error)) {
        return;
      }
      throw error;
    }
  });
}

export async function removeRestaurantListSourceRating(
  input: RemoveRestaurantListSourceRatingInput,
): Promise<void> {
  return trackFeatureMutation('restaurant_list.source_rating.remove', async () => {
    getAuthenticatedUserId();

    const listId = input.listId.trim();
    const listItemId = input.listItemId.trim();
    const foodItemId = input.foodItemId.trim();
    if (!listId || !listItemId || !foodItemId) {
      throw new Error('List item and food item are required.');
    }

    try {
      const listItem = await pb.collection('list_items').getOne<ListItemCollectionRecord>(listItemId, {
        fields: 'id,list,foodItem,recommendedItems,userFoodItem,sourceUser',
      });

      if (listItem.list !== listId) {
        throw new Error('List item not found.');
      }

      let nextFoodItem = listItem.foodItem?.trim() || '';
      let nextUserFoodItem = listItem.userFoodItem?.trim() || '';
      let nextSourceUser = listItem.sourceUser?.trim() || '';
      let nextRecommendedItems = (listItem.recommendedItems ?? [])
        .map((itemId) => itemId?.trim())
        .filter((itemId): itemId is string => Boolean(itemId));

      const isPrimaryFoodItem = nextFoodItem === foodItemId;
      const hasLegacyFoodItem = nextRecommendedItems.includes(foodItemId);

      if (!isPrimaryFoodItem && !hasLegacyFoodItem) {
        return;
      }

      if (isPrimaryFoodItem) {
        nextFoodItem = '';
      } else {
        nextRecommendedItems = nextRecommendedItems.filter((itemId) => itemId !== foodItemId);
      }

      const hasSourceItems = Boolean(nextFoodItem) || nextRecommendedItems.length > 0;
      if (!hasSourceItems) {
        if (nextUserFoodItem) {
          // Keep the row by promoting the linked user rating to primary foodItem.
          nextFoodItem = nextUserFoodItem;
          nextUserFoodItem = '';
          nextSourceUser = '';
        } else {
          await pb.collection('list_items').delete(listItemId);
          return;
        }
      }

      await pb.collection('list_items').update<ListItemCollectionRecord>(listItemId, {
        foodItem: nextFoodItem || null,
        recommendedItems: nextRecommendedItems,
        sourceUser: nextSourceUser || null,
        userFoodItem: nextUserFoodItem || null,
      });
    } catch (error) {
      if (isNotFoundError(error)) {
        return;
      }
      throw error;
    }
  });
}

export async function removeRestaurantListUserRating(listId: string, listItemId: string): Promise<void> {
  return trackFeatureMutation('restaurant_list.user_rating.remove', async () => {
    getAuthenticatedUserId();

    const trimmedListId = listId.trim();
    const trimmedListItemId = listItemId.trim();
    if (!trimmedListId || !trimmedListItemId) {
      throw new Error('List item is required.');
    }

    try {
      const listItem = await pb.collection('list_items').getOne<ListItemCollectionRecord>(trimmedListItemId, {
        fields: 'id,list,foodItem,recommendedItems,userFoodItem',
      });

      if (listItem.list !== trimmedListId) {
        throw new Error('List item not found.');
      }

      if (!listItem.userFoodItem?.trim()) {
        return;
      }

      const hasSourceItems =
        Boolean(listItem.foodItem?.trim()) ||
        (listItem.recommendedItems ?? []).some((itemId) => Boolean(itemId?.trim()));

      if (!hasSourceItems) {
        await pb.collection('list_items').delete(trimmedListItemId);
        return;
      }

      await pb.collection('list_items').update<ListItemCollectionRecord>(trimmedListItemId, {
        userFoodItem: null,
      });
    } catch (error) {
      if (isNotFoundError(error)) {
        return;
      }
      throw error;
    }
  });
}

export async function listAcceptedFriendships(): Promise<AcceptedFriendshipRecord[]> {
  if (!pb.authStore.record?.id) {
    return [];
  }

  const currentUserId = getAuthenticatedUserId();
  const escapedCurrentUserId = escapeFilterValue(currentUserId);
  return listCollectionRecords<AcceptedFriendshipRecord>('friendships', {
    filter: `(user = "${escapedCurrentUserId}" || friend = "${escapedCurrentUserId}") && status = "accepted"`,
    fields: 'user,friend',
  });
}

export async function listMenuItemsForRestaurant(restaurantId: string): Promise<MenuItemRecord[]> {
  if (!pb.authStore.record?.id) {
    return [];
  }

  const trimmedRestaurantId = restaurantId.trim();
  if (!trimmedRestaurantId) {
    return [];
  }

  return listCollectionRecords<MenuItemRecord>('menu_items', {
    filter: `restaurant = "${escapeFilterValue(trimmedRestaurantId)}"`,
    sort: '-created',
  });
}

export async function hasPendingMenuReviewRequest(restaurantId: string): Promise<boolean> {
  if (!pb.authStore.record?.id) {
    return false;
  }

  const trimmedRestaurantId = restaurantId.trim();
  if (!trimmedRestaurantId) {
    return false;
  }

  return (
    await getCollectionCount(
      'menu_review_requests',
      `restaurant = "${escapeFilterValue(trimmedRestaurantId)}" && status = "pending"`,
    )
  ) > 0;
}

export async function getNoteById(noteId: string): Promise<NoteRecord | null> {
  if (!pb.authStore.record?.id) {
    return null;
  }

  try {
    const record = await pb.collection('notes').getOne<NoteCollectionRecord>(noteId, {
      expand: 'restaurant',
    });
    return mapNoteCollectionRecord(record);
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }
    throw error;
  }
}

export async function createNote(input: CreateNoteInput): Promise<NoteRecord> {
  return trackFeatureMutation(
    'note.create',
    async () => {
      const currentUserId = getAuthenticatedUserId();
      const content = buildNoteContent(input.title, input.content);
      if (!content) {
        throw new Error('Note content is required.');
      }

      const payload: Record<string, unknown> = {
        user: currentUserId,
        content,
        status: 'draft',
      };

      const record = await pb.collection('notes').create<NoteCollectionRecord>(
        payload,
        {
          expand: 'restaurant',
        },
      );

      await uploadNotePhotos(record.id, currentUserId, input.photos ?? []);

      return mapNoteCollectionRecord(record);
    },
    {
      photoCount: input.photos?.length ?? 0,
      hasRating: input.rating !== undefined,
    },
  );
}

export async function updateNote(noteId: string, updates: UpdateNoteInput): Promise<NoteRecord> {
  return trackFeatureMutation(
    'note.update',
    async () => {
      const currentUserId = getAuthenticatedUserId();
      const payload: Record<string, unknown> = {};

      if (updates.title !== undefined || updates.content !== undefined) {
        const content = buildNoteContent(updates.title, updates.content);
        if (!content) {
          throw new Error('Note content is required.');
        }

        payload.content = content;
      }

      payload.location_text = '';
      payload.latitude = null;
      payload.longitude = null;

      if (updates.deletePhotoIds && updates.deletePhotoIds.length > 0) {
        for (const photoId of updates.deletePhotoIds) {
          try {
            await pb.collection('note_photos').delete(photoId);
          } catch (error) {
            if (!isNotFoundError(error)) {
              throw error;
            }
          }
        }
      }

      const record =
        Object.keys(payload).length > 0
          ? await pb.collection('notes').update<NoteCollectionRecord>(noteId, payload, {
              expand: 'restaurant',
            })
          : await pb.collection('notes').getOne<NoteCollectionRecord>(noteId, {
              expand: 'restaurant',
            });

      await uploadNotePhotos(noteId, currentUserId, updates.newPhotos ?? []);

      return mapNoteCollectionRecord(record);
    },
    {
      hasContentUpdate: updates.title !== undefined || updates.content !== undefined,
      clearsLegacyLocationData: true,
      newPhotoCount: updates.newPhotos?.length ?? 0,
      deletePhotoCount: updates.deletePhotoIds?.length ?? 0,
    },
  );
}

export async function deleteNote(noteId: string): Promise<void> {
  return trackFeatureMutation('note.delete', async () => {
    try {
      await pb.collection('notes').delete(noteId);
    } catch (error) {
      if (isNotFoundError(error)) {
        return;
      }
      throw error;
    }
  });
}

export async function listNotePhotosForNote(noteId: string): Promise<NotePhotoRecord[]> {
  const trimmedNoteId = noteId.trim();
  if (!trimmedNoteId) {
    return [];
  }

  return listNotePhotosForNoteIds([trimmedNoteId]);
}

export async function listNotePhotosForNoteIds(noteIds: string[]): Promise<NotePhotoRecord[]> {
  if (!pb.authStore.record?.id || noteIds.length === 0) {
    return [];
  }

  const records: NotePhotoRecord[] = [];
  const chunkSize = 20;
  for (let index = 0; index < noteIds.length; index += chunkSize) {
    const chunk = noteIds.slice(index, index + chunkSize);
    const chunkRecords = await listCollectionRecords<NotePhotoRecord>('note_photos', {
      filter: buildOrFilter('note', chunk),
      sort: 'created',
      fields: 'id,note,photo,created',
    });
    records.push(...chunkRecords);
  }

  return records;
}

export async function listNotesPage(input?: ListNotesPageInput): Promise<PaginatedResult<NoteRecord>> {
  if (!pb.authStore.record?.id) {
    return createEmptyPaginatedResult(input);
  }

  const { page, pageSize } = resolvePaginationInput(input);
  const currentUserId = getAuthenticatedUserId();
  const escapedCurrentUserId = escapeFilterValue(currentUserId);
  const status = input?.status === 'draft' || input?.status === 'used' ? input.status : 'all';
  const filter =
    status === 'all'
      ? `user = "${escapedCurrentUserId}"`
      : `user = "${escapedCurrentUserId}" && status = "${status}"`;

  const pageResult = await listCollectionPage<NoteCollectionRecord>('notes', {
    page,
    pageSize,
    filter,
    expand: 'restaurant',
    sort: '-updated,-created',
  });

  return mapPaginatedResult(pageResult, pageResult.items.map(mapNoteCollectionRecord));
}

export async function getNoteCountSummary(): Promise<NoteCountSummary> {
  if (!pb.authStore.record?.id) {
    return {
      allCount: 0,
      draftCount: 0,
      usedCount: 0,
    };
  }

  return sendApiRequest<NoteCountSummary>('/api/notes/summary', {
    method: 'GET',
  });
}

export async function listFriendsPage(input?: ListFriendsPageInput): Promise<PaginatedResult<FriendRecord>> {
  if (!pb.authStore.record?.id) {
    return createEmptyPaginatedResult(input);
  }

  const { page, pageSize } = resolvePaginationInput(input);
  const section = input?.section ?? 'friends';
  const normalizedSearch = input?.search?.trim();
  const normalizedUserIds = Array.from(new Set((input?.userIds ?? []).map((userId) => userId.trim()).filter(Boolean)));

  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    section,
  });
  if (normalizedSearch) {
    query.set('search', normalizedSearch);
  }
  if (normalizedUserIds.length > 0) {
    query.set('userIds', normalizedUserIds.join(','));
  }

  const response = await sendApiRequest<FriendListApiResponse>(`/api/friends?${query.toString()}`, {
    method: 'GET',
  });

  return {
    items: response.items.map(mapFriendListApiItem),
    page: response.page,
    pageSize: response.pageSize,
    totalItems: response.totalItems,
    totalPages: response.totalPages,
    hasNextPage: response.hasNextPage,
  };
}

export async function listFriendsByUserIds(userIds: string[]): Promise<FriendRecord[]> {
  if (!pb.authStore.record?.id) {
    return [];
  }

  const normalizedUserIds = Array.from(new Set(userIds.map((userId) => userId.trim()).filter(Boolean)));
  if (normalizedUserIds.length === 0) {
    return [];
  }

  const items: FriendRecord[] = [];
  for (let index = 0; index < normalizedUserIds.length; index += 100) {
    const userIdChunk = normalizedUserIds.slice(index, index + 100);
    const response = await listFriendsPage({
      section: 'friends',
      page: 1,
      pageSize: userIdChunk.length,
      userIds: userIdChunk,
    });
    items.push(...response.items);
  }

  return items;
}

export async function getFriendsCountSummary(): Promise<FriendsCountSummary> {
  if (!pb.authStore.record?.id) {
    return {
      friendsCount: 0,
      requestsCount: 0,
      sentCount: 0,
    };
  }

  return sendApiRequest<FriendsCountSummary>('/api/friends/summary', {
    method: 'GET',
  });
}

export async function inviteFriend(input: InviteFriendInput): Promise<FriendRecord> {
  return trackFeatureMutation('friend.invite', async () => {
    const currentUserId = getAuthenticatedUserId();
    const normalizedCode = input.code.trim().toUpperCase();

    if (!normalizedCode) {
      throw new Error('Friend code is required.');
    }

    const response = await pb.send<FriendCodeLookupResponse>(
      `/api/users/by-friend-code/${encodeURIComponent(normalizedCode)}`,
      { method: 'GET' },
    );

    if (!response?.found || !response.user?.id) {
      throw new Error('Friend code not found.');
    }

    if (response.user.id === currentUserId) {
      throw new Error('Cannot add yourself as a friend.');
    }

    const existing = await pb.collection('friendships').getList<FriendshipRecord>(1, 1, {
      filter: `(user = "${currentUserId}" && friend = "${response.user.id}") || (user = "${response.user.id}" && friend = "${currentUserId}")`,
    });

    if (existing.totalItems > 0) {
      throw new Error('Friend request already exists.');
    }

    const createdFriendship = await pb.collection('friendships').create<FriendshipRecord>(
      {
        user: currentUserId,
        friend: response.user.id,
        status: 'pending',
      },
      {
        expand: 'user,friend',
      },
    );

    const mapped = mapFriendshipRecord(createdFriendship, currentUserId);
    if (mapped) {
      return mapped;
    }

    return {
      id: createdFriendship.id,
      userId: response.user.id,
      name: resolveFriendName(response.user),
      email: resolveFriendEmail(response.user),
      status: 'pending_sent',
      createdAt: createdFriendship.created,
    };
  });
}

export async function createFriendSuggestionAcceptance(input: { inviterId: string }): Promise<void> {
  return trackFeatureMutation('friend.suggestion.accept', async () => {
    const inviterId = input.inviterId.trim();

    if (!inviterId) {
      return;
    }

    await sendApiRequest('/api/friends/suggestions/accept', {
      method: 'POST',
      body: JSON.stringify({
        inviterId,
      }),
    });
  });
}

export async function markFriendInviteAccepted(friendId: string): Promise<FriendRecord> {
  return trackFeatureMutation('friend.accept', async () => {
    const currentUserId = getAuthenticatedUserId();
    const updatedFriendship = await pb.collection('friendships').update<FriendshipRecord>(
      friendId,
      {
        status: 'accepted',
      },
      {
        expand: 'user,friend',
      },
    );

    const mapped = mapFriendshipRecord(updatedFriendship, currentUserId);
    if (!mapped) {
      throw new Error('Could not accept friend request.');
    }

    return mapped;
  });
}

export async function removeFriend(friendId: string): Promise<void> {
  return trackFeatureMutation('friend.remove', async () => {
    getAuthenticatedUserId();
    await pb.collection('friendships').delete(friendId);
  });
}

export async function getProfile(): Promise<ProfileRecord> {
  return localDomainStore.getProfile();
}

export async function updateProfile(updates: UpdateProfileInput): Promise<ProfileRecord> {
  return trackFeatureMutation(
    'profile.update',
    () => localDomainStore.updateProfile(updates),
    {
      hasDisplayNameUpdate: updates.displayName !== undefined,
      hasBioUpdate: updates.bio !== undefined,
      hasLocationUpdate: updates.location !== undefined,
      hasFavoriteCuisineUpdate: updates.favoriteCuisine !== undefined,
      hasMarketingPreferenceUpdate: updates.receiveMarketingEmails !== undefined,
    },
  );
}

export async function listFeedbackPage(input?: ListFeedbackPageInput): Promise<PaginatedResult<FeedbackRecord>> {
  if (!pb.authStore.record?.id) {
    return createEmptyPaginatedResult(input);
  }

  const { page, pageSize } = resolvePaginationInput(input);
  const currentUserId = getAuthenticatedUserId();
  const escapedCurrentUserId = escapeFilterValue(currentUserId);
  const statusFilter = input?.status ?? 'all';
  const statusClause =
    statusFilter === 'active'
      ? '(status = "open" || status = "in_progress")'
      : statusFilter === 'all'
        ? undefined
        : `status = "${statusFilter}"`;
  const filter = statusClause
    ? `user = "${escapedCurrentUserId}" && ${statusClause}`
    : `user = "${escapedCurrentUserId}"`;

  const pageResult = await listCollectionPage<FeedbackCollectionRecord>('feedback', {
    page,
    pageSize,
    filter,
    sort: '-last_message_at,-created',
    expand: 'user',
  });

  return mapPaginatedResult(pageResult, pageResult.items.map(mapFeedbackRecord));
}

export async function getFeedbackCountSummary(): Promise<FeedbackCountSummary> {
  if (!pb.authStore.record?.id) {
    return {
      allCount: 0,
      activeCount: 0,
    };
  }

  return sendApiRequest<FeedbackCountSummary>('/api/feedback/summary', {
    method: 'GET',
  });
}

export async function getRestaurantVisitStatsSummary(
  restaurantIds: string[],
): Promise<RestaurantVisitStatsSummary[]> {
  if (!pb.authStore.record?.id) {
    return [];
  }

  const normalizedRestaurantIds = Array.from(
    new Set(
      restaurantIds
        .map((restaurantId) => restaurantId.trim())
        .filter((restaurantId) => restaurantId.length > 0),
    ),
  ).sort();
  if (normalizedRestaurantIds.length === 0) {
    return [];
  }

  const response = await sendApiRequest<{ stats?: RestaurantVisitStatsSummary[] }>(
    '/api/restaurants/visit-stats',
    {
      method: 'POST',
      body: {
        restaurantIds: normalizedRestaurantIds,
      },
    },
  );

  return response.stats ?? [];
}

export async function getFeedbackById(feedbackId: string): Promise<FeedbackRecord> {
  const currentUserId = getAuthenticatedUserId();

  const record = await pb.collection('feedback').getOne<FeedbackCollectionRecord>(feedbackId, {
    expand: 'user',
  });

  const feedback = mapFeedbackRecord(record);
  if (feedback.userId !== currentUserId) {
    throw new Error('This feedback thread could not be found.');
  }

  return feedback;
}

export async function createFeedback(input: CreateFeedbackInput): Promise<FeedbackRecord> {
  return trackFeatureMutation(
    'feedback.create',
    async () => {
      const userId = getAuthenticatedUserId();

      const createdRecord = await pb.collection('feedback').create<FeedbackCollectionRecord>(
        {
          user: userId,
          title: input.title.trim(),
          description: input.description.trim(),
          status: 'open',
          admin_unread_count: 1,
          user_unread_count: 0,
          last_message_at: nowIso(),
        },
        {
          expand: 'user',
        },
      );

      return mapFeedbackRecord(createdRecord);
    },
    {
      hasTitle: Boolean(input.title.trim()),
      descriptionLength: input.description.trim().length,
    },
  );
}

export async function reportContent(input: ReportContentInput): Promise<ReportContentResult> {
  return trackFeatureMutation(
    'content.report',
    async () => {
      const recordId = input.recordId.trim();
      if (!recordId) {
        throw new Error('Record ID is required.');
      }

      return sendApiRequest<ReportContentResult>('/api/content-reports', {
        method: 'POST',
        body: {
          contentType: input.contentType,
          recordId,
          reasonCode: input.reasonCode,
          notes: input.notes?.trim() || undefined,
        },
      });
    },
    {
      contentType: input.contentType,
      hasNotes: Boolean(input.notes?.trim()),
      reasonCode: input.reasonCode,
    },
  );
}

export async function updateFeedbackStatus(
  feedbackId: string,
  status: FeedbackRecord['status'],
): Promise<FeedbackRecord> {
  return trackFeatureMutation(
    'feedback.status.update',
    async () => {
      if (!isCurrentUserAdmin()) {
        throw new Error('Only admins can update feedback status.');
      }

      const updated = await pb.collection('feedback').update<FeedbackCollectionRecord>(
        feedbackId,
        {
          status,
        },
        {
          expand: 'user',
        },
      );

      return mapFeedbackRecord(updated);
    },
    {
      status,
    },
  );
}

export async function listFeedbackMessages(feedbackId: string): Promise<FeedbackMessageRecord[]> {
  const records = await listCollectionRecords<FeedbackMessageCollectionRecord>('feedback_messages', {
    filter: `feedback = "${escapeFilterValue(feedbackId)}"`,
    sort: 'created',
    expand: 'user',
  });

  return records.map(mapFeedbackMessageRecord);
}

export async function listFeedbackMessagesPage(
  feedbackId: string,
  input?: ListFeedbackMessagesPageInput,
): Promise<PaginatedResult<FeedbackMessageRecord>> {
  const { page, pageSize } = resolvePaginationInput(input);
  const order = input?.order === 'asc' ? 'asc' : 'desc';
  const pageResult = await listCollectionPage<FeedbackMessageCollectionRecord>('feedback_messages', {
    page,
    pageSize,
    filter: `feedback = "${escapeFilterValue(feedbackId)}"`,
    sort: order === 'asc' ? 'created' : '-created',
    expand: 'user',
  });

  return mapPaginatedResult(pageResult, pageResult.items.map(mapFeedbackMessageRecord));
}

export async function markFeedbackAsRead(feedbackId: string): Promise<boolean> {
  return trackFeatureMutation('feedback.mark_read', async () => {
    const feedback = await getFeedbackById(feedbackId);
    if (feedback.userUnreadCount > 0) {
      await pb.collection('feedback').update(feedbackId, {
        user_unread_count: 0,
      });
      return true;
    }

    return false;
  });
}

export async function sendFeedbackMessage(input: SendFeedbackMessageInput): Promise<void> {
  return trackFeatureMutation(
    'feedback.message.send',
    async () => {
      const userId = getAuthenticatedUserId();
      const trimmedMessage = input.message.trim();

      if (!trimmedMessage) {
        throw new Error('Message is required.');
      }

      const feedback = await getFeedbackById(input.feedbackId);

      await pb.collection('feedback_messages').create({
        feedback: input.feedbackId,
        user: userId,
        message: trimmedMessage,
        is_admin_message: false,
      });

      const feedbackUpdate: Record<string, string | number> = {
        last_message_at: nowIso(),
        admin_unread_count: feedback.adminUnreadCount + 1,
      };

      const hasActiveAssignedAdmin =
        Boolean(feedback.assignedAdminId) &&
        (!feedback.adminReplyDeadlineAt || new Date(feedback.adminReplyDeadlineAt).getTime() > Date.now());

      if (hasActiveAssignedAdmin) {
        feedbackUpdate.admin_reply_deadline_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      }

      await pb.collection('feedback').update(input.feedbackId, feedbackUpdate);
    },
    {
      messageLength: input.message.trim().length,
    },
  );
}

export async function listTastingSessions(): Promise<TastingSessionRecord[]> {
  return localDomainStore.listTastingSessions();
}

export async function getTastingSessionById(sessionId: string): Promise<TastingSessionRecord | null> {
  return localDomainStore.getTastingSessionById(sessionId);
}

export async function createTastingSession(
  input: CreateTastingSessionInput,
): Promise<TastingSessionRecord> {
  return trackFeatureMutation(
    'tasting_session.create',
    () => localDomainStore.createTastingSession(input),
    {
      hasRestaurantName: Boolean(input.restaurantName.trim()),
      hasSessionName: Boolean(input.name.trim()),
    },
  );
}

export async function joinTastingSession(input: JoinTastingSessionInput): Promise<TastingSessionRecord> {
  return trackFeatureMutation(
    'tasting_session.join',
    () => localDomainStore.joinTastingSession(input),
    {
      inviteCodeLength: input.inviteCode.trim().length,
    },
  );
}

export async function regenerateTastingInviteCode(sessionId: string): Promise<TastingSessionRecord> {
  return trackFeatureMutation('tasting_session.invite_code.regenerate', () =>
    localDomainStore.regenerateTastingInviteCode(sessionId),
  );
}

export async function addTastingItem(
  sessionId: string,
  input: AddTastingItemInput,
): Promise<TastingSessionRecord> {
  return trackFeatureMutation(
    'tasting_session.item.add',
    () => localDomainStore.addTastingItem(sessionId, input),
    {
      hasDescription: Boolean(input.description?.trim()),
    },
  );
}

export async function deleteTastingItem(
  sessionId: string,
  itemId: string,
  requesterParticipantId: string,
): Promise<TastingSessionRecord> {
  return trackFeatureMutation('tasting_session.item.delete', () =>
    localDomainStore.deleteTastingItem(sessionId, itemId, requesterParticipantId),
  );
}

export async function submitTastingRating(
  sessionId: string,
  itemId: string,
  input: SubmitTastingRatingInput,
): Promise<TastingSessionRecord> {
  return trackFeatureMutation(
    'tasting_session.rating.submit',
    () => localDomainStore.submitTastingRating(sessionId, itemId, input),
    {
      rating: input.rating,
      hasNote: Boolean(input.note?.trim()),
    },
  );
}

export async function setTastingSessionStatus(
  sessionId: string,
  status: TastingSessionStatus,
): Promise<TastingSessionRecord> {
  return trackFeatureMutation(
    'tasting_session.status.update',
    () => localDomainStore.setTastingSessionStatus(sessionId, status),
    {
      status,
    },
  );
}

export async function saveTastingResultsToVisitHistory(
  sessionId: string,
): Promise<VisitRecord> {
  return trackFeatureMutation('tasting_session.results.save_to_visit', () =>
    localDomainStore.saveTastingResultsToVisitHistory(sessionId),
  );
}

export async function listBillSummaries(): Promise<BillListSummary[]> {
  if (!pb.authStore.record?.id) {
    return [];
  }

  const response = await sendApiRequest<BillListSummaryApiResponseItem[]>('/api/bills/summary', {
    method: 'GET',
  });

  return response.map(mapBillListSummaryApiItem);
}

export async function getBillById(billId: string): Promise<BillRecord | null> {
  if (!pb.authStore.record?.id) {
    return null;
  }

  try {
    const bill = await pb.collection('bills').getOne<BillCollectionRecord>(billId);
    return mapBillWithRelations(bill);
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }

    throw error;
  }
}

export async function createBill(input: CreateBillInput): Promise<BillRecord> {
  return trackFeatureMutation(
    'bill.create',
    async () => {
      const currentUserId = getAuthenticatedUserId();
      const trimmedTitle = input.title.trim();

      if (!trimmedTitle) {
        throw new Error('Bill title is required.');
      }

      const normalizedTax = sanitizeCurrency(input.tax);
      const normalizedTip = sanitizeCurrency(input.tip);
      const normalizedFees = sanitizeCurrency(input.fees);
      const subtotal = input.items.reduce((sum, item) => sum + sanitizeCurrency(item.price), 0);
      const computedTotalAmount = sanitizeCurrency(subtotal + normalizedTax + normalizedTip + normalizedFees);
      const totalAmount = typeof input.totalAmount === 'number' && Number.isFinite(input.totalAmount)
        ? sanitizeCurrency(input.totalAmount)
        : computedTotalAmount;

      const createdBill = await pb.collection('bills').create<BillCollectionRecord>({
        creator_user: currentUserId,
        bill_name: trimmedTitle,
        total_amount: totalAmount,
        tax: normalizedTax,
        tip: normalizedTip,
        fees: normalizedFees,
        split_mode: input.extrasSplitMode === 'equal' ? 'even' : 'itemized',
        extras_split_mode: input.extrasSplitMode,
        status: toBillCollectionStatus(input.participants),
      });

      const participantIdLookup = new Map<string, string>();
      const createdParticipants = await Promise.all(
        input.participants.map(async (participant) => {
          const createdParticipant = await pb.collection('bill_participants').create<BillParticipantCollectionRecord>({
            bill: createdBill.id,
            user: participant.userId?.trim() ? participant.userId : null,
            participant_name: participant.name.trim() || undefined,
            amount_owed: sanitizeCurrency(participant.amountOwed),
            paid_status: participant.paidStatus,
            paid_date: participant.paidStatus === 'paid' ? nowIso() : null,
            custom_tip_contribution:
              typeof participant.customTipContribution === 'number'
                ? sanitizeCurrency(participant.customTipContribution)
                : null,
          });
          participantIdLookup.set(participant.id, createdParticipant.id);
          return createdParticipant;
        }),
      );

      for (const item of input.items) {
        const mappedParticipantIds = item.assignedToParticipantIds
          .map((participantId) => participantIdLookup.get(participantId))
          .filter((candidate): candidate is string => Boolean(candidate));
        const normalizedSplitMode = item.splitMode === 'advanced' ? 'advanced' : 'simple';
        const mappedSplitConfig =
          normalizedSplitMode === 'advanced' && Array.isArray(item.splitConfig)
            ? item.splitConfig
                .map((splitConfig) => {
                  const mappedParticipantId = participantIdLookup.get(splitConfig.participantId);
                  if (!mappedParticipantId) {
                    return null;
                  }

                  if (splitConfig.type !== 'percentage' && splitConfig.type !== 'amount') {
                    return null;
                  }

                  return {
                    participant_id: mappedParticipantId,
                    type: splitConfig.type,
                    value: sanitizeCurrency(splitConfig.value),
                  };
                })
                .filter(
                  (candidate): candidate is { participant_id: string; type: 'percentage' | 'amount'; value: number } =>
                    candidate !== null,
                )
            : null;

        const assignedToParticipantIds =
          mappedParticipantIds.length > 0
            ? mappedParticipantIds
            : createdParticipants.map((participant) => participant.id);

        await pb.collection('bill_items').create<BillItemCollectionRecord>({
          bill: createdBill.id,
          item_name: item.itemName.trim(),
          price: sanitizeCurrency(item.price),
          assigned_to: assignedToParticipantIds,
          split_mode: normalizedSplitMode,
          split_config: normalizedSplitMode === 'advanced' ? mappedSplitConfig : null,
        });
      }

      const hydratedBill = await getBillById(createdBill.id);
      if (!hydratedBill) {
        throw new Error('Bill was created but could not be loaded.');
      }

      return hydratedBill;
    },
    {
      itemCount: input.items.length,
      participantCount: input.participants.length,
      extrasSplitMode: input.extrasSplitMode,
    },
  );
}

export async function updateBill(billId: string, updates: UpdateBillInput): Promise<BillRecord> {
  return trackFeatureMutation(
    'bill.update',
    async () => {
      const currentBill = await getBillById(billId);
      if (!currentBill) {
        throw new Error('Bill not found.');
      }

      const nextTitle = updates.title?.trim() ?? currentBill.title;
      const nextItems = updates.items ?? currentBill.items;
      const nextParticipants = updates.participants ?? currentBill.participants;
      const nextTax = sanitizeCurrency(updates.tax ?? currentBill.tax);
      const nextTip = sanitizeCurrency(updates.tip ?? currentBill.tip);
      const nextFees = sanitizeCurrency(updates.fees ?? currentBill.fees);
      const nextSubtotal = nextItems.reduce((sum, item) => sum + sanitizeCurrency(item.price), 0);
      const computedNextTotalAmount = sanitizeCurrency(nextSubtotal + nextTax + nextTip + nextFees);
      const nextTotalAmount = typeof updates.totalAmount === 'number' && Number.isFinite(updates.totalAmount)
        ? sanitizeCurrency(updates.totalAmount)
        : computedNextTotalAmount;
      const nextStatus: BillCollectionRecord['status'] =
        updates.status !== undefined
          ? toBillCollectionStatusFromRecord(updates.status)
          : updates.participants
            ? toBillCollectionStatus(nextParticipants)
            : toBillCollectionStatusFromRecord(currentBill.status);

      await pb.collection('bills').update<BillCollectionRecord>(billId, {
        bill_name: nextTitle,
        total_amount: nextTotalAmount,
        tax: nextTax,
        tip: nextTip,
        fees: nextFees,
        extras_split_mode: updates.extrasSplitMode ?? currentBill.extrasSplitMode,
        status: nextStatus,
      });

      const participantIdRemap = new Map<string, string>();
      const participantIdsToDelete: string[] = [];

      if (updates.participants) {
        const existingParticipants = await listBillParticipantsForBillId(billId);
        const existingParticipantIds = new Set(existingParticipants.map((participant) => participant.id));
        const retainedParticipantIds = new Set<string>();

        for (const participant of updates.participants) {
          const participantPayload = {
            bill: billId,
            user: participant.userId?.trim() ? participant.userId : null,
            participant_name: participant.name.trim() || undefined,
            amount_owed: sanitizeCurrency(participant.amountOwed),
            paid_status: participant.paidStatus,
            paid_date: participant.paidStatus === 'paid' ? nowIso() : null,
            custom_tip_contribution:
              typeof participant.customTipContribution === 'number'
                ? sanitizeCurrency(participant.customTipContribution)
                : null,
          };

          if (existingParticipantIds.has(participant.id)) {
            retainedParticipantIds.add(participant.id);
            participantIdRemap.set(participant.id, participant.id);
            await pb
              .collection('bill_participants')
              .update<BillParticipantCollectionRecord>(participant.id, participantPayload);
            continue;
          }

          const createdParticipant = await pb.collection('bill_participants').create<BillParticipantCollectionRecord>(
            participantPayload,
          );
          retainedParticipantIds.add(createdParticipant.id);
          participantIdRemap.set(participant.id, createdParticipant.id);
        }

        existingParticipants.forEach((existingParticipant) => {
          if (retainedParticipantIds.has(existingParticipant.id)) {
            return;
          }

          participantIdsToDelete.push(existingParticipant.id);
        });
      }

      if (updates.items) {
        const existingItems = await listBillItemsForBillId(billId);
        const existingItemIds = new Set(existingItems.map((item) => item.id));
        const retainedItemIds = new Set<string>();
        const mapParticipantId = (participantId: string): string => participantIdRemap.get(participantId) ?? participantId;

        for (const item of updates.items) {
          const normalizedSplitMode = item.splitMode === 'advanced' ? 'advanced' : 'simple';
          const normalizedSplitConfig =
            normalizedSplitMode === 'advanced' && Array.isArray(item.splitConfig)
              ? item.splitConfig
                  .filter(
                    (entry): entry is { participantId: string; type: 'percentage' | 'amount'; value: number } =>
                      Boolean(entry.participantId) &&
                      (entry.type === 'percentage' || entry.type === 'amount') &&
                      Number.isFinite(entry.value),
                  )
                  .map((entry) => {
                    const mappedParticipantId = mapParticipantId(entry.participantId);
                    return {
                      participant_id: mappedParticipantId,
                      type: entry.type,
                      value: sanitizeCurrency(entry.value),
                    };
                  })
                  .filter((entry) => Boolean(entry.participant_id))
              : null;
          const normalizedAssignedToIds = item.assignedToParticipantIds
            .map((participantId) => mapParticipantId(participantId))
            .filter(
              (participantId, index, collection) =>
                Boolean(participantId) && collection.indexOf(participantId) === index,
            );

          const itemPayload = {
            bill: billId,
            item_name: item.itemName.trim(),
            price: sanitizeCurrency(item.price),
            assigned_to: normalizedAssignedToIds,
            split_mode: normalizedSplitMode,
            split_config: normalizedSplitMode === 'advanced' ? normalizedSplitConfig : null,
          };

          if (existingItemIds.has(item.id)) {
            retainedItemIds.add(item.id);
            await pb.collection('bill_items').update<BillItemCollectionRecord>(item.id, itemPayload);
            continue;
          }

          const createdItem = await pb.collection('bill_items').create<BillItemCollectionRecord>(itemPayload);
          retainedItemIds.add(createdItem.id);
        }

        await Promise.all(
          existingItems.map(async (existingItem) => {
            if (retainedItemIds.has(existingItem.id)) {
              return;
            }
            await pb.collection('bill_items').delete(existingItem.id);
          }),
        );
      }

      if (!updates.items && participantIdsToDelete.length > 0) {
        const removedParticipantIdSet = new Set(participantIdsToDelete);
        const existingItems = await listBillItemsForBillId(billId);

        await Promise.all(
          existingItems.map(async (existingItem) => {
            const nextAssignedTo = Array.isArray(existingItem.assigned_to)
              ? existingItem.assigned_to.filter((participantId) => !removedParticipantIdSet.has(participantId))
              : [];
            const nextSplitConfig =
              existingItem.split_mode === 'advanced' && Array.isArray(existingItem.split_config)
                ? existingItem.split_config.filter(
                    (splitEntry) => !removedParticipantIdSet.has(splitEntry.participant_id),
                  )
                : null;

            await pb.collection('bill_items').update<BillItemCollectionRecord>(existingItem.id, {
              assigned_to: nextAssignedTo,
              split_config: existingItem.split_mode === 'advanced' ? nextSplitConfig : null,
            });
          }),
        );
      }

      if (participantIdsToDelete.length > 0) {
        await Promise.all(
          participantIdsToDelete.map(async (participantId) => {
            try {
              await pb.collection('bill_participants').delete(participantId);
            } catch (error) {
              if (isNotFoundError(error)) {
                return;
              }

              throw error;
            }
          }),
        );
      }

      const hydratedBill = await getBillById(billId);
      if (!hydratedBill) {
        throw new Error('Updated bill could not be loaded.');
      }

      return hydratedBill;
    },
    {
      hasTitleUpdate: updates.title !== undefined,
      hasItemsUpdate: updates.items !== undefined,
      hasParticipantsUpdate: updates.participants !== undefined,
      hasTotalAmountUpdate: updates.totalAmount !== undefined,
      hasTaxUpdate: updates.tax !== undefined,
      hasTipUpdate: updates.tip !== undefined,
      hasFeesUpdate: updates.fees !== undefined,
      hasExtrasSplitModeUpdate: updates.extrasSplitMode !== undefined,
      hasStatusUpdate: updates.status !== undefined,
      itemCount: updates.items?.length,
      participantCount: updates.participants?.length,
    },
  );
}

export async function deleteBill(billId: string): Promise<void> {
  return trackFeatureMutation('bill.delete', async () => {
    const [participants, items] = await Promise.all([
      listBillParticipantsForBillId(billId),
      listBillItemsForBillId(billId),
    ]);

    await Promise.all(
      items.map(async (item) => {
        try {
          await pb.collection('bill_items').delete(item.id);
        } catch (error) {
          if (isNotFoundError(error)) {
            return;
          }
          throw error;
        }
      }),
    );

    await Promise.all(
      participants.map(async (participant) => {
        try {
          await pb.collection('bill_participants').delete(participant.id);
        } catch (error) {
          if (isNotFoundError(error)) {
            return;
          }
          throw error;
        }
      }),
    );

    try {
      await pb.collection('bills').delete(billId);
    } catch (error) {
      if (isNotFoundError(error)) {
        return;
      }
      throw error;
    }
  });
}

export async function markBillParticipantPaid(
  billId: string,
  participantId: string,
  paidStatus: BillParticipantRecord['paidStatus'],
): Promise<BillRecord> {
  return trackFeatureMutation(
    'bill.participant.mark_paid',
    async () => {
      await pb.collection('bill_participants').update<BillParticipantCollectionRecord>(participantId, {
        paid_status: paidStatus,
        paid_date: paidStatus === 'paid' ? nowIso() : null,
      });

      const participants = await listBillParticipantsForBillId(billId);
      const nextStatus: BillCollectionRecord['status'] =
        participants.every((participant) => participant.paid_status === 'paid') ? 'settled' : 'active';

      await pb.collection('bills').update<BillCollectionRecord>(billId, {
        status: nextStatus,
      });

      const hydratedBill = await getBillById(billId);
      if (!hydratedBill) {
        throw new Error('Updated bill could not be loaded.');
      }

      return hydratedBill;
    },
    {
      paidStatus,
    },
  );
}

export function createEntityId(prefix: string): string {
  return createId(prefix);
}
