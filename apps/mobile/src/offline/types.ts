export type MutationMethod = 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type MutationStatus = 'pending' | 'retrying' | 'in_flight' | 'failed';

export interface EnqueueMutationInput {
  method: MutationMethod;
  url: string;
  body?: unknown;
  headers?: Record<string, string>;
  maxAttempts?: number;
  idempotencyKey?: string;
}

export interface QueuedMutation {
  id: string;
  method: MutationMethod;
  url: string;
  body: string | null;
  headers: Record<string, string>;
  status: MutationStatus;
  idempotencyKey: string;
  attemptCount: number;
  maxAttempts: number;
  nextRetryAt: number;
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
  lastAttemptAt: number | null;
}

export interface MutationQueueStats {
  queueDepth: number;
  failedCount: number;
  nextRetryAt: number | null;
  lastError: string | null;
}

export interface MutationQueueStore {
  initialize(): Promise<void>;
  enqueue(input: EnqueueMutationInput): Promise<QueuedMutation>;
  getQueuedMutations(limit: number): Promise<QueuedMutation[]>;
  getReadyMutations(now: number, limit: number): Promise<QueuedMutation[]>;
  markInFlight(id: string, at: number): Promise<void>;
  remove(id: string): Promise<void>;
  markRetryableFailure(id: string, error: string, nextRetryAt: number, at: number): Promise<void>;
  markTerminalFailure(id: string, error: string, at: number): Promise<void>;
  retryFailedMutations(at: number): Promise<number>;
  clearAll(): Promise<number>;
  getStats(): Promise<MutationQueueStats>;
}

export interface MutationSendResult {
  ok: boolean;
  retryable: boolean;
  statusCode: number | null;
  errorMessage: string | null;
}

export interface MutationTransport {
  send(mutation: QueuedMutation): Promise<MutationSendResult>;
}

export type ReplayTrigger = 'reconnect' | 'foreground' | 'manual' | 'enqueue';

export interface SyncSnapshot {
  isInitialized: boolean;
  isSyncing: boolean;
  queueDepth: number;
  failedCount: number;
  nextRetryAt: number | null;
  lastError: string | null;
  lastSyncedAt: number | null;
  lastTrigger: ReplayTrigger | null;
}
