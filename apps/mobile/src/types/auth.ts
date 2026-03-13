export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  verified: boolean;
  isAdmin?: boolean;
  isSubscriber?: boolean;
  isBetaUser?: boolean;
}

export function normalizeAuthUser(record: Record<string, unknown> | null | undefined): AuthUser | null {
  if (!record) {
    return null;
  }

  const id = typeof record.id === 'string' ? record.id : '';
  const email = typeof record.email === 'string' ? record.email : '';

  if (!id || !email) {
    return null;
  }

  return {
    id,
    email,
    name: typeof record.name === 'string' ? record.name : undefined,
    verified: Boolean(record.verified),
    isAdmin: Boolean(record.isAdmin),
    isSubscriber: Boolean(record.isSubscriber),
    isBetaUser: Boolean(record.isBetaUser),
  };
}
