/**
 * Invite Code Repository
 *
 * Handles invite code operations.
 */

import type PocketBase from 'pocketbase';
import { BaseRepository } from './BaseRepository';

export interface InviteCode {
  id: string;
  code: string;
  locked?: boolean;
  lockedUntil?: string;
  user?: string;
  usedBy?: string;
  created: string;
  updated: string;
}

/**
 * Repository for managing invite codes
 */
export class InviteCodeRepository extends BaseRepository<InviteCode> {
  constructor(pb: PocketBase) {
    super(pb, 'invite_codes');
  }
}
