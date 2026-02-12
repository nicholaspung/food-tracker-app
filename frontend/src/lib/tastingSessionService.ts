/**
 * Tasting session service for CRUD operations with PocketBase
 */

import {
  pb,
  type TastingSession,
  type TastingSessionParticipant,
  type TastingSessionItem,
  type TastingSessionRating,
  type TastingSessionInvite,
} from './pocketbase';
import { repositories } from '@/repositories';

export interface TastingSessionWithDetails extends TastingSession {
  participants: TastingSessionParticipant[];
  items: TastingSessionItem[];
  ratings: TastingSessionRating[];
  invites: TastingSessionInvite[];
}

/**
 * Create a new tasting session, add the leader as participant, and generate an invite code
 */
export async function createSession(data: {
  name: string;
  restaurant: string;
}): Promise<{ session: TastingSession; code: string }> {
  const currentUser = pb.authStore.record;
  if (!currentUser) throw new Error('User not authenticated');

  // Create the session
  const session = await repositories.tastingSessions.create({
    name: data.name,
    restaurant: data.restaurant,
    leader: currentUser.id,
    status: 'adding_items',
    locked: false,
  });

  // Add leader as participant
  await repositories.tastingSessionParticipants.create({
    session: session.id,
    user: currentUser.id,
  });

  // Generate invite code via API
  const response = await pb.send('/api/tasting-sessions/generate-code', {
    method: 'POST',
    body: JSON.stringify({ sessionId: session.id }),
  });

  return { session, code: response.code };
}

/**
 * Get a session with all related data
 */
export async function getSession(sessionId: string): Promise<TastingSessionWithDetails> {
  const session = await repositories.tastingSessions.getOne(sessionId, {
    expand: 'restaurant,leader',
  });

  const [participants, items, ratings, invites] = await Promise.all([
    repositories.tastingSessionParticipants.getBySession(sessionId, {
      expand: 'user',
    }),
    repositories.tastingSessionItems.getBySession(sessionId, {
      expand: 'added_by',
    }),
    repositories.tastingSessionRatings.getBySession(sessionId, {
      expand: 'user',
    }),
    repositories.tastingSessionInvites.getBySession(sessionId),
  ]);

  return { ...session, participants, items, ratings, invites };
}

/**
 * List sessions where user is leader or participant
 */
export async function listSessions(): Promise<TastingSession[]> {
  const currentUser = pb.authStore.record;
  if (!currentUser) throw new Error('User not authenticated');

  // Get sessions where user is leader
  const leaderSessions = await repositories.tastingSessions.getFullList({
    filter: `leader = "${currentUser.id}"`,
    sort: '-created',
    expand: 'restaurant,leader',
  });

  // Get sessions where user is a participant (not leader)
  const participantRecords = await repositories.tastingSessionParticipants.getFullList({
    filter: `user = "${currentUser.id}"`,
  });

  const participantSessionIds = participantRecords.map(p => p.session);
  const leaderSessionIds = new Set(leaderSessions.map(s => s.id));

  // Filter out sessions where user is already listed as leader
  const additionalSessionIds = participantSessionIds.filter(id => !leaderSessionIds.has(id));

  let participantSessions: TastingSession[] = [];
  if (additionalSessionIds.length > 0) {
    participantSessions = await repositories.tastingSessions.getFullList({
      filter: additionalSessionIds.map(id => `id = "${id}"`).join(' || '),
      sort: '-created',
      expand: 'restaurant,leader',
    });
  }

  // Combine and sort by created date
  const allSessions = [...leaderSessions, ...participantSessions];
  allSessions.sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());

  return allSessions;
}

/**
 * Join a session via invite code
 */
export async function joinSession(code: string): Promise<{ sessionId: string; session: any }> {
  const response = await pb.send('/api/tasting-sessions/join', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });

  return { sessionId: response.sessionId, session: response.session };
}

/**
 * Add a food item to a session
 */
export async function addItem(sessionId: string, data: {
  name: string;
  description?: string;
}): Promise<TastingSessionItem> {
  const currentUser = pb.authStore.record;
  if (!currentUser) throw new Error('User not authenticated');

  return await repositories.tastingSessionItems.create({
    session: sessionId,
    name: data.name,
    description: data.description || '',
    added_by: currentUser.id,
  });
}

/**
 * Delete an item from a session
 */
export async function deleteItem(itemId: string): Promise<void> {
  await repositories.tastingSessionItems.delete(itemId);
}

/**
 * Submit or update a rating (upsert)
 */
export async function submitRating(sessionId: string, itemId: string, data: {
  rating: number;
  notes?: string;
}): Promise<TastingSessionRating> {
  const currentUser = pb.authStore.record;
  if (!currentUser) throw new Error('User not authenticated');

  // Check if rating already exists
  try {
    const existing = await repositories.tastingSessionRatings.getFirstListItem(
      `session = "${sessionId}" && item = "${itemId}" && user = "${currentUser.id}"`
    );

    // Update existing
    return await repositories.tastingSessionRatings.update(existing.id, {
      rating: data.rating,
      notes: data.notes || '',
    });
  } catch {
    // Create new
    return await repositories.tastingSessionRatings.create({
      session: sessionId,
      item: itemId,
      user: currentUser.id,
      rating: data.rating,
      notes: data.notes || '',
    });
  }
}

/**
 * Lock a session to prevent new joins
 */
export async function lockSession(sessionId: string): Promise<TastingSession> {
  return await repositories.tastingSessions.update(sessionId, { locked: true });
}

/**
 * Unlock a session
 */
export async function unlockSession(sessionId: string): Promise<TastingSession> {
  return await repositories.tastingSessions.update(sessionId, { locked: false });
}

/**
 * Advance session to rating phase
 */
export async function advanceToRating(sessionId: string): Promise<TastingSession> {
  return await repositories.tastingSessions.update(sessionId, {
    status: 'rating',
    locked: true,
  });
}

/**
 * Complete the session
 */
export async function completeSession(sessionId: string): Promise<TastingSession> {
  return await repositories.tastingSessions.update(sessionId, { status: 'completed' });
}

/**
 * Save session results to personal visit history
 */
export async function saveToVisitHistory(sessionId: string): Promise<{ visitId: string }> {
  const currentUser = pb.authStore.record;
  if (!currentUser) throw new Error('User not authenticated');

  const sessionData = await getSession(sessionId);

  // Create a visit
  const visit = await repositories.visits.create({
    restaurant: sessionData.restaurant,
    user: currentUser.id,
    visitDate: sessionData.created,
    visibility: 'private',
    notes: `From group tasting: ${sessionData.name}`,
  });

  // Create food items from session items with user's ratings
  const userRatings = sessionData.ratings.filter(r => r.user === currentUser.id);
  const ratingMap = new Map(userRatings.map(r => [r.item, r]));

  for (const item of sessionData.items) {
    const rating = ratingMap.get(item.id);
    await repositories.foodItems.create({
      name: item.name,
      description: item.description || '',
      visit: visit.id,
      rating: rating?.rating || 3,
      notes: rating?.notes || '',
      user: currentUser.id,
    });
  }

  return { visitId: visit.id };
}

/**
 * Generate a new invite code for a session
 */
export async function generateInviteCode(sessionId: string): Promise<string> {
  const response = await pb.send('/api/tasting-sessions/generate-code', {
    method: 'POST',
    body: JSON.stringify({ sessionId }),
  });

  return response.code;
}

/**
 * Delete a session
 */
export async function deleteSession(sessionId: string): Promise<void> {
  await repositories.tastingSessions.delete(sessionId);
}
