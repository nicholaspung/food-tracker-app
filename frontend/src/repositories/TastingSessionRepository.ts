import type PocketBase from 'pocketbase';
import type { RecordListOptions } from 'pocketbase';
import { BaseRepository } from './BaseRepository';
import type {
  TastingSession,
  TastingSessionParticipant,
  TastingSessionItem,
  TastingSessionRating,
  TastingSessionInvite,
} from '../lib/pocketbase';
import { COLLECTIONS } from '../constants/collections';

/**
 * Repository for managing tasting session records
 */
export class TastingSessionRepository extends BaseRepository<TastingSession> {
  constructor(pb: PocketBase) {
    super(pb, COLLECTIONS.TASTING_SESSIONS);
  }

  async getByLeader(userId: string, options?: RecordListOptions): Promise<TastingSession[]> {
    return await this.getFullList({
      filter: `leader = "${userId}"`,
      sort: '-created',
      ...options,
    });
  }

  async getActive(userId: string, options?: RecordListOptions): Promise<TastingSession[]> {
    return await this.getFullList({
      filter: `(leader = "${userId}" || tasting_session_participants_via_session.user ?= "${userId}") && status != "completed"`,
      sort: '-created',
      ...options,
    });
  }
}

/**
 * Repository for managing tasting session participant records
 */
export class TastingSessionParticipantRepository extends BaseRepository<TastingSessionParticipant> {
  constructor(pb: PocketBase) {
    super(pb, COLLECTIONS.TASTING_SESSION_PARTICIPANTS);
  }

  async getBySession(sessionId: string, options?: RecordListOptions): Promise<TastingSessionParticipant[]> {
    return await this.getFullList({
      filter: `session = "${sessionId}"`,
      sort: 'created',
      ...options,
    });
  }
}

/**
 * Repository for managing tasting session item records
 */
export class TastingSessionItemRepository extends BaseRepository<TastingSessionItem> {
  constructor(pb: PocketBase) {
    super(pb, COLLECTIONS.TASTING_SESSION_ITEMS);
  }

  async getBySession(sessionId: string, options?: RecordListOptions): Promise<TastingSessionItem[]> {
    return await this.getFullList({
      filter: `session = "${sessionId}"`,
      sort: 'created',
      ...options,
    });
  }
}

/**
 * Repository for managing tasting session rating records
 */
export class TastingSessionRatingRepository extends BaseRepository<TastingSessionRating> {
  constructor(pb: PocketBase) {
    super(pb, COLLECTIONS.TASTING_SESSION_RATINGS);
  }

  async getBySession(sessionId: string, options?: RecordListOptions): Promise<TastingSessionRating[]> {
    return await this.getFullList({
      filter: `session = "${sessionId}"`,
      ...options,
    });
  }

  async getBySessionAndUser(sessionId: string, userId: string, options?: RecordListOptions): Promise<TastingSessionRating[]> {
    return await this.getFullList({
      filter: `session = "${sessionId}" && user = "${userId}"`,
      ...options,
    });
  }
}

/**
 * Repository for managing tasting session invite records
 */
export class TastingSessionInviteRepository extends BaseRepository<TastingSessionInvite> {
  constructor(pb: PocketBase) {
    super(pb, COLLECTIONS.TASTING_SESSION_INVITES);
  }

  async getBySession(sessionId: string, options?: RecordListOptions): Promise<TastingSessionInvite[]> {
    return await this.getFullList({
      filter: `session = "${sessionId}"`,
      sort: '-created',
      ...options,
    });
  }
}
