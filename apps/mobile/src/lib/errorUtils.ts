export function getErrorMessage(error: unknown, fallback: string): string {
  if (!error || typeof error !== 'object') {
    return fallback;
  }

  if ('data' in error && error.data && typeof error.data === 'object' && 'message' in error.data) {
    return String(error.data.message);
  }

  if ('message' in error && typeof error.message === 'string') {
    return error.message;
  }

  return fallback;
}
