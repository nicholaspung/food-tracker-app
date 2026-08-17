import type { QueuedMutation } from '../../offline/types';
import {
  parseFeatureOutboxOperationName,
  type FeatureOutboxOperationName,
  type FeatureOutboxOperationPayload,
} from './featureOutboxOperations';

export interface QueuedFeatureWrite<
  TName extends FeatureOutboxOperationName = FeatureOutboxOperationName,
> {
  id: string;
  operationName: TName;
  payload: FeatureOutboxOperationPayload<TName>;
  status: QueuedMutation['status'];
  createdAt: number;
  idempotencyKey: string;
  lastError: string | null;
  originAccountId?: string | null;
}

export function getQueuedMutationOperationName(
  mutation: QueuedMutation,
): FeatureOutboxOperationName | null {
  const headerOperationName =
    mutation.headers['X-Mobile-Write-Operation'] ?? mutation.headers['x-mobile-write-operation'];

  if (headerOperationName) {
    const headerParsedOperation = parseFeatureOutboxOperationName(`local://feature/${headerOperationName}`);
    if (headerParsedOperation) {
      return headerParsedOperation;
    }
  }

  return parseFeatureOutboxOperationName(mutation.url);
}

export function parseQueuedMutationBody(mutation: QueuedMutation): unknown | null {
  if (!mutation.body) {
    return {};
  }

  try {
    return JSON.parse(mutation.body);
  } catch {
    return null;
  }
}

export function parseQueuedFeatureWrite(
  mutation: QueuedMutation,
): QueuedFeatureWrite | null {
  const operationName = getQueuedMutationOperationName(mutation);
  if (!operationName) {
    return null;
  }

  const payload = parseQueuedMutationBody(mutation);
  if (payload === null || typeof payload !== 'object') {
    return null;
  }

  const displayPayload = decodeQueuedFeatureWriteDisplayPayload(operationName, payload);
  if (!displayPayload) {
    return null;
  }

  return {
    id: mutation.id,
    operationName,
    payload: displayPayload,
    status: mutation.status,
    createdAt: mutation.createdAt,
    idempotencyKey: mutation.idempotencyKey,
    lastError: mutation.lastError,
    originAccountId: mutation.originAccountId,
  };
}

function decodeQueuedFeatureWriteDisplayPayload<TName extends FeatureOutboxOperationName>(
  operationName: TName,
  payload: object,
): FeatureOutboxOperationPayload<TName> | null {
  if (!isDisplayableQueuedFeaturePayload(operationName, payload)) {
    return null;
  }

  return payload as FeatureOutboxOperationPayload<TName>;
}

function isDisplayableQueuedFeaturePayload(
  operationName: FeatureOutboxOperationName,
  payload: object,
): boolean {
  switch (operationName) {
    case 'bill.create':
      return hasString(payload, 'title') && hasArray(payload, 'participants');
    case 'food-product.create':
      return hasString(payload, 'itemName');
    case 'list.create':
      return hasString(payload, 'name');
    case 'note.create':
      return hasString(payload, 'content');
    case 'visit.create':
      return hasString(payload, 'restaurantName') && hasArray(payload, 'items');
    default:
      return true;
  }
}

function hasArray(payload: object, key: string): boolean {
  return Array.isArray((payload as Record<string, unknown>)[key]);
}

function hasString(payload: object, key: string): boolean {
  return typeof (payload as Record<string, unknown>)[key] === 'string';
}

export function parseQueuedFeatureWrites(
  mutations: QueuedMutation[],
): QueuedFeatureWrite[] {
  return mutations
    .map((mutation) => parseQueuedFeatureWrite(mutation))
    .filter((mutation): mutation is QueuedFeatureWrite => Boolean(mutation));
}

export function filterQueuedFeatureWrites<TName extends FeatureOutboxOperationName>(
  queuedWrites: QueuedFeatureWrite[],
  operationNames: readonly TName[],
): QueuedFeatureWrite<TName>[] {
  const operationNameSet = new Set<FeatureOutboxOperationName>(operationNames);
  return queuedWrites.filter((write): write is QueuedFeatureWrite<TName> =>
    operationNameSet.has(write.operationName),
  );
}
