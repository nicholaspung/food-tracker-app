import { trackObservabilityEvent } from '../observability';
import { buildSafeTelemetryErrorProperties } from '../observability/telemetryError';
import { trackProductEvent } from '../observability/productAnalytics';
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
type QueueClearTrigger = 'auth_change' | 'logout';

const OFFLINE_QUEUE_FAILED_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const REPLAY_READY_BATCH_SIZE = 10;

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
  private activeReplayAbortController: AbortController | null = null;
  private activeReplayQueueDepthEstimate: number | null = null;
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
      void this.runRetentionCleanup();
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
      if (this.activeReplayQueueDepthEstimate !== null) {
        this.activeReplayQueueDepthEstimate += 1;
      }
      trackObservabilityEvent('MUTATION_ENQUEUED', {
        mutationId: mutation.id,
        method: mutation.method,
        mutationTarget: resolveMutationTarget(mutation.url),
        operationName,
        queueDepth: this.snapshot.queueDepth,
      });
      trackProductEvent('quality.offline_write_queued', {
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
        ...buildSafeTelemetryErrorProperties({
          error,
          sourceOperation: operationName,
        }),
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

  async clearAll(trigger: QueueClearTrigger): Promise<number> {
    await this.cancelReplay();
    const clearedCount = await this.queueStore.clearAll();
    await this.refreshSnapshot();
    trackObservabilityEvent('SYNC_QUEUE_CLEARED', {
      trigger,
      clearedCount,
      queueDepth: this.snapshot.queueDepth,
      failedCount: this.snapshot.failedCount,
    });
    return clearedCount;
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
    const replayAbortController = new AbortController();
    let replayError: unknown = null;
    let lastSuccessfulReplayAt: number | null = null;

    this.activeReplayAbortController = replayAbortController;
    this.activeReplayQueueDepthEstimate = this.snapshot.queueDepth;
    await this.refreshSnapshot({
      isSyncing: true,
      lastTrigger: trigger,
    });
    this.activeReplayQueueDepthEstimate = Math.max(
      this.activeReplayQueueDepthEstimate ?? 0,
      this.snapshot.queueDepth,
    );
    trackObservabilityEvent('SYNC_REPLAY_STARTED', {
      failedCount: this.snapshot.failedCount,
      queueDepth: this.snapshot.queueDepth,
      trigger,
    });

    try {
      while (true) {
        if (replayAbortController.signal.aborted) {
          break;
        }

        const readyMutations = await this.queueStore.getReadyMutations(
          this.now(),
          REPLAY_READY_BATCH_SIZE,
        );

        if (readyMutations.length === 0) {
          break;
        }

        let successfulMutationsSinceRefresh = 0;
        let shouldContinueReplay = true;

        for (const nextMutation of readyMutations) {
          if (replayAbortController.signal.aborted) {
            break;
          }

          const nextAttempt = nextMutation.attemptCount + 1;
          const attemptStartedAt = this.now();
          await this.queueStore.markInFlight(nextMutation.id, attemptStartedAt);

          if (replayAbortController.signal.aborted) {
            break;
          }

          const sendResult = await this.transport.send(nextMutation, {
            signal: replayAbortController.signal,
          });

          if (sendResult.cancelled) {
            shouldContinueReplay = false;
            break;
          }

          const resolvedAt = this.now();

          if (sendResult.ok) {
            await this.queueStore.remove(nextMutation.id);
            lastSuccessfulReplayAt = resolvedAt;
            successfulMutationsSinceRefresh += 1;
            if (this.activeReplayQueueDepthEstimate !== null) {
              this.activeReplayQueueDepthEstimate = Math.max(
                0,
                this.activeReplayQueueDepthEstimate - 1,
              );
            }
            const remainingQueueDepth =
              this.activeReplayQueueDepthEstimate ??
              Math.max(0, this.snapshot.queueDepth - successfulMutationsSinceRefresh);
            trackObservabilityEvent('SYNC_MUTATION_SUCCEEDED', {
              attempt: nextAttempt,
              maxAttempts: nextMutation.maxAttempts,
              mutationId: nextMutation.id,
              mutationTarget: resolveMutationTarget(nextMutation.url),
              operationName: resolveOperationNameFromQueuedMutation(nextMutation),
              queueDepth: remainingQueueDepth,
              statusCode: sendResult.statusCode,
              trigger,
            });
            trackProductEvent('quality.offline_write_replayed', {
              attempt: nextAttempt,
              mutationTarget: resolveMutationTarget(nextMutation.url),
              operationName: resolveOperationNameFromQueuedMutation(nextMutation),
              queueDepth: remainingQueueDepth,
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
            ...(lastSuccessfulReplayAt !== null ? { lastSyncedAt: lastSuccessfulReplayAt } : {}),
            lastTrigger: trigger,
          });
          successfulMutationsSinceRefresh = 0;
          trackObservabilityEvent(
            shouldStopRetrying ? 'SYNC_MUTATION_FAILED_TERMINAL' : 'SYNC_MUTATION_FAILED_RETRYABLE',
            {
              attempt: nextAttempt,
              maxAttempts: nextMutation.maxAttempts,
              mutationId: nextMutation.id,
              mutationTarget: resolveMutationTarget(nextMutation.url),
              operationName: resolveOperationNameFromQueuedMutation(nextMutation),
              queueDepth: this.snapshot.queueDepth,
              trigger,
              ...buildSafeTelemetryErrorProperties({
                retryable: sendResult.retryable,
                sourceOperation: resolveOperationNameFromQueuedMutation(nextMutation),
                statusCode: sendResult.statusCode,
                unsafeErrorMessage: errorMessage,
              }),
            },
          );
        }

        if (successfulMutationsSinceRefresh > 0) {
          await this.refreshSnapshot({
            isSyncing: true,
            ...(lastSuccessfulReplayAt !== null ? { lastSyncedAt: lastSuccessfulReplayAt } : {}),
            lastTrigger: trigger,
          });
        }

        if (!shouldContinueReplay) {
          break;
        }
      }
    } catch (error) {
      replayError = error;
      throw error;
    } finally {
      if (this.activeReplayAbortController === replayAbortController) {
        this.activeReplayAbortController = null;
      }

      await this.refreshSnapshot({
        isSyncing: false,
        ...(lastSuccessfulReplayAt !== null ? { lastSyncedAt: lastSuccessfulReplayAt } : {}),
        lastTrigger: trigger,
      });
      trackObservabilityEvent('SYNC_REPLAY_COMPLETED', {
        failedCount: this.snapshot.failedCount,
        hadError: replayError !== null,
        ...buildSafeTelemetryErrorProperties(replayError),
        queueDepth: this.snapshot.queueDepth,
        trigger,
      });
      this.activeReplayQueueDepthEstimate = null;
    }
  }

  private async cancelReplay(): Promise<void> {
    const replayPromise = this.replayPromise;
    const replayAbortController = this.activeReplayAbortController;

    if (!replayPromise && !replayAbortController) {
      return;
    }

    replayAbortController?.abort();
    this.transport.cancelPendingRequests?.();

    if (replayPromise) {
      await replayPromise;
    }
  }

  private async runRetentionCleanup(): Promise<void> {
    try {
      const cleanupResult = await this.queueStore.cleanupRetainedMutations(
        this.now() - OFFLINE_QUEUE_FAILED_RETENTION_MS,
      );

      if (cleanupResult.removedCount > 0) {
        await this.refreshSnapshot();
      }

      trackObservabilityEvent('SYNC_QUEUE_RETENTION_CLEANUP_COMPLETED', {
        removedCount: cleanupResult.removedCount,
        queueDepth: this.snapshot.queueDepth,
      });
    } catch (error) {
      trackObservabilityEvent('SYNC_QUEUE_RETENTION_CLEANUP_FAILED', {
        ...buildSafeTelemetryErrorProperties(error),
        queueDepth: this.snapshot.queueDepth,
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
