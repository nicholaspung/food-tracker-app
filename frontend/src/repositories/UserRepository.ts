/**
 * User Repository
 *
 * Handles user-related operations including authentication and profile management.
 */

import type PocketBase from 'pocketbase';
import { BaseRepository } from './BaseRepository';

export interface User {
  id: string;
  email: string;
  name?: string;
  verified: boolean;
  isAdmin?: boolean;
  isSubscriber?: boolean;
  isInitialUser?: boolean;
  defaultVisitVisibility?: 'friends' | 'private';
  defaultRestaurantVisibility?: 'private' | 'friends' | 'public';
  created: string;
  updated: string;
}

/**
 * Repository for managing users
 */
export class UserRepository extends BaseRepository<User> {
  constructor(pb: PocketBase) {
    super(pb, 'users');
  }

  /**
   * Request email verification for a user
   * @param email - The user's email address
   */
  async requestVerification(email: string): Promise<void> {
    await this.pb.collection(this.collectionName).requestVerification(email);
  }

  /**
   * Confirm email verification
   * @param token - The verification token from the email
   */
  async confirmVerification(token: string): Promise<void> {
    await this.pb.collection(this.collectionName).confirmVerification(token);
  }

  /**
   * Request password reset
   * @param email - The user's email address
   */
  async requestPasswordReset(email: string): Promise<void> {
    await this.pb.collection(this.collectionName).requestPasswordReset(email);
  }

  /**
   * Confirm password reset
   * @param token - The reset token from the email
   * @param password - The new password
   * @param passwordConfirm - Password confirmation
   */
  async confirmPasswordReset(token: string, password: string, passwordConfirm: string): Promise<void> {
    await this.pb.collection(this.collectionName).confirmPasswordReset(
      token,
      password,
      passwordConfirm
    );
  }
}
