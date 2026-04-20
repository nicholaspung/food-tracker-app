import type {
  EnqueueMutationInput,
  MutationStatus,
  MutationQueueStats,
  MutationQueueStore,
  QueuedMutation,
} from './types';

import { getEnvironmentStorageKey } from '../config/persistence';

const STORAGE_KEY = getEnvironmentStorageKey('food_tracker_mobile_web_offline_queue_v1');
const DEFAULT_MAX_ATTEMPTS = 5;

export class SQLiteMutationQueueStore implements MutationQueueStore {
  private memoryStore: QueuedMutation[] = [];

  async initialize(): Promise<void> {
    const filteredMutations = this.readMutations().filter(
      (mutation) => !mutation.url.includes('/api/mobile/offline-probe'),
    );
    this.writeMutations(filteredMutations);
  }

  async enqueue(input: EnqueueMutationInput): Promise<QueuedMutation> {
    const timestamp = Date.now();
    const mutation: QueuedMutation = {
      id: createMutationId(),
      method: input.method,
      url: input.url,
      body: serializeBody(input.body),
      headers: normalizeHeaders(input.headers),
      status: 'pending',
      idempotencyKey: input.idempotencyKey ?? createIdempotencyKey(),
      attemptCount: 0,
      maxAttempts: input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
      nextRetryAt: 0,
      lastError: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      lastAttemptAt: null,
    };

    const mutations = this.readMutations();
    mutations.push(mutation);
    this.writeMutations(mutations);
    return mutation;
  }

  async getQueuedMutations(limit: number): Promise<QueuedMutation[]> {
    return this.readMutations()
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, Math.max(1, limit));
  }

  async getReadyMutations(now: number, limit: number): Promise<QueuedMutation[]> {
    return this.readMutations()
      .filter(
        (mutation) =>
          (mutation.status === 'pending' || mutation.status === 'retrying') &&
          mutation.nextRetryAt <= now,
      )
      .sort((left, right) => left.createdAt - right.createdAt)
      .slice(0, Math.max(1, limit));
  }

  async markInFlight(id: string, at: number): Promise<void> {
    this.updateMutation(id, (mutation) => ({
      ...mutation,
      status: 'in_flight',
      attemptCount: mutation.attemptCount + 1,
      lastAttemptAt: at,
      updatedAt: at,
    }));
  }

  async remove(id: string): Promise<void> {
    this.writeMutations(this.readMutations().filter((mutation) => mutation.id !== id));
  }

  async markRetryableFailure(
    id: string,
    error: string,
    nextRetryAt: number,
    at: number,
  ): Promise<void> {
    this.updateMutation(id, (mutation) => ({
      ...mutation,
      status: 'retrying',
      lastError: error,
      nextRetryAt,
      updatedAt: at,
    }));
  }

  async markTerminalFailure(id: string, error: string, at: number): Promise<void> {
    this.updateMutation(id, (mutation) => ({
      ...mutation,
      status: 'failed',
      lastError: error,
      nextRetryAt: 0,
      updatedAt: at,
    }));
  }

  async retryFailedMutations(at: number): Promise<number> {
    let resetCount = 0;
    const mutations = this.readMutations().map((mutation) => {
      if (mutation.status !== 'failed') {
        return mutation;
      }

      resetCount += 1;
      return {
        ...mutation,
        status: 'pending' as MutationStatus,
        lastError: null,
        nextRetryAt: 0,
        updatedAt: at,
      };
    });

    this.writeMutations(mutations);
    return resetCount;
  }

  async getStats(): Promise<MutationQueueStats> {
    const mutations = this.readMutations();
    const failedMutations = mutations.filter((mutation) => mutation.status === 'failed');
    const retryingMutations = mutations
      .filter((mutation) => mutation.status === 'retrying')
      .sort((left, right) => left.nextRetryAt - right.nextRetryAt);
    const latestErrorMutation = mutations
      .filter((mutation) => mutation.lastError)
      .sort((left, right) => right.updatedAt - left.updatedAt)[0];

    return {
      queueDepth: mutations.length,
      failedCount: failedMutations.length,
      nextRetryAt: retryingMutations[0]?.nextRetryAt ?? null,
      lastError: latestErrorMutation?.lastError ?? null,
    };
  }

  private updateMutation(
    id: string,
    updater: (mutation: QueuedMutation) => QueuedMutation,
  ): void {
    const mutations = this.readMutations().map((mutation) =>
      mutation.id === id ? updater(mutation) : mutation,
    );
    this.writeMutations(mutations);
  }

  private readMutations(): QueuedMutation[] {
    const localStorageValue = getLocalStorageValue(STORAGE_KEY);
    if (!localStorageValue) {
      return this.memoryStore;
    }

    try {
      const parsedValue = JSON.parse(localStorageValue) as unknown;
      if (!Array.isArray(parsedValue)) {
        return this.memoryStore;
      }

      const mutations = parsedValue.filter(isQueuedMutation);
      this.memoryStore = mutations;
      return mutations;
    } catch {
      return this.memoryStore;
    }
  }

  private writeMutations(mutations: QueuedMutation[]): void {
    this.memoryStore = mutations;
    setLocalStorageValue(STORAGE_KEY, JSON.stringify(mutations));
  }
}

function getLocalStorageValue(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function setLocalStorageValue(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // Ignore storage failures and keep the in-memory fallback working for this session.
  }
}

function isQueuedMutation(value: unknown): value is QueuedMutation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Partial<QueuedMutation>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.method === 'string' &&
    typeof candidate.url === 'string' &&
    typeof candidate.status === 'string' &&
    typeof candidate.idempotencyKey === 'string' &&
    typeof candidate.attemptCount === 'number' &&
    typeof candidate.maxAttempts === 'number' &&
    typeof candidate.nextRetryAt === 'number' &&
    typeof candidate.createdAt === 'number' &&
    typeof candidate.updatedAt === 'number'
  );
}

function serializeBody(body: unknown): string | null {
  if (body === undefined || body === null) {
    return null;
  }

  if (typeof body === 'string') {
    return body;
  }

  return JSON.stringify(body);
}

function normalizeHeaders(headers?: Record<string, string>): Record<string, string> {
  return headers ? { ...headers } : {};
}

function createMutationId(): string {
  return `mut_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function createIdempotencyKey(): string {
  return `idem_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}
