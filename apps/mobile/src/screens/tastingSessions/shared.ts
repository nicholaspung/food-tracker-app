import type { TastingSessionRecord, TastingSessionStatus } from '../../features';
import type { RootStackParamList } from '../../navigation/RootNavigator';

export interface TastingNavigation {
  navigate<RouteName extends keyof RootStackParamList>(
    ...args: undefined extends RootStackParamList[RouteName]
      ? [screen: RouteName] | [screen: RouteName, params: RootStackParamList[RouteName]]
      : [screen: RouteName, params: RootStackParamList[RouteName]]
  ): void;
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

export function getApprovedItemCount(session: TastingSessionRecord): number {
  return session.restaurants
    .filter((restaurant) => restaurant.status === 'approved')
    .reduce((count, restaurant) => count + (restaurant.items ?? []).filter((item) => item.status === 'approved').length, 0);
}

export function hasPendingSuggestions(session: TastingSessionRecord): boolean {
  return session.restaurants.some(
    (restaurant) =>
      restaurant.status === 'pending' ||
      (restaurant.status !== 'rejected' && (restaurant.items ?? []).some((item) => item.status === 'pending')),
  );
}
