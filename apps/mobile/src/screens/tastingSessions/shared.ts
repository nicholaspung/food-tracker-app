import type {
  TastingInviteRecord,
  TastingSessionListSummary,
  TastingSessionRecord,
  TastingSessionStatus,
} from '../../features';
import { formatStoredCalendarDateLabel } from '../../lib/dateFormatting';
import type { RootStackParamList } from '../../navigation/RootNavigator';

export interface TastingNavigation {
  navigate<RouteName extends keyof RootStackParamList>(
    ...args: undefined extends RootStackParamList[RouteName]
      ? [screen: RouteName] | [screen: RouteName, params: RootStackParamList[RouteName]]
      : [screen: RouteName, params: RootStackParamList[RouteName]]
  ): void;
}

export const TASTING_SESSION_LIFECYCLE_STEPS = [
  { label: 'Lobby' },
  { label: 'Plan' },
  { label: 'Rate' },
  { label: 'Review' },
];

export const TASTING_SESSION_LIFECYCLE_STEP_INDEX = {
  lobby: 0,
  plan: 1,
  rate: 2,
  review: 3,
} as const;

export const TASTING_JOIN_WINDOW_DURATION_OPTIONS = [15, 30, 60, 120] as const;

export function formatTastingJoinWindowDurationLabel(durationMinutes: number): string {
  if (durationMinutes === 60) {
    return '1 hour';
  }
  if (durationMinutes === 120) {
    return '2 hours';
  }
  return `${durationMinutes} minutes`;
}

export function formatTastingSessionStatusLabel(status: TastingSessionStatus): string {
  switch (status) {
    case 'lobby':
    case 'adding_items':
      return 'Lobby';
    case 'planning':
      return 'Planning';
    case 'tasting':
    case 'rating':
      return 'Tasting';
    case 'completed':
      return 'Completed';
  }
}

export function getApprovedTastingRestaurantCount(session: TastingSessionRecord): number {
  return session.restaurants.filter((restaurant) => restaurant.status === 'approved').length;
}

export function getApprovedTastingItemCount(session: TastingSessionRecord): number {
  return session.restaurants
    .filter((restaurant) => restaurant.status === 'approved')
    .reduce(
      (count, restaurant) =>
        count + (restaurant.items ?? []).filter((item) => item.status === 'approved').length,
      0,
    );
}

export function formatTastingSessionCount(value: number, singular: string, plural: string): string {
  return `${value} ${value === 1 ? singular : plural}`;
}

function formatCompletedTastingSessionListSummary(session: TastingSessionListSummary): string {
  return [
    formatTastingSessionCount(session.approvedRestaurantCount, 'restaurant', 'restaurants'),
    formatTastingSessionCount(session.approvedItemCount, 'item', 'items'),
    formatTastingSessionCount(session.joinedCount, 'taster', 'tasters'),
  ].join(', ');
}

export function formatCompletedTastingSessionSummary(session: TastingSessionRecord): string {
  return [
    formatTastingSessionCount(getApprovedTastingRestaurantCount(session), 'restaurant', 'restaurants'),
    formatTastingSessionCount(getApprovedTastingItemCount(session), 'item', 'items'),
    formatTastingSessionCount(session.participants.length, 'taster', 'tasters'),
  ].join(', ');
}

export function formatCompletedTastingSessionSubtitle(
  session: TastingSessionRecord | TastingSessionListSummary,
): string {
  const sessionDate = formatStoredCalendarDateLabel(session.updatedAt || session.createdAt, {
    fallback: 'Unknown date',
    locale: 'en-US',
  });
  const summary =
    'approvedRestaurantCount' in session
      ? formatCompletedTastingSessionListSummary(session)
      : formatCompletedTastingSessionSummary(session);
  return `${sessionDate} - ${summary}`;
}

export function resolveTastingSessionStatusTone(status: TastingSessionStatus): 'info' | 'warning' | 'success' {
  switch (status) {
    case 'lobby':
    case 'adding_items':
      return 'info';
    case 'planning':
    case 'tasting':
    case 'rating':
      return 'warning';
    case 'completed':
      return 'success';
  }
}

export function navigateToTastingSession(
  navigation: TastingNavigation,
  session: Pick<TastingSessionRecord, 'id' | 'status'>,
) {
  if (session.status === 'lobby' || session.status === 'adding_items') {
    navigation.navigate('TastingSessionLobby', { sessionId: session.id });
    return;
  }
  if (session.status === 'planning') {
    navigation.navigate('TastingSessionPlanning', { sessionId: session.id });
    return;
  }
  if (session.status === 'tasting' || session.status === 'rating') {
    navigation.navigate('TastingSessionTasting', { sessionId: session.id });
    return;
  }
  navigation.navigate('TastingSessionResults', { sessionId: session.id });
}

export function formatCountdown(expiresAt: string): string {
  const expiresTime = new Date(expiresAt).getTime();
  if (Number.isNaN(expiresTime)) {
    return 'Invite window unavailable';
  }
  const remainingMs = expiresTime - Date.now();
  if (remainingMs <= 0) {
    return 'Invite window closed';
  }
  const minutes = Math.ceil(remainingMs / 60000);
  if (minutes < 60) {
    return `${minutes} min remaining`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${hours} hr ${rest} min remaining` : `${hours} hr remaining`;
}

export function isTastingInviteWindowOpen(joinExpiresAt: string, nowMs = Date.now()): boolean {
  const expiresTime = new Date(joinExpiresAt).getTime();
  return Number.isFinite(expiresTime) && nowMs < expiresTime;
}

export function isTastingInviteWindowExpired(joinExpiresAt: string, nowMs = Date.now()): boolean {
  return !isTastingInviteWindowOpen(joinExpiresAt, nowMs);
}

export function getTastingInviteDisplayStatus(
  invite: TastingInviteRecord,
  session: Pick<TastingSessionRecord, 'joinExpiresAt'>,
  nowMs = Date.now(),
): TastingInviteRecord['status'] | 'expired' {
  if (invite.status === 'pending' && isTastingInviteWindowExpired(session.joinExpiresAt, nowMs)) {
    return 'expired';
  }
  return invite.status;
}
