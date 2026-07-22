import PocketBase, { isTokenExpired } from 'pocketbase';

import { env } from '../config/env';
import { authStore } from './pocketbaseAuthStore';

export const pb = new PocketBase(env.pocketbaseUrl, authStore);

let fileAccessToken = '';
let fileAccessTokenUserId = '';
let fileAccessTokenRequest: { authToken: string; promise: Promise<string>; userId: string } | null = null;
let fileAccessTokenVersion = 0;
const fileAccessTokenListeners = new Set<() => void>();

function publishFileAccessTokenChange(): void {
  fileAccessTokenVersion += 1;
  for (const listener of fileAccessTokenListeners) {
    listener();
  }
}

export function subscribeToPocketBaseFileAccessToken(listener: () => void): () => void {
  fileAccessTokenListeners.add(listener);
  return () => fileAccessTokenListeners.delete(listener);
}

export function getPocketBaseFileAccessTokenVersion(): number {
  return fileAccessTokenVersion;
}

export function getPocketBaseFileAccessToken(): string {
  const userId = pb.authStore.record?.id ?? '';
  if (!userId) {
    return '';
  }

  if (fileAccessTokenUserId !== userId) {
    fileAccessToken = authStore.getFileAccessToken(userId);
    fileAccessTokenUserId = fileAccessToken ? userId : '';
  }

  return fileAccessToken;
}

export async function refreshPocketBaseFileAccessToken(): Promise<string> {
  if (!pb.authStore.isValid) {
    clearPocketBaseFileAccessToken();
    return '';
  }

  const currentToken = getPocketBaseFileAccessToken();
  if (currentToken && !isTokenExpired(currentToken, 75)) {
    return currentToken;
  }

  const authToken = pb.authStore.token;
  const userId = pb.authStore.record?.id ?? '';
  if (fileAccessTokenRequest?.authToken === authToken && fileAccessTokenRequest.userId === userId) {
    return fileAccessTokenRequest.promise;
  }

  const request = pb.files
    .getToken({ requestKey: null })
    .then((token) => {
      if (pb.authStore.isValid && pb.authStore.token === authToken && pb.authStore.record?.id === userId) {
        const didChange = fileAccessToken !== token || fileAccessTokenUserId !== userId;
        fileAccessToken = token;
        fileAccessTokenUserId = userId;
        authStore.saveFileAccessToken(token, userId);
        if (didChange) {
          publishFileAccessTokenChange();
        }
        return token;
      }

      return '';
    })
    .finally(() => {
      if (fileAccessTokenRequest?.promise === request) {
        fileAccessTokenRequest = null;
      }
    });
  fileAccessTokenRequest = { authToken, promise: request, userId };

  return request;
}

export function clearPocketBaseFileAccessToken(): void {
  const didChange = Boolean(fileAccessToken || fileAccessTokenUserId);
  fileAccessToken = '';
  fileAccessTokenUserId = '';
  fileAccessTokenRequest = null;
  authStore.clearFileAccessToken();
  if (didChange) {
    publishFileAccessTokenChange();
  }
}

export function replacePocketBaseFileUrlToken(uri: string): string {
  const token = getPocketBaseFileAccessToken();
  if (!token || !uri.includes('/api/files/')) {
    return uri;
  }

  try {
    const url = new URL(uri);
    url.searchParams.set('token', token);
    return url.toString();
  } catch {
    return uri;
  }
}

pb.beforeSend = async (url, options) => {
  if (pb.authStore.isValid && !url.includes('/api/files/token')) {
    await refreshPocketBaseFileAccessToken().catch(() => {
      // Data requests and the last disk-cached image key remain usable on transient failures.
    });
  }

  return { url, options };
};

// Keep global auto-cancellation disabled because some overlapping request flows are legitimate.
// Search-heavy React Query reads should opt into cancellation with AbortSignal instead.
pb.autoCancellation(false);
