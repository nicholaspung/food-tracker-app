import AsyncStorage from '@react-native-async-storage/async-storage';

import { pb } from '../../lib/pocketbase';
import type {
  BillItemRecord,
  BillParticipantRecord,
  BillRecord,
  FeedbackMessageRecord,
  FeatureStore,
  FeedbackRecord,
  FriendRecord,
  FriendStatus,
  NoteRecord,
  PhotoDraftAsset,
  PhotoProcessingDraft,
  ProfileRecord,
  QuickTrackRecord,
  RestaurantListRecord,
  RestaurantRecord,
  TastingSessionParticipant,
  TastingSessionRating,
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
    notes?: string;
  }[];
  visitedAt?: string;
  source?: VisitRecord['source'];
}

export interface UpdateVisitInput {
  restaurantName?: string;
  items?: VisitItem[];
  visitedAt?: string;
}

export interface CreateQuickTrackInput {
  restaurantName: string;
  itemName: string;
  rating: number;
  notes?: string;
  sourceNoteId?: string;
}

export interface UpdateQuickTrackInput {
  restaurantName?: string;
  itemName?: string;
  rating?: number;
  notes?: string;
}

export interface CreateRestaurantListInput {
  name: string;
  description?: string;
}

export interface UpdateRestaurantListInput {
  name?: string;
  description?: string;
}

export interface CreateNoteInput {
  title: string;
  content: string;
  rating?: number;
}

export interface UpdateNoteInput {
  title?: string;
  content?: string;
  rating?: number;
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
  tax?: number;
  tip?: number;
  fees?: number;
  extrasSplitMode?: BillRecord['extrasSplitMode'];
}

function nowIso(): string {
  return new Date().toISOString();
}

function daysAgoIso(daysAgo: number): string {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString();
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
  const fallbackEmail = `${id}@invite.local`;

  return {
    id,
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
    friends: [
      {
        id: createId('friend'),
        name: 'Taylor Lin',
        email: 'taylor@example.com',
        status: 'friend',
        createdAt: daysAgoIso(38),
      },
      {
        id: createId('friend'),
        name: 'Chris Park',
        email: 'chris@example.com',
        status: 'friend',
        createdAt: daysAgoIso(21),
      },
      {
        id: createId('friend'),
        name: 'Meri',
        email: 'meri@example.com',
        status: 'pending_received',
        createdAt: daysAgoIso(6),
      },
      {
        id: createId('friend'),
        name: 'Madi',
        email: 'madi@example.com',
        status: 'pending_sent',
        createdAt: daysAgoIso(3),
      },
    ],
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
  user?: FriendshipUser;
}

interface FeedbackCollectionUserExpand {
  id: string;
  name?: string;
  email?: string;
}

interface FeedbackCollectionRecord {
  id: string;
  user: string;
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

function mapFeedbackRecord(record: FeedbackCollectionRecord): FeedbackRecord {
  return {
    id: record.id,
    userId: record.user,
    userName: record.expand?.user?.name,
    userEmail: record.expand?.user?.email,
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
    userName: record.expand?.user?.name,
    userEmail: record.expand?.user?.email,
    message: record.message,
    isAdminMessage: record.is_admin_message === true,
    createdAt: record.created,
  };
}

function isCurrentUserAdmin(): boolean {
  return pb.authStore.record?.isAdmin === true;
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

function resolveFriendEmail(user: FriendshipUser | undefined, fallbackId: string): string {
  const trimmedEmail = user?.email?.trim().toLowerCase();
  return trimmedEmail || `${fallbackId}@friend.local`;
}

function mapFriendshipRecord(friendship: FriendshipRecord, currentUserId: string): FriendRecord | null {
  if (friendship.status === 'blocked') {
    return null;
  }

  const isSender = friendship.user === currentUserId;
  const otherUserId = isSender ? friendship.friend : friendship.user;
  const otherUser = isSender ? friendship.expand?.friend : friendship.expand?.user;

  const status: FriendStatus =
    friendship.status === 'accepted'
      ? 'friend'
      : friendship.friend === currentUserId
        ? 'pending_received'
        : 'pending_sent';

  return {
    id: friendship.id,
    name: resolveFriendName(otherUser),
    email: resolveFriendEmail(otherUser, otherUserId),
    status,
    createdAt: friendship.created,
  };
}

export async function listVisits(): Promise<VisitRecord[]> {
  const store = await getStore();
  return mapAndSortByDateDescending(store.visits);
}

export async function getVisitById(visitId: string): Promise<VisitRecord | null> {
  const store = await getStore();
  return store.visits.find((visit) => visit.id === visitId) ?? null;
}

export async function createVisit(input: CreateVisitInput): Promise<VisitRecord> {
  return mutateStore((store) => {
    const timestamp = nowIso();
    const visit: VisitRecord = {
      id: createId('visit'),
      restaurantName: input.restaurantName.trim(),
      visitedAt: input.visitedAt ?? timestamp,
      source: input.source ?? 'visit',
      items: input.items.map((item) => ({
        id: createId('visit_item'),
        name: item.name,
        rating: item.rating,
        notes: item.notes,
      })),
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    upsertRestaurant(store, visit.restaurantName);
    store.visits.unshift(visit);
    return visit;
  });
}

export async function updateVisit(visitId: string, updates: UpdateVisitInput): Promise<VisitRecord> {
  return mutateStore((store) => {
    const index = store.visits.findIndex((visit) => visit.id === visitId);
    if (index < 0) {
      throw new Error('Visit not found.');
    }

    const currentVisit = store.visits[index];
    const nextVisit: VisitRecord = {
      ...currentVisit,
      restaurantName: updates.restaurantName?.trim() ?? currentVisit.restaurantName,
      visitedAt: updates.visitedAt ?? currentVisit.visitedAt,
      items: updates.items ?? currentVisit.items,
      updatedAt: nowIso(),
    };

    upsertRestaurant(store, nextVisit.restaurantName);
    store.visits[index] = nextVisit;
    return nextVisit;
  });
}

export async function listQuickTracks(): Promise<QuickTrackRecord[]> {
  const store = await getStore();
  return mapAndSortByDateDescending(store.quickTracks);
}

export async function getQuickTrackById(quickTrackId: string): Promise<QuickTrackRecord | null> {
  const store = await getStore();
  return store.quickTracks.find((quickTrack) => quickTrack.id === quickTrackId) ?? null;
}

export async function createQuickTrack(input: CreateQuickTrackInput): Promise<QuickTrackRecord> {
  return mutateStore((store) => {
    const timestamp = nowIso();
    const quickTrack: QuickTrackRecord = {
      id: createId('quick_track'),
      restaurantName: input.restaurantName.trim(),
      itemName: input.itemName.trim(),
      rating: input.rating,
      notes: input.notes,
      sourceNoteId: input.sourceNoteId,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    upsertRestaurant(store, quickTrack.restaurantName);
    store.quickTracks.unshift(quickTrack);
    return quickTrack;
  });
}

export async function updateQuickTrack(
  quickTrackId: string,
  updates: UpdateQuickTrackInput,
): Promise<QuickTrackRecord> {
  return mutateStore((store) => {
    const index = store.quickTracks.findIndex((quickTrack) => quickTrack.id === quickTrackId);
    if (index < 0) {
      throw new Error('Quick track record not found.');
    }

    const currentQuickTrack = store.quickTracks[index];
    const nextQuickTrack: QuickTrackRecord = {
      ...currentQuickTrack,
      restaurantName: updates.restaurantName?.trim() ?? currentQuickTrack.restaurantName,
      itemName: updates.itemName?.trim() ?? currentQuickTrack.itemName,
      rating: updates.rating ?? currentQuickTrack.rating,
      notes: updates.notes,
      updatedAt: nowIso(),
    };

    upsertRestaurant(store, nextQuickTrack.restaurantName);
    store.quickTracks[index] = nextQuickTrack;
    return nextQuickTrack;
  });
}

export async function deleteQuickTrack(quickTrackId: string): Promise<void> {
  await mutateStore((store) => {
    store.quickTracks = store.quickTracks.filter((quickTrack) => quickTrack.id !== quickTrackId);
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

export async function listRestaurants(): Promise<RestaurantRecord[]> {
  const store = await getStore();
  return [...store.restaurants].sort((left, right) => left.name.localeCompare(right.name));
}

export async function listRestaurantLists(): Promise<RestaurantListRecord[]> {
  const store = await getStore();
  return mapAndSortByDateDescending(store.restaurantLists);
}

export async function getRestaurantListById(listId: string): Promise<RestaurantListRecord | null> {
  const store = await getStore();
  return store.restaurantLists.find((list) => list.id === listId) ?? null;
}

export async function createRestaurantList(input: CreateRestaurantListInput): Promise<RestaurantListRecord> {
  return mutateStore((store) => {
    const timestamp = nowIso();
    const list: RestaurantListRecord = {
      id: createId('restaurant_list'),
      name: input.name.trim(),
      description: input.description?.trim(),
      restaurantIds: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    store.restaurantLists.unshift(list);
    return list;
  });
}

export async function updateRestaurantList(
  listId: string,
  updates: UpdateRestaurantListInput,
): Promise<RestaurantListRecord> {
  return mutateStore((store) => {
    const index = store.restaurantLists.findIndex((list) => list.id === listId);
    if (index < 0) {
      throw new Error('List not found.');
    }

    const currentList = store.restaurantLists[index];
    const nextList: RestaurantListRecord = {
      ...currentList,
      name: updates.name?.trim() ?? currentList.name,
      description: updates.description?.trim() ?? currentList.description,
      updatedAt: nowIso(),
    };

    store.restaurantLists[index] = nextList;
    return nextList;
  });
}

export async function deleteRestaurantList(listId: string): Promise<void> {
  await mutateStore((store) => {
    store.restaurantLists = store.restaurantLists.filter((list) => list.id !== listId);
  });
}

export async function addRestaurantToList(
  listId: string,
  restaurantName: string,
  city?: string,
): Promise<RestaurantListRecord> {
  return mutateStore((store) => {
    const listIndex = store.restaurantLists.findIndex((list) => list.id === listId);
    if (listIndex < 0) {
      throw new Error('List not found.');
    }

    const trimmedName = restaurantName.trim();
    const existingRestaurant = store.restaurants.find(
      (restaurant) => restaurant.name.toLowerCase() === trimmedName.toLowerCase(),
    );

    const restaurant: RestaurantRecord =
      existingRestaurant ?? {
        id: createId('restaurant'),
        name: trimmedName,
        city: city?.trim() || undefined,
      };

    if (!existingRestaurant) {
      store.restaurants.unshift(restaurant);
    }

    const currentList = store.restaurantLists[listIndex];
    if (!currentList.restaurantIds.includes(restaurant.id)) {
      currentList.restaurantIds.unshift(restaurant.id);
    }

    const updatedList: RestaurantListRecord = {
      ...currentList,
      updatedAt: nowIso(),
    };

    store.restaurantLists[listIndex] = updatedList;
    return updatedList;
  });
}

export async function removeRestaurantFromList(
  listId: string,
  restaurantId: string,
): Promise<RestaurantListRecord> {
  return mutateStore((store) => {
    const listIndex = store.restaurantLists.findIndex((list) => list.id === listId);
    if (listIndex < 0) {
      throw new Error('List not found.');
    }

    const currentList = store.restaurantLists[listIndex];
    const updatedList: RestaurantListRecord = {
      ...currentList,
      restaurantIds: currentList.restaurantIds.filter((id) => id !== restaurantId),
      updatedAt: nowIso(),
    };

    store.restaurantLists[listIndex] = updatedList;
    return updatedList;
  });
}

export async function listNotes(): Promise<NoteRecord[]> {
  const store = await getStore();
  return mapAndSortByDateDescending(store.notes);
}

export async function getNoteById(noteId: string): Promise<NoteRecord | null> {
  const store = await getStore();
  return store.notes.find((note) => note.id === noteId) ?? null;
}

export async function createNote(input: CreateNoteInput): Promise<NoteRecord> {
  return mutateStore((store) => {
    const timestamp = nowIso();
    const note: NoteRecord = {
      id: createId('note'),
      title: input.title.trim(),
      content: input.content.trim(),
      rating: input.rating,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    store.notes.unshift(note);
    return note;
  });
}

export async function updateNote(noteId: string, updates: UpdateNoteInput): Promise<NoteRecord> {
  return mutateStore((store) => {
    const index = store.notes.findIndex((note) => note.id === noteId);
    if (index < 0) {
      throw new Error('Note not found.');
    }

    const currentNote = store.notes[index];
    const nextNote: NoteRecord = {
      ...currentNote,
      title: updates.title?.trim() ?? currentNote.title,
      content: updates.content?.trim() ?? currentNote.content,
      rating: updates.rating,
      updatedAt: nowIso(),
    };

    store.notes[index] = nextNote;
    return nextNote;
  });
}

export async function deleteNote(noteId: string): Promise<void> {
  await mutateStore((store) => {
    store.notes = store.notes.filter((note) => note.id !== noteId);
  });
}

export async function listFriends(): Promise<FriendRecord[]> {
  if (!pb.authStore.record?.id) {
    return [];
  }

  const currentUserId = getAuthenticatedUserId();
  const friendships = await pb.collection('friendships').getFullList<FriendshipRecord>({
    filter: `user = "${currentUserId}" || friend = "${currentUserId}"`,
    expand: 'user,friend',
    sort: '-created',
  });

  return friendships
    .map((friendship) => mapFriendshipRecord(friendship, currentUserId))
    .filter((friend): friend is FriendRecord => friend !== null);
}

export async function inviteFriend(input: InviteFriendInput): Promise<FriendRecord> {
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
    name: resolveFriendName(response.user),
    email: resolveFriendEmail(response.user, response.user.id),
    status: 'pending_sent',
    createdAt: createdFriendship.created,
  };
}

export async function markFriendInviteAccepted(friendId: string): Promise<FriendRecord> {
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
}

export async function removeFriend(friendId: string): Promise<void> {
  getAuthenticatedUserId();
  await pb.collection('friendships').delete(friendId);
}

export async function getProfile(): Promise<ProfileRecord> {
  const store = await getStore();
  return store.profile;
}

export async function updateProfile(updates: UpdateProfileInput): Promise<ProfileRecord> {
  return mutateStore((store) => {
    const nextProfile: ProfileRecord = {
      ...store.profile,
      ...updates,
    };

    store.profile = nextProfile;
    return nextProfile;
  });
}

export async function listFeedback(options?: {
  status?: FeedbackStatusFilter;
}): Promise<FeedbackRecord[]> {
  getAuthenticatedUserId();

  const statusFilter = options?.status ?? 'all';
  const filter =
    statusFilter === 'active'
      ? '(status = "open" || status = "in_progress")'
      : statusFilter === 'all'
        ? undefined
        : `status = "${statusFilter}"`;

  const queryOptions: {
    filter?: string;
    sort: string;
    expand: string;
  } = {
    sort: '-last_message_at,-created',
    expand: 'user',
  };

  if (filter) {
    queryOptions.filter = filter;
  }

  const records = await pb.collection('feedback').getFullList<FeedbackCollectionRecord>(queryOptions);

  return records.map(mapFeedbackRecord);
}

export async function getFeedbackById(feedbackId: string): Promise<FeedbackRecord> {
  getAuthenticatedUserId();

  const record = await pb.collection('feedback').getOne<FeedbackCollectionRecord>(feedbackId, {
    expand: 'user',
  });

  return mapFeedbackRecord(record);
}

export async function createFeedback(input: CreateFeedbackInput): Promise<FeedbackRecord> {
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
}

export async function updateFeedbackStatus(
  feedbackId: string,
  status: FeedbackRecord['status'],
): Promise<FeedbackRecord> {
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
}

export async function listFeedbackMessages(feedbackId: string): Promise<FeedbackMessageRecord[]> {
  getAuthenticatedUserId();

  const records = await pb.collection('feedback_messages').getFullList<FeedbackMessageCollectionRecord>({
    filter: `feedback = "${feedbackId}"`,
    sort: 'created',
    expand: 'user',
  });

  return records.map(mapFeedbackMessageRecord);
}

export async function markFeedbackAsRead(feedbackId: string): Promise<boolean> {
  const feedback = await getFeedbackById(feedbackId);
  const isAdmin = isCurrentUserAdmin();

  if (isAdmin && feedback.adminUnreadCount > 0) {
    await pb.collection('feedback').update(feedbackId, {
      admin_unread_count: 0,
    });
    return true;
  }

  if (!isAdmin && feedback.userUnreadCount > 0) {
    await pb.collection('feedback').update(feedbackId, {
      user_unread_count: 0,
    });
    return true;
  }

  return false;
}

export async function sendFeedbackMessage(input: SendFeedbackMessageInput): Promise<void> {
  const userId = getAuthenticatedUserId();
  const isAdmin = isCurrentUserAdmin();
  const trimmedMessage = input.message.trim();

  if (!trimmedMessage) {
    throw new Error('Message is required.');
  }

  const feedback = await getFeedbackById(input.feedbackId);

  await pb.collection('feedback_messages').create({
    feedback: input.feedbackId,
    user: userId,
    message: trimmedMessage,
    is_admin_message: isAdmin,
  });

  if (isAdmin) {
    await pb.collection('feedback').update(input.feedbackId, {
      last_message_at: nowIso(),
      user_unread_count: feedback.userUnreadCount + 1,
    });
    return;
  }

  await pb.collection('feedback').update(input.feedbackId, {
    last_message_at: nowIso(),
    admin_unread_count: feedback.adminUnreadCount + 1,
  });
}

export async function listTastingSessions(): Promise<TastingSessionRecord[]> {
  const store = await getStore();
  return mapAndSortByDateDescending(store.tastingSessions);
}

export async function getTastingSessionById(sessionId: string): Promise<TastingSessionRecord | null> {
  const store = await getStore();
  return store.tastingSessions.find((session) => session.id === sessionId) ?? null;
}

export async function createTastingSession(
  input: CreateTastingSessionInput,
): Promise<TastingSessionRecord> {
  return mutateStore((store) => {
    const timestamp = nowIso();
    const hostParticipant: TastingSessionParticipant = {
      id: createId('participant'),
      userId: input.createdByUserId,
      name: input.createdByName,
      joinedAt: timestamp,
    };

    const session: TastingSessionRecord = {
      id: createId('tasting_session'),
      name: input.name.trim(),
      restaurantName: input.restaurantName.trim(),
      inviteCode: createInviteCode(),
      createdByUserId: input.createdByUserId,
      status: 'lobby',
      participants: [hostParticipant],
      items: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    upsertRestaurant(store, session.restaurantName);
    store.tastingSessions.unshift(session);
    return session;
  });
}

export async function joinTastingSession(input: JoinTastingSessionInput): Promise<TastingSessionRecord> {
  return mutateStore((store) => {
    const normalizedCode = input.inviteCode.trim().toUpperCase();
    const sessionIndex = store.tastingSessions.findIndex(
      (session) => session.inviteCode.toUpperCase() === normalizedCode,
    );

    if (sessionIndex < 0) {
      throw new Error('Invite code not found.');
    }

    const session = store.tastingSessions[sessionIndex];
    const existingParticipant = session.participants.find(
      (participant) => participant.userId === input.userId,
    );

    if (existingParticipant) {
      return session;
    }

    const nextParticipant: TastingSessionParticipant = {
      id: createId('participant'),
      userId: input.userId,
      name: input.participantName,
      joinedAt: nowIso(),
    };

    const updatedSession: TastingSessionRecord = {
      ...session,
      participants: [...session.participants, nextParticipant],
      updatedAt: nowIso(),
    };

    store.tastingSessions[sessionIndex] = updatedSession;
    return updatedSession;
  });
}

export async function regenerateTastingInviteCode(sessionId: string): Promise<TastingSessionRecord> {
  return mutateStore((store) => {
    const sessionIndex = store.tastingSessions.findIndex((session) => session.id === sessionId);
    if (sessionIndex < 0) {
      throw new Error('Session not found.');
    }

    const updatedSession: TastingSessionRecord = {
      ...store.tastingSessions[sessionIndex],
      inviteCode: createInviteCode(),
      updatedAt: nowIso(),
    };

    store.tastingSessions[sessionIndex] = updatedSession;
    return updatedSession;
  });
}

export async function addTastingItem(
  sessionId: string,
  input: AddTastingItemInput,
): Promise<TastingSessionRecord> {
  return mutateStore((store) => {
    const sessionIndex = store.tastingSessions.findIndex((session) => session.id === sessionId);
    if (sessionIndex < 0) {
      throw new Error('Session not found.');
    }

    const session = store.tastingSessions[sessionIndex];
    const item = {
      id: createId('tasting_item'),
      name: input.name.trim(),
      description: input.description?.trim(),
      createdByParticipantId: input.createdByParticipantId,
      ratings: [] as TastingSessionRating[],
      createdAt: nowIso(),
    };

    const updatedSession: TastingSessionRecord = {
      ...session,
      items: [...session.items, item],
      updatedAt: nowIso(),
    };

    store.tastingSessions[sessionIndex] = updatedSession;
    return updatedSession;
  });
}

export async function deleteTastingItem(
  sessionId: string,
  itemId: string,
  requesterParticipantId: string,
): Promise<TastingSessionRecord> {
  return mutateStore((store) => {
    const sessionIndex = store.tastingSessions.findIndex((session) => session.id === sessionId);
    if (sessionIndex < 0) {
      throw new Error('Session not found.');
    }

    const session = store.tastingSessions[sessionIndex];
    const item = session.items.find((sessionItem) => sessionItem.id === itemId);
    if (!item) {
      throw new Error('Item not found.');
    }

    if (item.createdByParticipantId !== requesterParticipantId) {
      throw new Error('Only the creator can delete this item.');
    }

    const updatedSession: TastingSessionRecord = {
      ...session,
      items: session.items.filter((sessionItem) => sessionItem.id !== itemId),
      updatedAt: nowIso(),
    };

    store.tastingSessions[sessionIndex] = updatedSession;
    return updatedSession;
  });
}

export async function submitTastingRating(
  sessionId: string,
  itemId: string,
  input: SubmitTastingRatingInput,
): Promise<TastingSessionRecord> {
  return mutateStore((store) => {
    const sessionIndex = store.tastingSessions.findIndex((session) => session.id === sessionId);
    if (sessionIndex < 0) {
      throw new Error('Session not found.');
    }

    const session = store.tastingSessions[sessionIndex];
    const updatedItems = session.items.map((item) => {
      if (item.id !== itemId) {
        return item;
      }

      const existingRatingIndex = item.ratings.findIndex(
        (rating) => rating.participantId === input.participantId,
      );

      const nextRating: TastingSessionRating = {
        participantId: input.participantId,
        rating: input.rating,
        note: input.note,
      };

      if (existingRatingIndex < 0) {
        return {
          ...item,
          ratings: [...item.ratings, nextRating],
        };
      }

      const nextRatings = [...item.ratings];
      nextRatings[existingRatingIndex] = nextRating;
      return {
        ...item,
        ratings: nextRatings,
      };
    });

    const updatedSession: TastingSessionRecord = {
      ...session,
      items: updatedItems,
      updatedAt: nowIso(),
    };

    store.tastingSessions[sessionIndex] = updatedSession;
    return updatedSession;
  });
}

export async function setTastingSessionStatus(
  sessionId: string,
  status: TastingSessionStatus,
): Promise<TastingSessionRecord> {
  return mutateStore((store) => {
    const sessionIndex = store.tastingSessions.findIndex((session) => session.id === sessionId);
    if (sessionIndex < 0) {
      throw new Error('Session not found.');
    }

    const updatedSession: TastingSessionRecord = {
      ...store.tastingSessions[sessionIndex],
      status,
      updatedAt: nowIso(),
    };

    store.tastingSessions[sessionIndex] = updatedSession;
    return updatedSession;
  });
}

export async function saveTastingResultsToVisitHistory(
  sessionId: string,
): Promise<VisitRecord> {
  return mutateStore((store) => {
    const session = store.tastingSessions.find((candidateSession) => candidateSession.id === sessionId);
    if (!session) {
      throw new Error('Session not found.');
    }

    const visitItems = session.items.map((item) => {
      const ratingSum = item.ratings.reduce((sum, rating) => sum + rating.rating, 0);
      const averageRating = item.ratings.length > 0 ? ratingSum / item.ratings.length : 0;

      return {
        id: createId('visit_item'),
        name: item.name,
        rating: Number(averageRating.toFixed(1)),
        notes: item.description,
      };
    });

    const timestamp = nowIso();
    const visit: VisitRecord = {
      id: createId('visit'),
      restaurantName: session.restaurantName,
      visitedAt: timestamp,
      source: 'tasting-result',
      items: visitItems,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    store.visits.unshift(visit);
    return visit;
  });
}

function toBillStatus(participants: BillParticipantRecord[]): BillRecord['status'] {
  return participants.every((participant) => participant.paidStatus === 'paid') ? 'settled' : 'open';
}

export async function listBills(): Promise<BillRecord[]> {
  const store = await getStore();
  return mapAndSortByDateDescending(store.bills);
}

export async function getBillById(billId: string): Promise<BillRecord | null> {
  const store = await getStore();
  return store.bills.find((bill) => bill.id === billId) ?? null;
}

export async function createBill(input: CreateBillInput): Promise<BillRecord> {
  return mutateStore((store) => {
    const timestamp = nowIso();
    const bill: BillRecord = {
      id: createId('bill'),
      title: input.title.trim(),
      restaurantName: input.restaurantName.trim(),
      createdByUserId: input.createdByUserId,
      items: input.items,
      participants: input.participants,
      tax: input.tax,
      tip: input.tip,
      fees: input.fees,
      extrasSplitMode: input.extrasSplitMode,
      status: toBillStatus(input.participants),
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    upsertRestaurant(store, bill.restaurantName);
    store.bills.unshift(bill);
    return bill;
  });
}

export async function updateBill(billId: string, updates: UpdateBillInput): Promise<BillRecord> {
  return mutateStore((store) => {
    const billIndex = store.bills.findIndex((bill) => bill.id === billId);
    if (billIndex < 0) {
      throw new Error('Bill not found.');
    }

    const currentBill = store.bills[billIndex];
    const participants = updates.participants ?? currentBill.participants;

    const nextBill: BillRecord = {
      ...currentBill,
      title: updates.title?.trim() ?? currentBill.title,
      restaurantName: updates.restaurantName?.trim() ?? currentBill.restaurantName,
      items: updates.items ?? currentBill.items,
      participants,
      tax: updates.tax ?? currentBill.tax,
      tip: updates.tip ?? currentBill.tip,
      fees: updates.fees ?? currentBill.fees,
      extrasSplitMode: updates.extrasSplitMode ?? currentBill.extrasSplitMode,
      status: toBillStatus(participants),
      updatedAt: nowIso(),
    };

    upsertRestaurant(store, nextBill.restaurantName);
    store.bills[billIndex] = nextBill;
    return nextBill;
  });
}

export async function markBillParticipantPaid(
  billId: string,
  participantId: string,
  paidStatus: BillParticipantRecord['paidStatus'],
): Promise<BillRecord> {
  return mutateStore((store) => {
    const billIndex = store.bills.findIndex((bill) => bill.id === billId);
    if (billIndex < 0) {
      throw new Error('Bill not found.');
    }

    const currentBill = store.bills[billIndex];
    const updatedParticipants = currentBill.participants.map((participant) =>
      participant.id === participantId
        ? {
            ...participant,
            paidStatus,
          }
        : participant,
    );

    const updatedBill: BillRecord = {
      ...currentBill,
      participants: updatedParticipants,
      status: toBillStatus(updatedParticipants),
      updatedAt: nowIso(),
    };

    store.bills[billIndex] = updatedBill;
    return updatedBill;
  });
}

export function createEntityId(prefix: string): string {
  return createId(prefix);
}
