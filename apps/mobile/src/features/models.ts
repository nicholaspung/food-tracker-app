export interface VisitItem {
  id: string;
  name: string;
  rating: number;
  notes?: string;
}

export interface VisitRecord {
  id: string;
  restaurantName: string;
  visitedAt: string;
  items: VisitItem[];
  source: 'visit' | 'quick-track' | 'tasting-result';
  createdAt: string;
  updatedAt: string;
}

export interface QuickTrackRecord {
  id: string;
  restaurantName: string;
  itemName: string;
  rating: number;
  notes?: string;
  sourceNoteId?: string;
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
}

export interface RestaurantListRecord {
  id: string;
  name: string;
  description?: string;
  restaurantIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface NoteRecord {
  id: string;
  title: string;
  content: string;
  rating?: number;
  createdAt: string;
  updatedAt: string;
}

export type FriendStatus = 'friend' | 'pending_received' | 'pending_sent';

export interface FriendRecord {
  id: string;
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
}

export interface BillParticipantRecord {
  id: string;
  name: string;
  userId?: string;
  amountOwed: number;
  paidStatus: 'pending' | 'paid';
}

export type BillExtrasSplitMode = 'proportional' | 'equal';

export interface BillRecord {
  id: string;
  title: string;
  restaurantName: string;
  createdByUserId: string;
  items: BillItemRecord[];
  participants: BillParticipantRecord[];
  tax: number;
  tip: number;
  fees: number;
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
