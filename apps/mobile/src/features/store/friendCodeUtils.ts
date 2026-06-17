const FRIEND_CODE_LENGTH = 8;
const FRIEND_QR_PROTOCOL = 'yummyrecs:';
const FRIEND_QR_HOST = 'friends';
const FRIEND_QR_PATHNAME = '/add';
const FRIEND_QR_CODE_PARAM = 'friendCode';

export type FriendRequestEntryMethod = 'manual_code' | 'qr_scan';

export type FriendRequestValidationFailureReason =
  | 'missing_code'
  | 'invalid_code_length'
  | 'self_code';

export type FriendRequestValidationResult =
  | {
      code: string;
      ok: true;
    }
  | {
      codeLength: number;
      message: string;
      ok: false;
      reason: FriendRequestValidationFailureReason;
    };

export function sanitizeFriendCode(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, FRIEND_CODE_LENGTH);
}

export function validateFriendRequestCode({
  code,
  entryMethod,
  ownFriendCode,
}: {
  code: string;
  entryMethod: FriendRequestEntryMethod;
  ownFriendCode: string;
}): FriendRequestValidationResult {
  const normalizedCode = sanitizeFriendCode(code);

  if (!normalizedCode) {
    return {
      codeLength: 0,
      message: 'Friend code is required.',
      ok: false,
      reason: entryMethod === 'manual_code' ? 'missing_code' : 'invalid_code_length',
    };
  }

  if (normalizedCode.length !== FRIEND_CODE_LENGTH) {
    return {
      codeLength: normalizedCode.length,
      message: 'Friend code must be 8 characters.',
      ok: false,
      reason: 'invalid_code_length',
    };
  }

  if (normalizedCode === ownFriendCode) {
    return {
      codeLength: normalizedCode.length,
      message: 'You cannot add yourself as a friend.',
      ok: false,
      reason: 'self_code',
    };
  }

  return {
    code: normalizedCode,
    ok: true,
  };
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

  try {
    const parsed = new URL(trimmedPayload);
    if (
      parsed.protocol !== FRIEND_QR_PROTOCOL ||
      parsed.hostname !== FRIEND_QR_HOST ||
      parsed.pathname !== FRIEND_QR_PATHNAME
    ) {
      return null;
    }

    const candidate = parsed.searchParams.get(FRIEND_QR_CODE_PARAM);
    if (!candidate || !/^[a-zA-Z0-9]{8}$/.test(candidate)) {
      return null;
    }

    const normalized = sanitizeFriendCode(candidate);
    return normalized.length === FRIEND_CODE_LENGTH ? normalized : null;
  } catch {
    return null;
  }
}

export function createFriendQrPayload(friendCode: string): string {
  return `yummyrecs://friends/add?${FRIEND_QR_CODE_PARAM}=${encodeURIComponent(sanitizeFriendCode(friendCode))}`;
}
