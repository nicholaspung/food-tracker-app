import { ClientResponseError } from 'pocketbase';

import { pb } from '../../lib/pocketbase';
import { trackObservabilityEvent } from '../../observability';
import { buildSafeTelemetryErrorProperties } from '../../observability/telemetryError';
import type { ModerationContentStatus } from '../models';
import type { PaginatedResult } from './featureStore';
import { deleteCollectionRecord, type CollectionPageResult } from './pocketbaseGateway';

interface PageInputLike {
  page?: number;
  pageSize?: number;
}

const DEFAULT_FEATURE_PAGE_SIZE = 20;

type MutationPropertyValue = string | number | boolean | null | undefined;
type MutationProperties = Record<string, MutationPropertyValue>;

export interface FeatureWriteRequestOptions {
  headers?: Record<string, string>;
}

function compactMutationProperties(
  properties: MutationProperties | undefined,
): Record<string, string | number | boolean | null> {
  if (!properties) {
    return {};
  }

  const compacted: Record<string, string | number | boolean | null> = {};
  Object.entries(properties).forEach(([key, value]) => {
    if (value !== undefined) {
      compacted[key] = value;
    }
  });
  return compacted;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export async function trackFeatureMutation<T>(
  action: string,
  operation: () => Promise<T>,
  properties?: MutationProperties,
): Promise<T> {
  const startedAtMs = Date.now();
  const baseProperties = {
    action,
    ...compactMutationProperties(properties),
  };

  trackObservabilityEvent('FEATURE_MUTATION_STARTED', baseProperties);

  try {
    const result = await operation();
    trackObservabilityEvent('FEATURE_MUTATION_SUCCEEDED', {
      ...baseProperties,
      durationMs: Date.now() - startedAtMs,
    });
    return result;
  } catch (error) {
    trackObservabilityEvent('FEATURE_MUTATION_FAILED', {
      ...baseProperties,
      durationMs: Date.now() - startedAtMs,
      ...buildSafeTelemetryErrorProperties({
        error,
        sourceOperation: action,
      }),
    });
    throw error;
  }
}

export function resolvePaginationInput(input?: PageInputLike): { page: number; pageSize: number } {
  const page =
    typeof input?.page === 'number' && Number.isFinite(input.page) ? Math.max(1, Math.floor(input.page)) : 1;
  const pageSize =
    typeof input?.pageSize === 'number' && Number.isFinite(input.pageSize)
      ? Math.max(1, Math.floor(input.pageSize))
      : DEFAULT_FEATURE_PAGE_SIZE;

  return {
    page,
    pageSize,
  };
}

export function mapPaginatedResult<TInput, TOutput>(
  pageResult: CollectionPageResult<TInput>,
  items: TOutput[],
): PaginatedResult<TOutput> {
  return {
    items,
    page: pageResult.page,
    pageSize: pageResult.pageSize,
    totalItems: pageResult.totalItems,
    totalPages: pageResult.totalPages,
    hasNextPage: pageResult.hasNextPage,
  };
}

export function createEmptyPaginatedResult<T>(input?: PageInputLike): PaginatedResult<T> {
  const { page, pageSize } = resolvePaginationInput(input);
  return {
    items: [],
    page,
    pageSize,
    totalItems: 0,
    totalPages: 0,
    hasNextPage: false,
  };
}

export function getAuthenticatedUserId(): string {
  const userId = pb.authStore.record?.id;
  if (!userId) {
    throw new Error('Authentication required.');
  }

  return userId;
}

export function isNotFoundError(error: unknown): boolean {
  return error instanceof ClientResponseError && error.status === 404;
}

export async function deleteCollectionRecordsIgnoringNotFound(
  collectionName: string,
  recordIds: readonly string[],
  requestOptions?: FeatureWriteRequestOptions,
): Promise<void> {
  const normalizedRecordIds = Array.from(
    new Set(
      recordIds
        .map((recordId) => recordId.trim())
        .filter((recordId) => recordId.length > 0),
    ),
  );
  if (normalizedRecordIds.length === 0) {
    return;
  }

  const deleteResults = await Promise.allSettled(
    normalizedRecordIds.map((recordId) =>
      deleteCollectionRecord(collectionName, recordId, {
        headers: resolveFeatureWriteHeaders(requestOptions),
      }),
    ),
  );

  for (const deleteResult of deleteResults) {
    if (deleteResult.status === 'rejected' && !isNotFoundError(deleteResult.reason)) {
      throw deleteResult.reason;
    }
  }
}

export function escapeFilterValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function buildOrFilter(fieldName: string, values: string[]): string {
  const filter = values.map((value) => `${fieldName} = "${escapeFilterValue(value)}"`).join(' || ');
  return values.length > 1 ? `(${filter})` : filter;
}

export function resolveExpandedUserName(
  user: { name?: string; email?: string } | undefined,
): string | undefined {
  const trimmedName = user?.name?.trim();
  if (trimmedName) {
    return trimmedName;
  }

  const trimmedEmail = user?.email?.trim();
  if (trimmedEmail) {
    return trimmedEmail.split('@')[0];
  }

  return undefined;
}

export function normalizeStoredVisibility(value: unknown): 'friends' | 'private' {
  return value === 'private' ? 'private' : 'friends';
}

export function getDefaultVisitVisibility(): 'friends' | 'private' {
  return normalizeStoredVisibility(pb.authStore.record?.defaultVisitVisibility);
}

export function normalizeModerationContentStatus(value: unknown): ModerationContentStatus | undefined {
  switch (value) {
    case 'active':
    case 'reviewed':
    case 'under_review':
    case 'hidden':
    case 'removed':
    case 'escalated':
      return value;
    default:
      return undefined;
  }
}

export function resolveFeatureWriteHeaders(
  requestOptions?: FeatureWriteRequestOptions,
): Record<string, string> | undefined {
  if (!requestOptions?.headers) {
    return undefined;
  }

  const normalizedHeaders = Object.fromEntries(
    Object.entries(requestOptions.headers).filter(([, value]) => typeof value === 'string' && value.length > 0),
  );

  return Object.keys(normalizedHeaders).length > 0 ? normalizedHeaders : undefined;
}
