import { localPersistence } from '../localPersistence';

const PENDING_AUTH_REDIRECT_STORAGE_KEY = localPersistence.authHandoffs.keys.pendingAuthRedirect;
const PENDING_AUTH_REDIRECT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type PendingAuthRedirect = {
  route: 'SharedRestaurantList';
  shareToken: string;
  createdAt: string;
};

function isPendingAuthRedirect(value: unknown): value is PendingAuthRedirect {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    candidate.route === 'SharedRestaurantList' &&
    typeof candidate.shareToken === 'string' &&
    candidate.shareToken.trim().length > 0 &&
    typeof candidate.createdAt === 'string' &&
    candidate.createdAt.trim().length > 0
  );
}

function isExpiredRedirect(redirect: PendingAuthRedirect): boolean {
  const createdAtMs = Date.parse(redirect.createdAt);
  if (!Number.isFinite(createdAtMs)) {
    return true;
  }

  return Date.now() - createdAtMs > PENDING_AUTH_REDIRECT_TTL_MS;
}

export async function savePendingAuthRedirect(redirect: Omit<PendingAuthRedirect, 'createdAt'>): Promise<void> {
  await localPersistence.authHandoffs.storage.setItem(
    PENDING_AUTH_REDIRECT_STORAGE_KEY,
    JSON.stringify({
      ...redirect,
      createdAt: new Date().toISOString(),
    }),
  );
}

export async function getPendingAuthRedirect(): Promise<PendingAuthRedirect | null> {
  const raw = await localPersistence.authHandoffs.storage.getItem(PENDING_AUTH_REDIRECT_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isPendingAuthRedirect(parsed) || isExpiredRedirect(parsed)) {
      await clearPendingAuthRedirect();
      return null;
    }

    return parsed;
  } catch {
    await clearPendingAuthRedirect();
    return null;
  }
}

export async function clearPendingAuthRedirect(): Promise<void> {
  await localPersistence.authHandoffs.storage.removeItem(PENDING_AUTH_REDIRECT_STORAGE_KEY);
}
