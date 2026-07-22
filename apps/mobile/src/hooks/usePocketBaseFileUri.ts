import { useSyncExternalStore } from 'react';

import {
  getPocketBaseFileAccessTokenVersion,
  replacePocketBaseFileUrlToken,
  subscribeToPocketBaseFileAccessToken,
} from '../lib/pocketbase';

export function usePocketBaseFileUri(uri: string): string {
  useSyncExternalStore(
    subscribeToPocketBaseFileAccessToken,
    getPocketBaseFileAccessTokenVersion,
    getPocketBaseFileAccessTokenVersion,
  );

  return replacePocketBaseFileUrlToken(uri);
}
