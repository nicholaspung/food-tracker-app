function createId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

export function createEntityId(prefix: string): string {
  return createId(prefix);
}
