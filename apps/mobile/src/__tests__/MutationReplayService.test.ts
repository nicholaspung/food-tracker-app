import { MutationReplayService } from '../offline/MutationReplayService';
import { createFetchMutationTransport } from '../offline/fetchMutationTransport';
import { trackObservabilityEvent } from '../observability';
import type {
  EnqueueMutationInput,
  MutationQueueRetentionCleanupResult,
  MutationQueueStats,
  MutationQueueStore,
  MutationSendResult,
  MutationTransport,
  QueuedMutation,
  SyncSnapshot,
} from '../offline/types';

jest.mock('../observability', () => ({
  identifyObservabilityUser: jest.fn(),
  setObservabilityContext: jest.fn(),
  trackObservabilityEvent: jest.fn(),
}));

interface SharedQueueState {
  rows: Map<string, QueuedMutation>;
}

function createDeferredPromise<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return {
    promise,
    reject,
    resolve,
  };
}

class InMemoryQueueStore implements MutationQueueStore {
  getStatsCallCount = 0;
  onGetStatsBeforeReturn?: () => Promise<void> | void;
  onMarkInFlight?: () => Promise<void> | void;

  constructor(
    private readonly sharedState: SharedQueueState = { rows: new Map() },
    private readonly onInitialize?: (sharedState: SharedQueueState) => Promise<void> | void,
    private readonly onCleanupRetainedMutations?: (
      cutoffTimestamp: number,
      sharedState: SharedQueueState,
    ) => Promise<MutationQueueRetentionCleanupResult> | MutationQueueRetentionCleanupResult,
  ) {}

  async initialize(): Promise<void> {
    const recoveredAt = Date.now();
    for (const mutation of this.sharedState.rows.values()) {
      if (mutation.status === 'in_flight') {
        mutation.status = 'pending';
        mutation.nextRetryAt = 0;
        mutation.updatedAt = recoveredAt;
      }
    }

    await this.onInitialize?.(this.sharedState);
  }

  async enqueue(input: EnqueueMutationInput): Promise<QueuedMutation> {
    const now = Date.now();
    const mutation: QueuedMutation = {
      id: `mut_${this.sharedState.rows.size + 1}`,
      method: input.method,
      url: input.url,
      originAccountId: input.originAccountId ?? null,
      body: typeof input.body === 'string' ? input.body : JSON.stringify(input.body ?? null),
      headers: input.headers ?? {},
      status: 'pending',
      idempotencyKey: input.idempotencyKey ?? `idem_${this.sharedState.rows.size + 1}`,
      attemptCount: 0,
      maxAttempts: input.maxAttempts ?? 5,
      nextRetryAt: 0,
      lastError: null,
      createdAt: now,
      updatedAt: now,
      lastAttemptAt: null,
    };

    this.sharedState.rows.set(mutation.id, mutation);
    return cloneMutation(mutation);
  }

  async getReadyMutations(now: number, limit: number): Promise<QueuedMutation[]> {
    const readyRows = [...this.sharedState.rows.values()]
      .filter((mutation) => {
        return (
          (mutation.status === 'pending' || mutation.status === 'retrying') &&
          mutation.nextRetryAt <= now
        );
      })
      .sort((left, right) => left.createdAt - right.createdAt)
      .slice(0, limit);

    return readyRows.map(cloneMutation);
  }

  async getQueuedMutations(limit: number): Promise<QueuedMutation[]> {
    return [...this.sharedState.rows.values()]
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, Math.max(1, limit))
      .map(cloneMutation);
  }

  async markInFlight(id: string, at: number): Promise<void> {
    const mutation = this.sharedState.rows.get(id);
    if (!mutation) {
      return;
    }

    mutation.status = 'in_flight';
    mutation.attemptCount += 1;
    mutation.lastAttemptAt = at;
    mutation.updatedAt = at;
    await this.onMarkInFlight?.();
  }

  async remove(id: string): Promise<void> {
    this.sharedState.rows.delete(id);
  }

  async markRetryableFailure(
    id: string,
    error: string,
    nextRetryAt: number,
    at: number,
  ): Promise<void> {
    const mutation = this.sharedState.rows.get(id);
    if (!mutation) {
      return;
    }

    mutation.status = 'retrying';
    mutation.lastError = error;
    mutation.nextRetryAt = nextRetryAt;
    mutation.updatedAt = at;
  }

  async markTerminalFailure(id: string, error: string, at: number): Promise<void> {
    const mutation = this.sharedState.rows.get(id);
    if (!mutation) {
      return;
    }

    mutation.status = 'failed';
    mutation.lastError = error;
    mutation.nextRetryAt = 0;
    mutation.updatedAt = at;
  }

  async retryFailedMutations(at: number): Promise<number> {
    let updated = 0;
    for (const mutation of this.sharedState.rows.values()) {
      if (mutation.status === 'failed') {
        mutation.status = 'pending';
        mutation.lastError = null;
        mutation.nextRetryAt = 0;
        mutation.updatedAt = at;
        updated += 1;
      }
    }

    return updated;
  }

  async clearAll(): Promise<number> {
    const clearedCount = this.sharedState.rows.size;
    this.sharedState.rows.clear();
    return clearedCount;
  }

  async cleanupRetainedMutations(cutoffTimestamp: number): Promise<MutationQueueRetentionCleanupResult> {
    if (this.onCleanupRetainedMutations) {
      return this.onCleanupRetainedMutations(cutoffTimestamp, this.sharedState);
    }

    let removedCount = 0;
    for (const [id, mutation] of this.sharedState.rows.entries()) {
      if (mutation.status === 'failed' && mutation.updatedAt < cutoffTimestamp) {
        this.sharedState.rows.delete(id);
        removedCount += 1;
      }
    }

    return { removedCount };
  }

  async getStats(): Promise<MutationQueueStats> {
    this.getStatsCallCount += 1;

    const rows = [...this.sharedState.rows.values()];
    const queueDepth = rows.length;
    const failedRows = rows.filter((mutation) => mutation.status === 'failed');
    const retryRows = rows
      .filter((mutation) => mutation.status === 'retrying')
      .sort((left, right) => left.nextRetryAt - right.nextRetryAt);
    const latestError = rows
      .filter((mutation) => mutation.lastError)
      .sort((left, right) => right.updatedAt - left.updatedAt)[0]?.lastError;

    const stats = {
      queueDepth,
      failedCount: failedRows.length,
      nextRetryAt: retryRows[0]?.nextRetryAt ?? null,
      lastError: latestError ?? null,
    };

    await this.onGetStatsBeforeReturn?.();

    return stats;
  }

  resetGetStatsCallCount(): void {
    this.getStatsCallCount = 0;
  }
}

function createTransport(results: MutationSendResult[]): MutationTransport {
  return {
    cancelPendingRequests: jest.fn(),
    send: jest.fn(async (_mutation, _options) => {
      const [nextResult] = results.splice(0, 1);
      return (
        nextResult ?? {
          ok: true,
          retryable: false,
          statusCode: 200,
          errorMessage: null,
        }
      );
    }),
  };
}

function cloneMutation(mutation: QueuedMutation): QueuedMutation {
  return {
    ...mutation,
    headers: { ...mutation.headers },
  };
}

function buildQueuedMutation(overrides?: Partial<QueuedMutation>): QueuedMutation {
  return {
    id: 'mut_seeded_1',
    method: 'POST',
    url: 'local://feature/food-product.create',
    originAccountId: null,
    body: JSON.stringify({
      itemName: 'Sparkling Water',
    }),
    headers: {
      'X-Mobile-Write-Operation': 'food-product.create',
    },
    status: 'pending',
    idempotencyKey: 'idem_seeded_1',
    attemptCount: 0,
    maxAttempts: 5,
    nextRetryAt: 0,
    lastError: null,
    createdAt: 1000,
    updatedAt: 1000,
    lastAttemptAt: null,
    ...overrides,
  };
}

describe('MutationReplayService', () => {
  const mockedTrackObservabilityEvent = trackObservabilityEvent as jest.MockedFunction<
    typeof trackObservabilityEvent
  >;

  beforeEach(() => {
    mockedTrackObservabilityEvent.mockClear();
  });

  it('initializes storage before an early durable submission', async () => {
    let initialized = false;
    const store = new InMemoryQueueStore(undefined, () => {
      initialized = true;
    });
    const service = new MutationReplayService(store, createTransport([]), () => 1000);

    const mutation = await service.enqueue({
      method: 'POST',
      url: 'local://feature/feedback.create',
      body: { description: 'Body', title: 'Subject' },
    });

    expect(initialized).toBe(true);
    expect(mutation.status).toBe('pending');
    expect(service.getSnapshot()).toMatchObject({
      isInitialized: true,
      queueDepth: 1,
    });
  });

  it('replays retryable failures after backoff and eventually succeeds', async () => {
    let now = 1000;
    const store = new InMemoryQueueStore();
    const transport = createTransport([
      {
        ok: false,
        retryable: true,
        statusCode: 503,
        errorMessage: 'Temporarily unavailable',
      },
      {
        ok: true,
        retryable: false,
        statusCode: 200,
        errorMessage: null,
      },
    ]);
    const service = new MutationReplayService(store, transport, () => now);

    await service.start();
    await service.enqueue({
      method: 'POST',
      url: 'https://api.example.com/visits',
      body: { note: 'queued offline' },
    });

    await service.replay('manual');

    expect(service.getSnapshot().queueDepth).toBe(1);
    expect(service.getSnapshot().failedCount).toBe(0);
    expect(service.getSnapshot().nextRetryAt).not.toBeNull();

    now += 1000 * 60 * 2;
    await service.replay('manual');

    expect(service.getSnapshot().queueDepth).toBe(0);
    expect(service.getSnapshot().failedCount).toBe(0);
  });

  it('does not report discarded or terminally failed mutations as successful replays', async () => {
    const store = new InMemoryQueueStore();
    const service = new MutationReplayService(store, createTransport([{
      errorMessage: 'Rejected',
      ok: false,
      retryable: false,
      statusCode: 400,
    }]), () => 1000);
    await service.start();
    const discarded = await service.enqueue({ method: 'POST', url: 'https://api.example.com/discarded' });
    await service.discardDelivery(discarded.id);
    await service.enqueue({ method: 'POST', url: 'https://api.example.com/failed' });
    const successfulReplayListener = jest.fn();
    service.subscribeSuccessfulReplay(successfulReplayListener);

    await service.replay('manual');

    expect(successfulReplayListener).not.toHaveBeenCalled();
  });

  it('waits for successful replay reconciliation before removing the queued projection', async () => {
    const reconciliationStarted = createDeferredPromise<void>();
    const allowReconciliationToFinish = createDeferredPromise<void>();
    const store = new InMemoryQueueStore();
    const successfulReplay = {
      idempotencyKey: 'idem_reconcile_1',
      identity: { visitId: 'visit_1' },
      operationName: 'visit.update',
      originAccountId: 'user_1',
    } as const;
    const service = new MutationReplayService(
      store,
      createTransport([{
        errorMessage: null,
        ok: true,
        retryable: false,
        statusCode: 200,
        successfulReplay,
      }]),
      () => 1000,
    );
    await service.start();
    await service.enqueue({
      body: { updates: { notes: 'Updated' }, visitId: 'visit_1' },
      idempotencyKey: successfulReplay.idempotencyKey,
      method: 'POST',
      originAccountId: 'user_1',
      url: 'local://feature/visit.update',
    });
    service.subscribeSuccessfulReplay(async (outcome) => {
      expect(outcome).toEqual(successfulReplay);
      reconciliationStarted.resolve();
      await allowReconciliationToFinish.promise;
    });

    const replayPromise = service.replay('reconnect');
    await reconciliationStarted.promise;

    expect(await service.getQueuedMutations(1)).toHaveLength(1);
    expect(service.getSnapshot()).toMatchObject({
      isSyncing: true,
      queueDepth: 1,
    });
    allowReconciliationToFinish.resolve();
    await replayPromise;

    expect(await service.getQueuedMutations(1)).toHaveLength(0);
    expect(service.getSnapshot()).toMatchObject({
      isSyncing: false,
      queueDepth: 0,
    });
  });

  it('replays an ambiguous initial delivery with the same idempotency key', async () => {
    let now = 1000;
    const store = new InMemoryQueueStore();
    const transport = createTransport([]);
    const service = new MutationReplayService(store, transport, () => now);

    await service.start();
    const mutation = await service.enqueue({
      method: 'POST',
      url: 'local://feature/feedback.create',
      body: { description: 'Body', title: 'Subject' },
      idempotencyKey: 'idem_initial_delivery_1',
    });
    await service.beginDelivery(mutation.id);
    await service.deferDelivery(mutation.id, 'Response was lost');

    now += 1000 * 60 * 2;
    await service.replay('manual');

    expect(transport.send).toHaveBeenCalledWith(
      expect.objectContaining({
        id: mutation.id,
        idempotencyKey: 'idem_initial_delivery_1',
      }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(service.getSnapshot().queueDepth).toBe(0);
  });

  it('keeps conflicts as failed until retry-all resets them', async () => {
    const store = new InMemoryQueueStore();
    const transport = createTransport([
      {
        ok: false,
        retryable: false,
        statusCode: 409,
        errorMessage: 'Conflict detected (409).',
      },
      {
        ok: true,
        retryable: false,
        statusCode: 200,
        errorMessage: null,
      },
    ]);
    const service = new MutationReplayService(store, transport, () => 5000);

    await service.start();
    await service.enqueue({
      method: 'PATCH',
      url: 'https://api.example.com/visits/1',
      body: { note: 'new note' },
      idempotencyKey: 'idem_conflict_test',
    });

    await service.replay('manual');

    expect(service.getSnapshot().queueDepth).toBe(1);
    expect(service.getSnapshot().failedCount).toBe(1);

    const retriedCount = await service.retryAllFailed();
    expect(retriedCount).toBe(1);

    await service.replay('manual');
    expect(service.getSnapshot().queueDepth).toBe(0);
    expect(service.getSnapshot().failedCount).toBe(0);
  });

  it('sanitizes replay failure telemetry while preserving queue diagnostics', async () => {
    const rawResponseMessage =
      'HTTP 400: Could not save note "private dinner with jane@example.com"';
    const store = new InMemoryQueueStore();
    const transport = createTransport([
      {
        ok: false,
        retryable: false,
        statusCode: 400,
        errorMessage: rawResponseMessage,
      },
    ]);
    const service = new MutationReplayService(store, transport, () => 5000);

    await service.start();
    await service.enqueue({
      method: 'POST',
      url: 'https://api.example.com/notes',
      body: { note: 'private dinner with jane@example.com' },
      headers: {
        'X-Mobile-Write-Operation': 'note.create',
      },
    });

    await service.replay('manual');

    const failedMutation = (await service.getQueuedMutations(1))[0];
    expect(failedMutation?.lastError).toBe(rawResponseMessage);
    expect(mockedTrackObservabilityEvent).toHaveBeenCalledWith(
      'SYNC_MUTATION_FAILED_TERMINAL',
      expect.objectContaining({
        errorMessage: 'HTTP 400',
        errorMessageRedacted: true,
        operationName: 'note.create',
        retryable: false,
        statusCode: 400,
      }),
    );

    const emittedTelemetry = JSON.stringify(mockedTrackObservabilityEvent.mock.calls);
    expect(emittedTelemetry).not.toContain('private dinner');
    expect(emittedTelemetry).not.toContain('jane@example.com');
  });

  it('retains queued writes across service restarts', async () => {
    const sharedState: SharedQueueState = {
      rows: new Map(),
    };

    const firstStore = new InMemoryQueueStore(sharedState);
    const firstService = new MutationReplayService(firstStore, createTransport([]), () => 9000);
    await firstService.start();
    await firstService.enqueue({
      method: 'DELETE',
      url: 'https://api.example.com/visits/2',
    });

    const restartedStore = new InMemoryQueueStore(sharedState);
    const restartedService = new MutationReplayService(restartedStore, createTransport([]), () => 9000);
    await restartedService.start();

    expect(restartedService.getSnapshot().queueDepth).toBe(1);
  });

  it('recovers abandoned in-flight writes on restart and replays them', async () => {
    const sharedState: SharedQueueState = {
      rows: new Map([
        [
          'mut_seeded_1',
          buildQueuedMutation({
            status: 'in_flight',
            attemptCount: 1,
            lastAttemptAt: 8500,
            updatedAt: 8500,
          }),
        ],
      ]),
    };
    const transport = createTransport([
      {
        ok: true,
        retryable: false,
        statusCode: 200,
        errorMessage: null,
      },
    ]);
    const restartedStore = new InMemoryQueueStore(sharedState);
    const restartedService = new MutationReplayService(restartedStore, transport, () => 9000);

    await restartedService.start();

    expect(sharedState.rows.get('mut_seeded_1')?.status).toBe('pending');
    expect(sharedState.rows.get('mut_seeded_1')?.nextRetryAt).toBe(0);

    await restartedService.replay('foreground');

    expect(restartedService.getSnapshot().queueDepth).toBe(0);
    expect(transport.send).toHaveBeenCalledTimes(1);
  });

  it('starts queue recovery before retention cleanup finishes', async () => {
    const cleanupDeferred = createDeferredPromise<MutationQueueRetentionCleanupResult>();
    const sharedState: SharedQueueState = {
      rows: new Map([
        [
          'mut_seeded_1',
          buildQueuedMutation({
            status: 'pending',
            updatedAt: 8500,
          }),
        ],
      ]),
    };
    const store = new InMemoryQueueStore(
      sharedState,
      undefined,
      () => cleanupDeferred.promise,
    );
    const service = new MutationReplayService(store, createTransport([]), () => 9000);

    await service.start();

    expect(service.getSnapshot().isInitialized).toBe(true);
    expect(service.getSnapshot().queueDepth).toBe(1);

    cleanupDeferred.resolve({ removedCount: 0 });
    await cleanupDeferred.promise;
  });

  it('clears queued writes and keeps the queue empty after restart', async () => {
    const sharedState: SharedQueueState = {
      rows: new Map(),
    };
    const store = new InMemoryQueueStore(sharedState);
    const service = new MutationReplayService(store, createTransport([]), () => 9000);

    await service.start();
    await service.enqueue({
      method: 'DELETE',
      url: 'https://api.example.com/visits/2',
    });

    const clearedCount = await service.clearAll('logout');
    expect(clearedCount).toBe(1);
    expect(service.getSnapshot().queueDepth).toBe(0);
    expect(service.getSnapshot().failedCount).toBe(0);

    await service.replay('manual');
    expect(service.getSnapshot().queueDepth).toBe(0);

    const restartedStore = new InMemoryQueueStore(sharedState);
    const restartedService = new MutationReplayService(restartedStore, createTransport([]), () => 9000);
    await restartedService.start();

    expect(restartedService.getSnapshot().queueDepth).toBe(0);
  });

  it('quarantines feedback when the account switches after replay starts', async () => {
    const sharedState: SharedQueueState = {
      rows: new Map([
        [
          'mut_feedback_account_a',
          buildQueuedMutation({
            id: 'mut_feedback_account_a',
            url: 'local://feature/feedback.create',
            headers: {
              'X-Mobile-Write-Operation': 'feedback.create',
            },
            body: JSON.stringify({
              title: 'Account A feedback',
              description: 'Private feedback from account A',
            }),
            originAccountId: 'account_a',
          }),
        ],
      ]),
    };
    const store = new InMemoryQueueStore(sharedState);
    let activeAccountId = 'account_a';
    store.onMarkInFlight = () => {
      activeAccountId = 'account_b';
    };
    const fetchImplementation = jest.fn() as unknown as typeof fetch;
    const transport = createFetchMutationTransport({
      backendUrl: 'https://api.example.com',
      fetchImplementation,
      getActiveAccountId: () => activeAccountId,
      getAuthToken: () => `${activeAccountId}_token`,
    });
    const service = new MutationReplayService(store, transport, () => 9000);

    await service.start();
    await service.replay('foreground');

    expect(fetchImplementation).not.toHaveBeenCalled();
    expect(service.getSnapshot()).toEqual(
      expect.objectContaining({
        failedCount: 1,
        queueDepth: 1,
      }),
    );
    expect((await service.getQueuedMutations(1))[0]).toEqual(
      expect.objectContaining({
        attemptCount: 1,
        lastError: 'Queued write belongs to a different account and was quarantined.',
        status: 'failed',
      }),
    );
    expect(mockedTrackObservabilityEvent).toHaveBeenCalledWith(
      'SYNC_MUTATION_ACCOUNT_QUARANTINED',
      expect.objectContaining({
        accountBindingState: 'different_account',
        operationName: 'feedback.create',
      }),
    );
  });

  it('replays feedback normally when the queued account remains active', async () => {
    const sharedState: SharedQueueState = {
      rows: new Map([
        [
          'mut_feedback_account_a',
          buildQueuedMutation({
            id: 'mut_feedback_account_a',
            url: 'local://feature/feedback.create',
            headers: {
              'X-Mobile-Write-Operation': 'feedback.create',
            },
            body: JSON.stringify({
              title: 'Account A feedback',
              description: 'Private feedback from account A',
            }),
            originAccountId: 'account_a',
          }),
        ],
      ]),
    };
    const store = new InMemoryQueueStore(sharedState);
    const transport = createTransport([]);
    const service = new MutationReplayService(store, transport, () => 9000);

    await service.start();
    await service.replay('foreground');

    expect(transport.send).toHaveBeenCalledTimes(1);
    expect(service.getSnapshot().queueDepth).toBe(0);
    expect(service.getSnapshot().failedCount).toBe(0);
  });

  it('terminally isolates foreign destinations with non-secret telemetry', async () => {
    const store = new InMemoryQueueStore({
      rows: new Map([
        [
          'mut_foreign_destination',
          buildQueuedMutation({
            id: 'mut_foreign_destination',
            url: 'https://attacker.example/collect?value=queue-secret',
            originAccountId: 'account_a',
          }),
        ],
      ]),
    });
    const fetchImplementation = jest.fn() as unknown as typeof fetch;
    const getAuthToken = jest.fn(() => 'live-token');
    const transport = createFetchMutationTransport({
      backendUrl: 'https://api.example.com',
      fetchImplementation,
      getActiveAccountId: () => 'account_a',
      getAuthToken,
    });
    const service = new MutationReplayService(store, transport, () => 9000);

    await service.start();
    await service.replay('foreground');

    expect(fetchImplementation).not.toHaveBeenCalled();
    expect(getAuthToken).not.toHaveBeenCalled();
    expect((await service.getQueuedMutations(1))[0]).toEqual(
      expect.objectContaining({
        lastError: 'Queued write targets a different backend origin and was isolated.',
        status: 'failed',
      }),
    );
    expect(mockedTrackObservabilityEvent).toHaveBeenCalledWith(
      'SYNC_MUTATION_DESTINATION_ISOLATED',
      expect.objectContaining({
        destinationBindingState: 'foreign_origin',
        mutationTarget: 'isolated_destination',
        operationName: 'isolated_destination',
      }),
    );
    expect(JSON.stringify(mockedTrackObservabilityEvent.mock.calls)).not.toContain(
      'queue-secret',
    );
    expect(JSON.stringify(mockedTrackObservabilityEvent.mock.calls)).not.toContain(
      'attacker.example',
    );
  });

  it('cancels an in-flight replay before clearing queued writes', async () => {
    const store = new InMemoryQueueStore();
    const sendStarted = createDeferredPromise<void>();
    let sendSignal: AbortSignal | undefined;
    const cancelPendingRequests = jest.fn();
    const transport: MutationTransport = {
      cancelPendingRequests,
      send: jest.fn(async (_mutation, options) => {
        sendSignal = options?.signal;
        sendStarted.resolve();

        return new Promise<MutationSendResult>((resolve) => {
          if (options?.signal?.aborted) {
            resolve({
              ok: false,
              retryable: false,
              statusCode: null,
              errorMessage: null,
              cancelled: true,
            });
            return;
          }

          options?.signal?.addEventListener(
            'abort',
            () => {
              resolve({
                ok: false,
                retryable: false,
                statusCode: null,
                errorMessage: null,
                cancelled: true,
              });
            },
            { once: true },
          );
        });
      }),
    };
    const service = new MutationReplayService(store, transport, () => 9000);

    await service.start();
    await service.enqueue({
      method: 'DELETE',
      url: 'https://api.example.com/visits/2',
    });

    const replayPromise = service.replay('manual');
    await sendStarted.promise;

    const clearedCount = await service.clearAll('logout');
    await replayPromise;

    expect(clearedCount).toBe(1);
    expect(sendSignal?.aborted).toBe(true);
    expect(cancelPendingRequests).toHaveBeenCalledTimes(1);
    expect(service.getSnapshot().isSyncing).toBe(false);
    expect(service.getSnapshot().queueDepth).toBe(0);
  });

  it('replays already-normalized food product local operations', async () => {
    const sharedState: SharedQueueState = {
      rows: new Map([
        [
          'mut_seeded_1',
          buildQueuedMutation({
            body: JSON.stringify({
              foodProductId: 'food-product-1',
              updates: {
                itemName: 'Sparkling Water',
              },
            }),
            headers: {
              'X-Mobile-Write-Operation': 'food-product.update',
            },
            method: 'POST',
            url: 'local://feature/food-product.update',
          }),
        ],
      ]),
    };
    const store = new InMemoryQueueStore(sharedState);
    const transport: MutationTransport = {
      send: jest.fn(async (mutation, _options) => {
        expect(mutation.url).toBe('local://feature/food-product.update');
        expect(mutation.headers['X-Mobile-Write-Operation']).toBe('food-product.update');
        expect(JSON.parse(mutation.body ?? '{}')).toEqual({
          foodProductId: 'food-product-1',
          updates: {
            itemName: 'Sparkling Water',
          },
        });

        return {
          ok: true,
          retryable: false,
          statusCode: 200,
          errorMessage: null,
        };
      }),
    };
    const service = new MutationReplayService(store, transport, () => 9000);

    await service.start();
    await service.replay('foreground');

    expect(service.getSnapshot().queueDepth).toBe(0);
    expect(transport.send).toHaveBeenCalledTimes(1);
  });

  it('coalesces snapshot refreshes while replaying large successful backlogs', async () => {
    const sharedState: SharedQueueState = {
      rows: new Map(
        Array.from({ length: 25 }, (_value, index) => {
          const mutationId = `mut_seeded_${index + 1}`;

          return [
            mutationId,
            buildQueuedMutation({
              id: mutationId,
              idempotencyKey: `idem_seeded_${index + 1}`,
              createdAt: 1000 + index,
              updatedAt: 1000 + index,
              url: `https://api.example.com/visits/${index + 1}`,
            }),
          ];
        }),
      ),
    };
    const store = new InMemoryQueueStore(sharedState);
    const transport = createTransport([]);
    const service = new MutationReplayService(store, transport, () => 9000);

    await service.start();
    store.resetGetStatsCallCount();

    const emittedSnapshots: SyncSnapshot[] = [];
    service.subscribe((snapshot) => {
      emittedSnapshots.push(snapshot);
    });

    await service.replay('foreground');

    expect(transport.send).toHaveBeenCalledTimes(25);
    expect(service.getSnapshot().queueDepth).toBe(0);
    expect(store.getStatsCallCount).toBeLessThanOrEqual(6);
    expect(emittedSnapshots.length - 1).toBeLessThanOrEqual(6);
  });

  it('preserves the last synced timestamp when a later batched send throws', async () => {
    const sharedState: SharedQueueState = {
      rows: new Map(
        Array.from({ length: 3 }, (_value, index) => {
          const mutationId = `mut_seeded_${index + 1}`;

          return [
            mutationId,
            buildQueuedMutation({
              id: mutationId,
              idempotencyKey: `idem_seeded_${index + 1}`,
              createdAt: 1000 + index,
              updatedAt: 1000 + index,
            }),
          ];
        }),
      ),
    };
    const store = new InMemoryQueueStore(sharedState);
    const transport: MutationTransport = {
      send: jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          retryable: false,
          statusCode: 200,
          errorMessage: null,
        })
        .mockRejectedValueOnce(new Error('Network transport crashed')),
    };
    const service = new MutationReplayService(store, transport, () => 9000);

    await service.start();
    await expect(service.replay('foreground')).rejects.toThrow('Network transport crashed');

    expect(transport.send).toHaveBeenCalledTimes(2);
    expect(service.getSnapshot().queueDepth).toBe(2);
    expect(service.getSnapshot().lastSyncedAt).toBe(9000);
  });

  it('keeps success telemetry queue depth accurate when enqueue refreshes during replay', async () => {
    const sharedState: SharedQueueState = {
      rows: new Map([
        [
          'mut_seeded_1',
          buildQueuedMutation({
            id: 'mut_seeded_1',
            idempotencyKey: 'idem_seeded_1',
            createdAt: 1000,
            updatedAt: 1000,
          }),
        ],
        [
          'mut_seeded_2',
          buildQueuedMutation({
            id: 'mut_seeded_2',
            idempotencyKey: 'idem_seeded_2',
            createdAt: 1001,
            updatedAt: 1001,
          }),
        ],
      ]),
    };
    const store = new InMemoryQueueStore(sharedState);
    let service: MutationReplayService;
    let didEnqueueDuringReplay = false;
    const transport: MutationTransport = {
      send: jest.fn(async () => {
        if (!didEnqueueDuringReplay) {
          didEnqueueDuringReplay = true;
          await service.enqueue({
            method: 'POST',
            url: 'https://api.example.com/visits/enqueued-during-replay',
          });
        }

        return {
          ok: true,
          retryable: false,
          statusCode: 200,
          errorMessage: null,
        };
      }),
    };
    service = new MutationReplayService(store, transport, () => 9000);

    await service.start();
    await service.replay('foreground');

    const successDepths = mockedTrackObservabilityEvent.mock.calls
      .filter(([eventName]) => eventName === 'SYNC_MUTATION_SUCCEEDED')
      .map(([_eventName, properties]) => properties?.queueDepth);

    expect(transport.send).toHaveBeenCalledTimes(3);
    expect(successDepths).toEqual([2, 1, 0]);
    expect(service.getSnapshot().queueDepth).toBe(0);
  });

  it('includes enqueues that happen while replay start refresh is in flight', async () => {
    const sharedState: SharedQueueState = {
      rows: new Map([
        [
          'mut_seeded_1',
          buildQueuedMutation({
            id: 'mut_seeded_1',
            idempotencyKey: 'idem_seeded_1',
            createdAt: 1000,
            updatedAt: 1000,
          }),
        ],
      ]),
    };
    const store = new InMemoryQueueStore(sharedState);
    const transport = createTransport([]);
    const service = new MutationReplayService(store, transport, () => 9000);
    const replayStartStatsStarted = createDeferredPromise<void>();
    const releaseReplayStartStats = createDeferredPromise<void>();

    await service.start();
    store.onGetStatsBeforeReturn = async () => {
      store.onGetStatsBeforeReturn = undefined;
      replayStartStatsStarted.resolve();
      await releaseReplayStartStats.promise;
    };

    const replayPromise = service.replay('foreground');
    await replayStartStatsStarted.promise;

    await service.enqueue({
      method: 'POST',
      url: 'https://api.example.com/visits/enqueued-during-replay-start',
    });
    releaseReplayStartStats.resolve();
    await replayPromise;

    const successDepths = mockedTrackObservabilityEvent.mock.calls
      .filter(([eventName]) => eventName === 'SYNC_MUTATION_SUCCEEDED')
      .map(([_eventName, properties]) => properties?.queueDepth);

    expect(transport.send).toHaveBeenCalledTimes(2);
    expect(successDepths).toEqual([1, 0]);
    expect(service.getSnapshot().queueDepth).toBe(0);
  });
});
