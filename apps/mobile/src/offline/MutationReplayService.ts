import { computeRetryDelayMs } from './retryPolicy';
import type {
  EnqueueMutationInput,
  MutationQueueStore,
  MutationTransport,
  QueuedMutation,
  ReplayTrigger,
  SyncSnapshot,
} from './types';

type SyncListener = (snapshot: SyncSnapshot) => void;

const DEFAULT_SNAPSHOT: SyncSnapshot = {
  isInitialized: false,
  isSyncing: false,
  queueDepth: 0,
  failedCount: 0,
  nextRetryAt: null,
  lastError: null,
  lastSyncedAt: null,
  lastTrigger: null,
};

export class MutationReplayService {
  private listeners = new Set<SyncListener>();
  private replayPromise: Promise<void> | null = null;
  private snapshot: SyncSnapshot = DEFAULT_SNAPSHOT;
  private started = false;

  constructor(
    private readonly queueStore: MutationQueueStore,
    private readonly transport: MutationTransport,
    private readonly now: () => number = () => Date.now(),
  ) {}

  subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);

    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): SyncSnapshot {
    return this.snapshot;
  }

  async start(): Promise<void> {
    if (this.started) {
      return;
    }

    this.started = true;

    try {
      await this.queueStore.initialize();
      await this.refreshSnapshot({
        isInitialized: true,
      });
    } catch (error) {
      this.started = false;
      throw error;
    }
  }

  async enqueue(input: EnqueueMutationInput): Promise<QueuedMutation> {
    const mutation = await this.queueStore.enqueue(input);
    await this.refreshSnapshot();
    return mutation;
  }

  async retryAllFailed(): Promise<number> {
    const resetCount = await this.queueStore.retryFailedMutations(this.now());
    await this.refreshSnapshot();
    return resetCount;
  }

  async replay(trigger: ReplayTrigger): Promise<void> {
    if (this.replayPromise) {
      return this.replayPromise;
    }

    this.replayPromise = this.runReplay(trigger).finally(() => {
      this.replayPromise = null;
    });

    return this.replayPromise;
  }

  private async runReplay(trigger: ReplayTrigger): Promise<void> {
    await this.refreshSnapshot({
      isSyncing: true,
      lastTrigger: trigger,
    });

    try {
      while (true) {
        const readyMutations = await this.queueStore.getReadyMutations(this.now(), 1);
        const [nextMutation] = readyMutations;

        if (!nextMutation) {
          break;
        }

        const nextAttempt = nextMutation.attemptCount + 1;
        const attemptStartedAt = this.now();
        await this.queueStore.markInFlight(nextMutation.id, attemptStartedAt);
        await this.refreshSnapshot({
          isSyncing: true,
          lastTrigger: trigger,
        });

        const sendResult = await this.transport.send(nextMutation);
        const resolvedAt = this.now();

        if (sendResult.ok) {
          await this.queueStore.remove(nextMutation.id);
          await this.refreshSnapshot({
            isSyncing: true,
            lastSyncedAt: resolvedAt,
            lastTrigger: trigger,
          });
          continue;
        }

        const fallbackStatus = sendResult.statusCode ? `HTTP ${sendResult.statusCode}` : 'Request failed';
        const errorMessage = sendResult.errorMessage ?? fallbackStatus;
        const shouldStopRetrying = !sendResult.retryable || nextAttempt >= nextMutation.maxAttempts;

        if (shouldStopRetrying) {
          await this.queueStore.markTerminalFailure(nextMutation.id, errorMessage, resolvedAt);
        } else {
          const nextRetryAt = resolvedAt + computeRetryDelayMs(nextAttempt);
          await this.queueStore.markRetryableFailure(
            nextMutation.id,
            errorMessage,
            nextRetryAt,
            resolvedAt,
          );
        }

        await this.refreshSnapshot({
          isSyncing: true,
          lastTrigger: trigger,
        });
      }
    } finally {
      await this.refreshSnapshot({
        isSyncing: false,
        lastTrigger: trigger,
      });
    }
  }

  private async refreshSnapshot(overrides: Partial<SyncSnapshot> = {}): Promise<void> {
    const stats = await this.queueStore.getStats();

    this.snapshot = {
      ...this.snapshot,
      queueDepth: stats.queueDepth,
      failedCount: stats.failedCount,
      nextRetryAt: stats.nextRetryAt,
      lastError: stats.lastError,
      ...overrides,
    };

    this.emitSnapshot();
  }

  private emitSnapshot(): void {
    for (const listener of this.listeners) {
      listener(this.snapshot);
    }
  }
}
