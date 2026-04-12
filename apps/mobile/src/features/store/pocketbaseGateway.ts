import { ClientResponseError, type RecordModel } from 'pocketbase';

import { pb } from '../../lib/pocketbase';
import { trackObservabilityEvent } from '../../observability';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface PocketBaseRequestOptions {
  signal?: AbortSignal;
}

export interface ApiRequestInit extends PocketBaseRequestOptions {
  method: HttpMethod;
  body?: unknown;
  headers?: Record<string, string>;
}

interface CollectionListOptions extends PocketBaseRequestOptions {
  filter?: string;
  sort?: string;
  expand?: string;
  fields?: string;
  pageSize?: number;
}

interface CollectionPageOptions extends PocketBaseRequestOptions {
  filter?: string;
  sort?: string;
  expand?: string;
  fields?: string;
  page?: number;
  pageSize?: number;
}

interface CollectionGetOptions extends PocketBaseRequestOptions {
  expand?: string;
  fields?: string;
}

interface CollectionUpdateOptions extends PocketBaseRequestOptions {
  expand?: string;
  fields?: string;
}

function sanitizeCollectionOptions<T extends Record<string, string | number | undefined>>(
  options?: T,
): Partial<T> | undefined {
  if (!options) {
    return undefined;
  }

  const sanitizedEntries = Object.entries(options).filter(([, value]) => value !== undefined);

  if (sanitizedEntries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(sanitizedEntries) as Partial<T>;
}

export async function listCollectionRecords<T>(
  collectionName: string,
  options?: CollectionListOptions,
): Promise<T[]> {
  const { pageSize = 100, signal, ...listOptions } = options ?? {};
  const normalizedPageSize = Number.isFinite(pageSize) ? Math.max(1, Math.floor(pageSize)) : 100;
  const sanitizedListOptions = sanitizeCollectionOptions(listOptions);
  const requestOptions = signal ? { ...sanitizedListOptions, signal } : sanitizedListOptions;
  const records: T[] = [];
  let page = 1;

  while (true) {
    const response = await pb.collection(collectionName).getList<T>(
      page,
      normalizedPageSize,
      requestOptions,
    );
    records.push(...response.items);

    if (response.items.length === 0 || page >= response.totalPages) {
      break;
    }

    page += 1;
  }

  return records;
}

export interface CollectionPageResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
}

export async function listCollectionPage<T>(
  collectionName: string,
  options?: CollectionPageOptions,
): Promise<CollectionPageResult<T>> {
  const { page = 1, pageSize = 20, signal, ...listOptions } = options ?? {};
  const normalizedPage = Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1;
  const normalizedPageSize = Number.isFinite(pageSize) ? Math.max(1, Math.floor(pageSize)) : 20;
  const sanitizedListOptions = sanitizeCollectionOptions(listOptions);
  const requestOptions = signal ? { ...sanitizedListOptions, signal } : sanitizedListOptions;
  const response = await pb.collection(collectionName).getList<T>(
    normalizedPage,
    normalizedPageSize,
    requestOptions,
  );

  return {
    items: response.items,
    page: response.page,
    pageSize: response.perPage,
    totalItems: response.totalItems,
    totalPages: response.totalPages,
    hasNextPage: response.page < response.totalPages,
  };
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
  try {
    const record = await pb.collection(collectionName).create<T>(payload);
    trackObservabilityEvent('DIRECT_WRITE_SUCCEEDED', {
      collectionName,
      operation: 'createCollectionRecord',
    });
    return record;
  } catch (error) {
    trackObservabilityEvent('DIRECT_WRITE_FAILED', {
      collectionName,
      operation: 'createCollectionRecord',
      ...resolveErrorProperties(error),
    });
    throw error;
  }
}

export async function updateCollectionRecord<T>(
  collectionName: string,
  recordId: string,
  payload: Record<string, unknown>,
  options?: CollectionUpdateOptions,
): Promise<T> {
  try {
    const record = await pb.collection(collectionName).update<T>(recordId, payload, options);
    trackObservabilityEvent('DIRECT_WRITE_SUCCEEDED', {
      collectionName,
      operation: 'updateCollectionRecord',
      recordId,
    });
    return record;
  } catch (error) {
    trackObservabilityEvent('DIRECT_WRITE_FAILED', {
      collectionName,
      operation: 'updateCollectionRecord',
      recordId,
      ...resolveErrorProperties(error),
    });
    throw error;
  }
}

export async function getCollectionCount(
  collectionName: string,
  filter?: string,
  options?: PocketBaseRequestOptions,
): Promise<number> {
  const requestOptions = sanitizeCollectionOptions({ filter });
  const response = await pb.collection(collectionName).getList(
    1,
    1,
    options?.signal ? { ...requestOptions, signal: options.signal } : requestOptions,
  );
  return response.totalItems;
}

export async function sendApiRequest<T = unknown>(
  path: string,
  init: ApiRequestInit,
): Promise<T> {
  const options: {
    method: HttpMethod;
    body?: unknown;
    headers?: Record<string, string>;
    signal?: AbortSignal;
  } = {
    method: init.method,
  };
  const headers = resolveApiRequestHeaders(init);

  if (init.body !== undefined) {
    options.body = init.body;
  }
  if (headers) {
    options.headers = headers;
  }
  if (init.signal) {
    options.signal = init.signal;
  }

  try {
    const response = await pb.send<T>(path, options);
    trackObservabilityEvent('DIRECT_API_REQUEST_SUCCEEDED', {
      method: init.method,
      hasBody: init.body !== undefined,
      isAuthenticated: Boolean(headers?.Authorization),
      path,
    });
    return response;
  } catch (error) {
    trackObservabilityEvent('DIRECT_API_REQUEST_FAILED', {
      method: init.method,
      hasBody: init.body !== undefined,
      isAuthenticated: Boolean(headers?.Authorization),
      path,
      ...resolveErrorProperties(error),
    });
    throw error;
  }
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

export function resolveDefaultRestaurantVisibilityFromAuth(): 'private' | 'friends' {
  return pb.authStore.record?.defaultRestaurantVisibility === 'private' ? 'private' : 'friends';
}

export function resolveDefaultListVisibilityFromAuth(): 'private' | 'friends' {
  return pb.authStore.record?.defaultListVisibility === 'private' ? 'private' : 'friends';
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
  try {
    await pb.collection('users').requestPasswordReset(email);
    trackObservabilityEvent('AUTH_PASSWORD_RESET_REQUEST_SUCCEEDED', {
      source: 'pocketbaseGateway',
    });
  } catch (error) {
    trackObservabilityEvent('AUTH_PASSWORD_RESET_REQUEST_FAILED', {
      source: 'pocketbaseGateway',
      ...resolveErrorProperties(error),
    });
    throw error;
  }
}

export async function confirmUserPasswordReset(
  token: string,
  password: string,
  passwordConfirm: string,
): Promise<void> {
  try {
    await pb.collection('users').confirmPasswordReset(token, password, passwordConfirm);
    trackObservabilityEvent('AUTH_PASSWORD_RESET_CONFIRM_SUCCEEDED', {
      source: 'pocketbaseGateway',
    });
  } catch (error) {
    trackObservabilityEvent('AUTH_PASSWORD_RESET_CONFIRM_FAILED', {
      source: 'pocketbaseGateway',
      ...resolveErrorProperties(error),
    });
    throw error;
  }
}

export async function confirmUserEmailVerification(token: string): Promise<void> {
  try {
    await pb.collection('users').confirmVerification(token);
    trackObservabilityEvent('AUTH_EMAIL_VERIFICATION_SUCCEEDED', {
      source: 'pocketbaseGateway',
    });
  } catch (error) {
    trackObservabilityEvent('AUTH_EMAIL_VERIFICATION_FAILED', {
      source: 'pocketbaseGateway',
      ...resolveErrorProperties(error),
    });
    throw error;
  }
}

function resolveErrorProperties(error: unknown): {
  errorMessage: string;
  errorType: string;
  statusCode?: number;
} {
  if (error instanceof ClientResponseError) {
    const statusCode = Number.isFinite(error.status) && error.status > 0 ? error.status : undefined;

    return {
      errorMessage:
        typeof error.response?.message === 'string' && error.response.message.trim().length > 0
          ? error.response.message
          : error.message,
      errorType: 'ClientResponseError',
      statusCode,
    };
  }

  if (error instanceof Error) {
    return {
      errorMessage: error.message,
      errorType: error.name,
    };
  }

  return {
    errorMessage: String(error),
    errorType: 'unknown_error',
  };
}

function resolveApiRequestHeaders(init: ApiRequestInit): Record<string, string> | undefined {
  const headers = { ...(init.headers ?? {}) };
  const authToken = pb.authStore.token?.trim();

  if (authToken && !hasHeader(headers, 'Authorization')) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  if (init.body !== undefined && !isFormDataBody(init.body) && !hasHeader(headers, 'Content-Type')) {
    headers['Content-Type'] = 'application/json';
  }

  return Object.keys(headers).length > 0 ? headers : undefined;
}

function hasHeader(headers: Record<string, string>, targetHeader: string): boolean {
  const normalizedTarget = targetHeader.toLowerCase();
  return Object.keys(headers).some((header) => header.toLowerCase() === normalizedTarget);
}

function isFormDataBody(body: unknown): body is FormData {
  return typeof FormData !== 'undefined' && body instanceof FormData;
}
