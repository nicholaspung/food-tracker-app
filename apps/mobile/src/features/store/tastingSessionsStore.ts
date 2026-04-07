import type { TastingSessionRecord, TastingSessionStatus, VisitRecord } from '../models';
import type {
  AddTastingItemInput,
  CreateTastingSessionInput,
  JoinTastingSessionInput,
  SubmitTastingRatingInput,
} from './featureStore';
import { trackFeatureMutation } from './featureStoreShared';

export type {
  AddTastingItemInput,
  CreateTastingSessionInput,
  JoinTastingSessionInput,
  SubmitTastingRatingInput,
} from './featureStore';

interface TastingSessionsDomainStore {
  listTastingSessions: () => Promise<TastingSessionRecord[]>;
  getTastingSessionById: (sessionId: string) => Promise<TastingSessionRecord | null>;
  createTastingSession: (input: CreateTastingSessionInput) => Promise<TastingSessionRecord>;
  joinTastingSession: (input: JoinTastingSessionInput) => Promise<TastingSessionRecord>;
  regenerateTastingInviteCode: (sessionId: string) => Promise<TastingSessionRecord>;
  addTastingItem: (sessionId: string, input: AddTastingItemInput) => Promise<TastingSessionRecord>;
  deleteTastingItem: (
    sessionId: string,
    itemId: string,
    requesterParticipantId: string,
  ) => Promise<TastingSessionRecord>;
  submitTastingRating: (
    sessionId: string,
    itemId: string,
    input: SubmitTastingRatingInput,
  ) => Promise<TastingSessionRecord>;
  setTastingSessionStatus: (
    sessionId: string,
    status: TastingSessionStatus,
  ) => Promise<TastingSessionRecord>;
  saveTastingResultsToVisitHistory: (sessionId: string) => Promise<VisitRecord>;
}

interface TastingSessionsStoreDependencies {
  localDomainStore: TastingSessionsDomainStore;
}

export function createTastingSessionsStore(dependencies: TastingSessionsStoreDependencies) {
  const { localDomainStore } = dependencies;

  return {
    async listTastingSessions(): Promise<TastingSessionRecord[]> {
      return localDomainStore.listTastingSessions();
    },

    async getTastingSessionById(sessionId: string): Promise<TastingSessionRecord | null> {
      return localDomainStore.getTastingSessionById(sessionId);
    },

    async createTastingSession(input: CreateTastingSessionInput): Promise<TastingSessionRecord> {
      return trackFeatureMutation(
        'tasting_session.create',
        () => localDomainStore.createTastingSession(input),
        {
          hasRestaurantName: Boolean(input.restaurantName.trim()),
          hasSessionName: Boolean(input.name.trim()),
        },
      );
    },

    async joinTastingSession(input: JoinTastingSessionInput): Promise<TastingSessionRecord> {
      return trackFeatureMutation(
        'tasting_session.join',
        () => localDomainStore.joinTastingSession(input),
        {
          inviteCodeLength: input.inviteCode.trim().length,
        },
      );
    },

    async regenerateTastingInviteCode(sessionId: string): Promise<TastingSessionRecord> {
      return trackFeatureMutation('tasting_session.invite_code.regenerate', () =>
        localDomainStore.regenerateTastingInviteCode(sessionId),
      );
    },

    async addTastingItem(
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
    },

    async deleteTastingItem(
      sessionId: string,
      itemId: string,
      requesterParticipantId: string,
    ): Promise<TastingSessionRecord> {
      return trackFeatureMutation('tasting_session.item.delete', () =>
        localDomainStore.deleteTastingItem(sessionId, itemId, requesterParticipantId),
      );
    },

    async submitTastingRating(
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
    },

    async setTastingSessionStatus(
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
    },

    async saveTastingResultsToVisitHistory(sessionId: string): Promise<VisitRecord> {
      return trackFeatureMutation('tasting_session.results.save_to_visit', () =>
        localDomainStore.saveTastingResultsToVisitHistory(sessionId),
      );
    },
  };
}
