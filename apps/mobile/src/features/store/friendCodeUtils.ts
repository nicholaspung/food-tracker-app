const FRIEND_CODE_LENGTH = 8;

export function sanitizeFriendCode(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, FRIEND_CODE_LENGTH);
}

export function resolveOwnFriendCode(userId?: string, persistedFriendCode?: string): string {
  const normalizedPersistedCode = sanitizeFriendCode(persistedFriendCode ?? '');
  if (normalizedPersistedCode.length === FRIEND_CODE_LENGTH) {
    return normalizedPersistedCode;
  }

  if (!userId) {
    return 'LOCAL000';
  }

  const cleanId = userId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return cleanId.slice(0, FRIEND_CODE_LENGTH).padEnd(FRIEND_CODE_LENGTH, 'X');
}

export function extractFriendCodeFromQrPayload(payload: string): string | null {
  const trimmedPayload = payload.trim();
  if (!trimmedPayload) {
    return null;
  }

  let candidate = trimmedPayload;

  try {
    const parsed = new URL(trimmedPayload);
    candidate =
      parsed.searchParams.get('friendCode') ??
      parsed.searchParams.get('code') ??
      parsed.pathname.split('/').filter(Boolean).pop() ??
      trimmedPayload;
  } catch {
    // Payload might not be a URL; in that case only accept a plain raw friend code.
  }

  if (!/^[a-zA-Z0-9]{8}$/.test(candidate)) {
    return null;
  }

  const normalized = sanitizeFriendCode(candidate);
  return normalized.length === FRIEND_CODE_LENGTH ? normalized : null;
}

export function createFriendQrPayload(friendCode: string): string {
  return `yummyrecs://friends/add?friendCode=${encodeURIComponent(sanitizeFriendCode(friendCode))}`;
}
