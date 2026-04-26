export interface AuthActionTokenPayload {
  collectionId?: string;
  email?: string;
  exp?: number;
  id?: string;
  type?: string;
}

export function decodeAuthActionTokenPayload(token: string | undefined): AuthActionTokenPayload | null {
  const [, rawPayload] = token?.trim().split('.') ?? [];
  if (!rawPayload) {
    return null;
  }

  try {
    const normalizedPayload = rawPayload.replace(/-/g, '+').replace(/_/g, '/');
    const paddedPayload = normalizedPayload.padEnd(
      normalizedPayload.length + ((4 - (normalizedPayload.length % 4)) % 4),
      '=',
    );
    const decodedPayload = globalThis.atob(paddedPayload);
    const payload = JSON.parse(decodedPayload) as unknown;

    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const candidate = payload as Record<string, unknown>;

    return {
      collectionId: typeof candidate.collectionId === 'string' ? candidate.collectionId : undefined,
      email: typeof candidate.email === 'string' ? candidate.email.trim().toLowerCase() : undefined,
      exp: typeof candidate.exp === 'number' ? candidate.exp : undefined,
      id: typeof candidate.id === 'string' ? candidate.id : undefined,
      type: typeof candidate.type === 'string' ? candidate.type : undefined,
    };
  } catch {
    return null;
  }
}
