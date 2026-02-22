import { trackObservabilityEvent } from '../observability';
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
    const operationName = resolveOperationNameFromInput(input);

    try {
      const mutation = await this.queueStore.enqueue(input);
      await this.refreshSnapshot();
      trackObservabilityEvent('MUTATION_ENQUEUED', {
        mutationId: mutation.id,
        method: mutation.method,
        mutationTarget: resolveMutationTarget(mutation.url),
        operationName,
        queueDepth: this.snapshot.queueDepth,
      });
      return mutation;
    } catch (error) {
      trackObservabilityEvent('MUTATION_ENQUEUE_FAILED', {
        method: input.method,
        mutationTarget: resolveMutationTarget(input.url),
        operationName,
        ...resolveErrorProperties(error),
      });
      throw error;
    }
  }

  async retryAllFailed(): Promise<number> {
    const resetCount = await this.queueStore.retryFailedMutations(this.now());
    await this.refreshSnapshot();
    trackObservabilityEvent('SYNC_FAILED_MUTATIONS_RESET', {
      failedCount: this.snapshot.failedCount,
      queueDepth: this.snapshot.queueDepth,
      resetCount,
    });
    return resetCount;
  }

  async getQueuedMutations(limit = 25): Promise<QueuedMutation[]> {
    return this.queueStore.getQueuedMutations(limit);
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
    let replayError: unknown = null;

    await this.refreshSnapshot({
      isSyncing: true,
      lastTrigger: trigger,
    });
    trackObservabilityEvent('SYNC_REPLAY_STARTED', {
      failedCount: this.snapshot.failedCount,
      queueDepth: this.snapshot.queueDepth,
      trigger,
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
          trackObservabilityEvent('SYNC_MUTATION_SUCCEEDED', {
            attempt: nextAttempt,
            maxAttempts: nextMutation.maxAttempts,
            mutationId: nextMutation.id,
            mutationTarget: resolveMutationTarget(nextMutation.url),
            operationName: resolveOperationNameFromQueuedMutation(nextMutation),
            queueDepth: this.snapshot.queueDepth,
            statusCode: sendResult.statusCode,
            trigger,
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
        trackObservabilityEvent(
          shouldStopRetrying ? 'SYNC_MUTATION_FAILED_TERMINAL' : 'SYNC_MUTATION_FAILED_RETRYABLE',
          {
            attempt: nextAttempt,
            errorMessage,
            maxAttempts: nextMutation.maxAttempts,
            mutationId: nextMutation.id,
            mutationTarget: resolveMutationTarget(nextMutation.url),
            operationName: resolveOperationNameFromQueuedMutation(nextMutation),
            queueDepth: this.snapshot.queueDepth,
            retryable: sendResult.retryable,
            statusCode: sendResult.statusCode,
            trigger,
          },
        );
      }
    } catch (error) {
      replayError = error;
      throw error;
    } finally {
      await this.refreshSnapshot({
        isSyncing: false,
        lastTrigger: trigger,
      });
      trackObservabilityEvent('SYNC_REPLAY_COMPLETED', {
        failedCount: this.snapshot.failedCount,
        hadError: replayError !== null,
        ...resolveErrorProperties(replayError),
        queueDepth: this.snapshot.queueDepth,
        trigger,
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

function resolveOperationNameFromInput(input: EnqueueMutationInput): string {
  const headerOperationName = getHeaderValue(input.headers, 'X-Mobile-Write-Operation');
  if (headerOperationName) {
    return headerOperationName;
  }

  if (input.url.startsWith('local://feature/')) {
    return input.url.slice('local://feature/'.length);
  }

  try {
    const parsedUrl = new URL(input.url);
    return `${input.method} ${parsedUrl.pathname}`;
  } catch {
    return input.url;
  }
}

function resolveOperationNameFromQueuedMutation(mutation: QueuedMutation): string {
  const headerOperationName = getHeaderValue(mutation.headers, 'X-Mobile-Write-Operation');
  if (headerOperationName) {
    return headerOperationName;
  }

  if (mutation.url.startsWith('local://feature/')) {
    return mutation.url.slice('local://feature/'.length);
  }

  try {
    const parsedUrl = new URL(mutation.url);
    return `${mutation.method} ${parsedUrl.pathname}`;
  } catch {
    return mutation.url;
  }
}

function resolveMutationTarget(url: string): string {
  if (url.startsWith('local://feature/')) {
    return 'local_feature_outbox';
  }

  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

function getHeaderValue(
  headers: Record<string, string> | undefined,
  expectedHeaderName: string,
): string | null {
  if (!headers) {
    return null;
  }

  const loweredExpectedName = expectedHeaderName.toLowerCase();
  for (const [headerName, headerValue] of Object.entries(headers)) {
    if (headerName.toLowerCase() === loweredExpectedName) {
      return headerValue;
    }
  }

  return null;
}

function resolveErrorProperties(error: unknown): { errorMessage: string | null; errorType: string | null } {
  if (!error) {
    return {
      errorMessage: null,
      errorType: null,
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
