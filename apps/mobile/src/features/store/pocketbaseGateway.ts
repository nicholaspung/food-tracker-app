import type { RecordModel } from 'pocketbase';

import { pb } from '../../lib/pocketbase';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface CollectionListOptions {
  filter?: string;
  sort?: string;
  expand?: string;
  fields?: string;
}

interface CollectionGetOptions {
  expand?: string;
  fields?: string;
}

interface CollectionUpdateOptions {
  expand?: string;
  fields?: string;
}

export async function listCollectionRecords<T>(
  collectionName: string,
  options?: CollectionListOptions,
): Promise<T[]> {
  return pb.collection(collectionName).getFullList<T>(options);
}

export async function getCollectionRecord<T>(
  collectionName: string,
  recordId: string,
  options?: CollectionGetOptions,
): Promise<T> {
  return pb.collection(collectionName).getOne<T>(recordId, options);
}

export async function createCollectionRecord<T>(
  collectionName: string,
  payload: Record<string, unknown>,
): Promise<T> {
  return pb.collection(collectionName).create<T>(payload);
}

export async function updateCollectionRecord<T>(
  collectionName: string,
  recordId: string,
  payload: Record<string, unknown>,
  options?: CollectionUpdateOptions,
): Promise<T> {
  return pb.collection(collectionName).update<T>(recordId, payload, options);
}

export async function deleteCollectionRecord(collectionName: string, recordId: string): Promise<void> {
  await pb.collection(collectionName).delete(recordId);
}

export async function getCollectionCount(collectionName: string, filter?: string): Promise<number> {
  const response = await pb.collection(collectionName).getList(1, 1, filter ? { filter } : undefined);
  return response.totalItems;
}

export async function sendApiRequest<T = unknown>(
  path: string,
  init: {
    method: HttpMethod;
    body?: unknown;
  },
): Promise<T> {
  const options: {
    method: HttpMethod;
    body?: unknown;
  } = {
    method: init.method,
  };

  if (init.body !== undefined) {
    options.body = init.body;
  }

  return pb.send<T>(path, options);
}

export function getAuthenticatedUserIdOrNull(): string | null {
  return pb.authStore.record?.id ?? null;
}

export function getAuthRecord(): Record<string, unknown> | null {
  return (pb.authStore.record as Record<string, unknown> | null) ?? null;
}

export function saveAuthRecord(record: RecordModel): void {
  if (!pb.authStore.token) {
    return;
  }

  pb.authStore.save(pb.authStore.token, record);
}

export function resolveDefaultVisitVisibilityFromAuth(): 'friends' | 'private' {
  return pb.authStore.record?.defaultVisitVisibility === 'private' ? 'private' : 'friends';
}

export function resolveDefaultRestaurantVisibilityFromAuth(
  isAdmin: boolean,
): 'private' | 'friends' | 'public' {
  const value = pb.authStore.record?.defaultRestaurantVisibility;

  if (value === 'private') {
    return 'private';
  }

  if (value === 'public' && isAdmin) {
    return 'public';
  }

  return 'friends';
}

export function buildPocketBaseFileUrl(input: {
  collectionId?: string;
  collectionName: string;
  recordId: string;
  filename: string;
  thumb?: string;
}): string {
  const record = {
    collectionId: input.collectionId,
    collectionName: input.collectionName,
    id: input.recordId,
  };

  if (input.thumb) {
    return pb.files.getURL(record, input.filename, { thumb: input.thumb });
  }

  return pb.files.getURL(record, input.filename);
}

export async function requestUserPasswordReset(email: string): Promise<void> {
  await pb.collection('users').requestPasswordReset(email);
}

export async function confirmUserPasswordReset(
  token: string,
  password: string,
  passwordConfirm: string,
): Promise<void> {
  await pb.collection('users').confirmPasswordReset(token, password, passwordConfirm);
}

export async function confirmUserEmailVerification(token: string): Promise<void> {
  await pb.collection('users').confirmVerification(token);
}
