import AsyncStorage from '@react-native-async-storage/async-storage';

import type {
  FeatureStore,
  FeedbackRecord,
  FriendRecord,
  FriendStatus,
  NoteRecord,
  PhotoProcessingDraft,
  ProfileRecord,
  QuickTrackRecord,
  RestaurantListRecord,
  RestaurantRecord,
  TastingSessionRecord,
  VisitRecord,
  BillRecord,
} from '../models';
import { nowIso } from './featureStoreShared';
import { createLocalDomainStore } from './localDomainStore';
import { createPhotoDraftStore } from './photoDraftStore';
import { createProfileStore } from './profileStore';
import { createTastingSessionsStore } from './tastingSessionsStore';

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

const photoDraftStore = createPhotoDraftStore({
  getStore,
  mutateStore,
  nowIso,
});

const profileStore = createProfileStore({
  localDomainStore,
});

const tastingSessionsStore = createTastingSessionsStore({
  localDomainStore,
});

export const getPhotoDraft = photoDraftStore.getPhotoDraft;
export const savePhotoDraft = photoDraftStore.savePhotoDraft;
export const clearPhotoDraft = photoDraftStore.clearPhotoDraft;

export const getProfile = profileStore.getProfile;
export const updateProfile = profileStore.updateProfile;

export const listTastingSessions = tastingSessionsStore.listTastingSessions;
export const getTastingSessionById = tastingSessionsStore.getTastingSessionById;
export const createTastingSession = tastingSessionsStore.createTastingSession;
export const joinTastingSession = tastingSessionsStore.joinTastingSession;
export const regenerateTastingInviteCode = tastingSessionsStore.regenerateTastingInviteCode;
export const addTastingItem = tastingSessionsStore.addTastingItem;
export const deleteTastingItem = tastingSessionsStore.deleteTastingItem;
export const submitTastingRating = tastingSessionsStore.submitTastingRating;
export const setTastingSessionStatus = tastingSessionsStore.setTastingSessionStatus;
export const saveTastingResultsToVisitHistory = tastingSessionsStore.saveTastingResultsToVisitHistory;

export function createEntityId(prefix: string): string {
  return createId(prefix);
}
