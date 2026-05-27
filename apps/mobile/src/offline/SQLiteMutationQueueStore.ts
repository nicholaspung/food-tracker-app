import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import { getEnvironmentDatabaseName } from '../config/persistence';
import type {
  EnqueueMutationInput,
  MutationMethod,
  MutationQueueRetentionCleanupResult,
  MutationQueueStats,
  MutationQueueStore,
  MutationStatus,
  QueuedMutation,
} from './types';

const DATABASE_NAME = getEnvironmentDatabaseName('food_tracker_offline_queue.db');
const TABLE_NAME = 'offline_mutation_queue';
const DEFAULT_MAX_ATTEMPTS = 5;

interface QueueRow {
  id: string;
  method: MutationMethod;
  url: string;
  body: string | null;
  headers: string;
  status: MutationStatus;
  idempotency_key: string;
  attempt_count: number;
  max_attempts: number;
  next_retry_at: number;
  last_error: string | null;
  created_at: number;
  updated_at: number;
  last_attempt_at: number | null;
}

interface QueueStatsRow {
  queue_depth: number | null;
  failed_count: number | null;
  next_retry_at: number | null;
}

interface LatestErrorRow {
  last_error: string | null;
}

export class SQLiteMutationQueueStore implements MutationQueueStore {
  private databasePromise: Promise<SQLiteDatabase> | null = null;

  async initialize(): Promise<void> {
    const database = await this.getDatabase();
    const recoveredAt = Date.now();
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
        id TEXT PRIMARY KEY NOT NULL,
        method TEXT NOT NULL,
        url TEXT NOT NULL,
        body TEXT,
        headers TEXT NOT NULL,
        status TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 5,
        next_retry_at INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_attempt_at INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_${TABLE_NAME}_status_retry
      ON ${TABLE_NAME}(status, next_retry_at, created_at);

      CREATE INDEX IF NOT EXISTS idx_${TABLE_NAME}_updated
      ON ${TABLE_NAME}(updated_at DESC);
    `);

    // Cleanup for legacy dev-only probe endpoint that never existed on backend.
    await database.runAsync(
      `
      DELETE FROM ${TABLE_NAME}
      WHERE url LIKE ?;
      `,
      '%/api/mobile/offline-probe',
    );

    // A previous app process may have crashed after marking a row in-flight.
    // Those writes are safe to replay because the queue stores idempotency keys.
    await database.runAsync(
      `
      UPDATE ${TABLE_NAME}
      SET status = 'pending',
          next_retry_at = 0,
          updated_at = ?
      WHERE status = 'in_flight';
      `,
      recoveredAt,
    );
  }

  async enqueue(input: EnqueueMutationInput): Promise<QueuedMutation> {
    const database = await this.getDatabase();
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

    await database.runAsync(
      `
      INSERT INTO ${TABLE_NAME} (
        id, method, url, body, headers, status, idempotency_key,
        attempt_count, max_attempts, next_retry_at, last_error,
        created_at, updated_at, last_attempt_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
      `,
      mutation.id,
      mutation.method,
      mutation.url,
      mutation.body,
      JSON.stringify(mutation.headers),
      mutation.status,
      mutation.idempotencyKey,
      mutation.attemptCount,
      mutation.maxAttempts,
      mutation.nextRetryAt,
      mutation.lastError,
      mutation.createdAt,
      mutation.updatedAt,
      mutation.lastAttemptAt,
    );

    return mutation;
  }

  async getQueuedMutations(limit: number): Promise<QueuedMutation[]> {
    const database = await this.getDatabase();
    const rows = await database.getAllAsync<QueueRow>(
      `
      SELECT
        id, method, url, body, headers, status, idempotency_key,
        attempt_count, max_attempts, next_retry_at, last_error,
        created_at, updated_at, last_attempt_at
      FROM ${TABLE_NAME}
      ORDER BY created_at DESC
      LIMIT ?;
      `,
      Math.max(1, limit),
    );

    return rows.map(deserializeRow);
  }

  async getReadyMutations(now: number, limit: number): Promise<QueuedMutation[]> {
    const database = await this.getDatabase();
    const rows = await database.getAllAsync<QueueRow>(
      `
      SELECT
        id, method, url, body, headers, status, idempotency_key,
        attempt_count, max_attempts, next_retry_at, last_error,
        created_at, updated_at, last_attempt_at
      FROM ${TABLE_NAME}
      WHERE status IN ('pending', 'retrying') AND next_retry_at <= ?
      ORDER BY created_at ASC
      LIMIT ?;
      `,
      now,
      Math.max(1, limit),
    );

    return rows.map(deserializeRow);
  }

  async markInFlight(id: string, at: number): Promise<void> {
    const database = await this.getDatabase();
    await database.runAsync(
      `
      UPDATE ${TABLE_NAME}
      SET status = 'in_flight',
          attempt_count = attempt_count + 1,
          last_attempt_at = ?,
          updated_at = ?
      WHERE id = ?;
      `,
      at,
      at,
      id,
    );
  }

  async remove(id: string): Promise<void> {
    const database = await this.getDatabase();
    await database.runAsync(`DELETE FROM ${TABLE_NAME} WHERE id = ?;`, id);
  }

  async markRetryableFailure(
    id: string,
    error: string,
    nextRetryAt: number,
    at: number,
  ): Promise<void> {
    const database = await this.getDatabase();
    await database.runAsync(
      `
      UPDATE ${TABLE_NAME}
      SET status = 'retrying',
          last_error = ?,
          next_retry_at = ?,
          updated_at = ?
      WHERE id = ?;
      `,
      error,
      nextRetryAt,
      at,
      id,
    );
  }

  async markTerminalFailure(id: string, error: string, at: number): Promise<void> {
    const database = await this.getDatabase();
    await database.runAsync(
      `
      UPDATE ${TABLE_NAME}
      SET status = 'failed',
          last_error = ?,
          next_retry_at = 0,
          updated_at = ?
      WHERE id = ?;
      `,
      error,
      at,
      id,
    );
  }

  async retryFailedMutations(at: number): Promise<number> {
    const database = await this.getDatabase();
    const result = await database.runAsync(
      `
      UPDATE ${TABLE_NAME}
      SET status = 'pending',
          last_error = NULL,
          next_retry_at = 0,
          updated_at = ?
      WHERE status = 'failed';
      `,
      at,
    );
    return result.changes;
  }

  async clearAll(): Promise<number> {
    const database = await this.getDatabase();
    const result = await database.runAsync(`DELETE FROM ${TABLE_NAME};`);
    return result.changes;
  }

  async cleanupRetainedMutations(
    cutoffTimestamp: number,
  ): Promise<MutationQueueRetentionCleanupResult> {
    const database = await this.getDatabase();
    const result = await database.runAsync(
      `
      DELETE FROM ${TABLE_NAME}
      WHERE status = 'failed'
        AND updated_at < ?;
      `,
      cutoffTimestamp,
    );

    return {
      removedCount: result.changes,
    };
  }

  async getStats(): Promise<MutationQueueStats> {
    const database = await this.getDatabase();
    const statsRow = await database.getFirstAsync<QueueStatsRow>(
      `
      SELECT
        COUNT(*) AS queue_depth,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_count,
        MIN(CASE WHEN status = 'retrying' THEN next_retry_at ELSE NULL END) AS next_retry_at
      FROM ${TABLE_NAME};
      `,
    );

    const latestErrorRow = await database.getFirstAsync<LatestErrorRow>(
      `
      SELECT last_error
      FROM ${TABLE_NAME}
      WHERE last_error IS NOT NULL
      ORDER BY updated_at DESC
      LIMIT 1;
      `,
    );

    return {
      queueDepth: Number(statsRow?.queue_depth ?? 0),
      failedCount: Number(statsRow?.failed_count ?? 0),
      nextRetryAt: statsRow?.next_retry_at ?? null,
      lastError: latestErrorRow?.last_error ?? null,
    };
  }

  private async getDatabase(): Promise<SQLiteDatabase> {
    if (!this.databasePromise) {
      this.databasePromise = openDatabaseAsync(DATABASE_NAME);
    }

    return this.databasePromise;
  }
}

function deserializeRow(row: QueueRow): QueuedMutation {
  return {
    id: row.id,
    method: row.method,
    url: row.url,
    body: row.body,
    headers: parseHeaders(row.headers),
    status: row.status,
    idempotencyKey: row.idempotency_key,
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    nextRetryAt: row.next_retry_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastAttemptAt: row.last_attempt_at,
  };
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

function parseHeaders(value: string): Record<string, string> {
  try {
    const parsedValue = JSON.parse(value) as unknown;

    if (!parsedValue || typeof parsedValue !== 'object' || Array.isArray(parsedValue)) {
      return {};
    }

    return Object.entries(parsedValue as Record<string, unknown>).reduce<Record<string, string>>(
      (accumulator, [key, candidateValue]) => {
        if (typeof candidateValue === 'string') {
          accumulator[key] = candidateValue;
        }
        return accumulator;
      },
      {},
    );
  } catch {
    return {};
  }
}

function createMutationId(): string {
  return `mut_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function createIdempotencyKey(): string {
  return `idem_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}
