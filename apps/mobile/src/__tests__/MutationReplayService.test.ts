import { MutationReplayService } from '../offline/MutationReplayService';
import type {
  EnqueueMutationInput,
  MutationQueueStats,
  MutationQueueStore,
  MutationSendResult,
  MutationTransport,
  QueuedMutation,
} from '../offline/types';

interface SharedQueueState {
  rows: Map<string, QueuedMutation>;
}

class InMemoryQueueStore implements MutationQueueStore {
  constructor(private readonly sharedState: SharedQueueState = { rows: new Map() }) {}

  async initialize(): Promise<void> {
    return Promise.resolve();
  }

  async enqueue(input: EnqueueMutationInput): Promise<QueuedMutation> {
    const now = Date.now();
    const mutation: QueuedMutation = {
      id: `mut_${this.sharedState.rows.size + 1}`,
      method: input.method,
      url: input.url,
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

  async markInFlight(id: string, at: number): Promise<void> {
    const mutation = this.sharedState.rows.get(id);
    if (!mutation) {
      return;
    }

    mutation.status = 'in_flight';
    mutation.attemptCount += 1;
    mutation.lastAttemptAt = at;
    mutation.updatedAt = at;
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

  async getStats(): Promise<MutationQueueStats> {
    const rows = [...this.sharedState.rows.values()];
    const queueDepth = rows.length;
    const failedRows = rows.filter((mutation) => mutation.status === 'failed');
    const retryRows = rows
      .filter((mutation) => mutation.status === 'retrying')
      .sort((left, right) => left.nextRetryAt - right.nextRetryAt);
    const latestError = rows
      .filter((mutation) => mutation.lastError)
      .sort((left, right) => right.updatedAt - left.updatedAt)[0]?.lastError;

    return {
      queueDepth,
      failedCount: failedRows.length,
      nextRetryAt: retryRows[0]?.nextRetryAt ?? null,
      lastError: latestError ?? null,
    };
  }
}

function createTransport(results: MutationSendResult[]): MutationTransport {
  return {
    send: jest.fn(async () => {
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

describe('MutationReplayService', () => {
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
});
