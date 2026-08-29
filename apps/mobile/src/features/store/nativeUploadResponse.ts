export function parseNativeUploadErrorResponse(
  body: string,
  fallbackMessage: string,
): Record<string, unknown> {
  try {
    const parsedBody = JSON.parse(body) as unknown;
    if (parsedBody !== null && typeof parsedBody === 'object' && !Array.isArray(parsedBody)) {
      return parsedBody as Record<string, unknown>;
    }
  } catch {
    // Native uploads can surface plain text instead of PocketBase JSON errors.
  }

  return {
    data: {},
    message: body.trim() || fallbackMessage,
  };
}
