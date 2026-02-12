/**
 * TanStack Query hooks for tasting sessions
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { pb } from '@/lib/pocketbase';
import { tastingSessionKeys } from '@/constants/queryKeys';
import * as tastingSessionService from '@/lib/tastingSessionService';

/**
 * List all sessions for current user (leader or participant)
 */
export function useTastingSessions() {
  const currentUser = pb.authStore.record;

  return useQuery({
    queryKey: tastingSessionKeys.all(currentUser?.id || ''),
    queryFn: () => tastingSessionService.listSessions(),
    enabled: !!currentUser,
  });
}

/**
 * Get a single session with all details
 */
export function useTastingSession(sessionId: string) {
  return useQuery({
    queryKey: tastingSessionKeys.detail(sessionId),
    queryFn: () => tastingSessionService.getSession(sessionId),
    enabled: !!sessionId,
    refetchInterval: 5000, // Poll for updates every 5 seconds
  });
}

/**
 * Create a new session
 */
export function useCreateTastingSession() {
  const queryClient = useQueryClient();
  const currentUser = pb.authStore.record;

  return useMutation({
    mutationFn: (data: { name: string; restaurant: string }) =>
      tastingSessionService.createSession(data),
    onSuccess: () => {
      if (currentUser) {
        queryClient.invalidateQueries({ queryKey: tastingSessionKeys.all(currentUser.id) });
      }
    },
  });
}

/**
 * Join a session via invite code
 */
export function useJoinTastingSession() {
  const queryClient = useQueryClient();
  const currentUser = pb.authStore.record;

  return useMutation({
    mutationFn: (code: string) => tastingSessionService.joinSession(code),
    onSuccess: () => {
      if (currentUser) {
        queryClient.invalidateQueries({ queryKey: tastingSessionKeys.all(currentUser.id) });
      }
    },
  });
}

/**
 * Add an item to a session
 */
export function useAddTastingItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { sessionId: string; name: string; description?: string }) =>
      tastingSessionService.addItem(data.sessionId, {
        name: data.name,
        description: data.description,
      }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: tastingSessionKeys.detail(variables.sessionId),
      });
    },
  });
}

/**
 * Delete an item from a session
 */
export function useDeleteTastingItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { itemId: string; sessionId: string }) =>
      tastingSessionService.deleteItem(data.itemId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: tastingSessionKeys.detail(variables.sessionId),
      });
    },
  });
}

/**
 * Submit or update a rating
 */
export function useSubmitTastingRating() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      sessionId: string;
      itemId: string;
      rating: number;
      notes?: string;
    }) =>
      tastingSessionService.submitRating(data.sessionId, data.itemId, {
        rating: data.rating,
        notes: data.notes,
      }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: tastingSessionKeys.detail(variables.sessionId),
      });
    },
  });
}

/**
 * Lock/unlock a session
 */
export function useLockTastingSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { sessionId: string; locked: boolean }) =>
      data.locked
        ? tastingSessionService.lockSession(data.sessionId)
        : tastingSessionService.unlockSession(data.sessionId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: tastingSessionKeys.detail(variables.sessionId),
      });
    },
  });
}

/**
 * Advance session to rating phase
 */
export function useAdvanceToRating() {
  const queryClient = useQueryClient();
  const currentUser = pb.authStore.record;

  return useMutation({
    mutationFn: (sessionId: string) => tastingSessionService.advanceToRating(sessionId),
    onSuccess: (_, sessionId) => {
      queryClient.invalidateQueries({
        queryKey: tastingSessionKeys.detail(sessionId),
      });
      if (currentUser) {
        queryClient.invalidateQueries({ queryKey: tastingSessionKeys.all(currentUser.id) });
      }
    },
  });
}

/**
 * Complete a session
 */
export function useCompleteTastingSession() {
  const queryClient = useQueryClient();
  const currentUser = pb.authStore.record;

  return useMutation({
    mutationFn: (sessionId: string) => tastingSessionService.completeSession(sessionId),
    onSuccess: (_, sessionId) => {
      queryClient.invalidateQueries({
        queryKey: tastingSessionKeys.detail(sessionId),
      });
      if (currentUser) {
        queryClient.invalidateQueries({ queryKey: tastingSessionKeys.all(currentUser.id) });
      }
    },
  });
}

/**
 * Save session results to visit history
 */
export function useSaveToVisitHistory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sessionId: string) => tastingSessionService.saveToVisitHistory(sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['visits'] });
      queryClient.invalidateQueries({ queryKey: ['allVisits'] });
      queryClient.invalidateQueries({ queryKey: ['allFoodItems'] });
    },
  });
}

/**
 * Generate a new invite code
 */
export function useGenerateInviteCode() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sessionId: string) => tastingSessionService.generateInviteCode(sessionId),
    onSuccess: (_, sessionId) => {
      queryClient.invalidateQueries({
        queryKey: tastingSessionKeys.detail(sessionId),
      });
    },
  });
}

/**
 * Delete a session
 */
export function useDeleteTastingSession() {
  const queryClient = useQueryClient();
  const currentUser = pb.authStore.record;

  return useMutation({
    mutationFn: (sessionId: string) => tastingSessionService.deleteSession(sessionId),
    onSuccess: () => {
      if (currentUser) {
        queryClient.invalidateQueries({ queryKey: tastingSessionKeys.all(currentUser.id) });
      }
    },
  });
}
