import { ClientResponseError } from 'pocketbase';

export function isRequestAbortError(error: unknown): boolean {
  if (error instanceof ClientResponseError) {
    return error.isAbort;
  }

  if (error instanceof Error) {
    return error.name === 'AbortError' || error.message === 'Aborted';
  }

  return false;
}
