import type {
  FeatureStore,
  ProfileRecord,
  TastingSessionParticipant,
  TastingSessionRating,
  TastingSessionRecord,
  TastingSessionStatus,
  VisitRecord,
} from '../models';

interface UpdateProfileInput {
  displayName?: string;
  bio?: string;
  location?: string;
  favoriteCuisine?: string;
  receiveMarketingEmails?: boolean;
}

interface CreateTastingSessionInput {
  name: string;
  restaurantName: string;
  createdByUserId: string;
  createdByName: string;
}

interface JoinTastingSessionInput {
  inviteCode: string;
  userId: string;
  participantName: string;
}

interface AddTastingItemInput {
  name: string;
  description?: string;
  createdByParticipantId: string;
}

interface SubmitTastingRatingInput {
  participantId: string;
  rating: number;
  note?: string;
}

interface LocalDomainStoreDependencies {
  getStore: () => Promise<FeatureStore>;
  mutateStore: <T>(mutator: (store: FeatureStore) => T) => Promise<T>;
  nowIso: () => string;
  createId: (prefix: string) => string;
  createInviteCode: () => string;
  upsertRestaurant: (store: FeatureStore, restaurantName: string) => void;
  mapAndSortByDateDescending: <T extends { updatedAt: string }>(records: T[]) => T[];
}

export function createLocalDomainStore(dependencies: LocalDomainStoreDependencies) {
  const {
    getStore,
    mutateStore,
    nowIso,
    createId,
    createInviteCode,
    upsertRestaurant,
    mapAndSortByDateDescending,
  } = dependencies;

  return {
    async getProfile(): Promise<ProfileRecord> {
      const store = await getStore();
      return store.profile;
    },

    async updateProfile(updates: UpdateProfileInput): Promise<ProfileRecord> {
      return mutateStore((store) => {
        const nextProfile: ProfileRecord = {
          ...store.profile,
          ...updates,
        };

        store.profile = nextProfile;
        return nextProfile;
      });
    },

    async listTastingSessions(): Promise<TastingSessionRecord[]> {
      const store = await getStore();
      return mapAndSortByDateDescending(store.tastingSessions);
    },

    async getTastingSessionById(sessionId: string): Promise<TastingSessionRecord | null> {
      const store = await getStore();
      return store.tastingSessions.find((session) => session.id === sessionId) ?? null;
    },

    async createTastingSession(input: CreateTastingSessionInput): Promise<TastingSessionRecord> {
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
    },

    async joinTastingSession(input: JoinTastingSessionInput): Promise<TastingSessionRecord> {
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
    },

    async regenerateTastingInviteCode(sessionId: string): Promise<TastingSessionRecord> {
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
    },

    async addTastingItem(
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
    },

    async deleteTastingItem(
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
    },

    async submitTastingRating(
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
    },

    async setTastingSessionStatus(
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
    },

    async saveTastingResultsToVisitHistory(sessionId: string): Promise<VisitRecord> {
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
    },
  };
}
