import PocketBase, { isTokenExpired } from 'pocketbase';

import { env } from '@/lib/env';

export const pb = new PocketBase(env.apiUrl);

let fileAccessToken = '';
let fileAccessTokenRequest: Promise<string> | null = null;

export async function refreshAdminFileAccessToken(): Promise<string> {
  if (!pb.authStore.isValid) {
    clearAdminFileAccessToken();
    return '';
  }

  if (fileAccessToken && !isTokenExpired(fileAccessToken, 105)) {
    return fileAccessToken;
  }

  if (!fileAccessTokenRequest) {
    const authToken = pb.authStore.token;
    const request = pb.files
      .getToken({ requestKey: null })
      .then((token) => {
        if (pb.authStore.isValid && pb.authStore.token === authToken) {
          fileAccessToken = token;
          return token;
        }

        return '';
      })
      .finally(() => {
        if (fileAccessTokenRequest === request) {
          fileAccessTokenRequest = null;
        }
      });
    fileAccessTokenRequest = request;
  }

  return fileAccessTokenRequest;
}

export function clearAdminFileAccessToken(): void {
  fileAccessToken = '';
  fileAccessTokenRequest = null;
}

pb.autoCancellation(false);
