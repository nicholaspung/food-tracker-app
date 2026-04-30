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

  return {
    id: mutation.id,
    operationName,
    payload: payload as FeatureOutboxOperationPayload<typeof operationName>,
    status: mutation.status,
    createdAt: mutation.createdAt,
    idempotencyKey: mutation.idempotencyKey,
    lastError: mutation.lastError,
  };
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
