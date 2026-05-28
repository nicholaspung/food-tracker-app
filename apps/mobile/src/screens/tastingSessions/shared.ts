import type { TastingInviteRecord, TastingSessionRecord, TastingSessionStatus } from '../../features';
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

export function navigateToTastingSession(navigation: TastingNavigation, session: TastingSessionRecord) {
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
