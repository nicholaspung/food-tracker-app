import { SQLiteMutationQueueStore as NativeSQLiteMutationQueueStore } from '../offline/SQLiteMutationQueueStore';
import { SQLiteMutationQueueStore as WebSQLiteMutationQueueStore } from '../offline/SQLiteMutationQueueStore.web';
import type { MutationStatus, QueuedMutation } from '../offline/types';

const mockRunAsync = jest.fn();

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(async () => ({
    execAsync: jest.fn(),
    getAllAsync: jest.fn(),
    getFirstAsync: jest.fn(),
    runAsync: mockRunAsync,
  })),
}));

describe('SQLiteMutationQueueStore retention cleanup', () => {
  beforeEach(() => {
    mockRunAsync.mockReset();
    mockRunAsync.mockResolvedValue({ changes: 0 });
  });

  it('removes only terminal failed native SQLite rows older than the cutoff', async () => {
    mockRunAsync.mockResolvedValueOnce({ changes: 2 });
    const store = new NativeSQLiteMutationQueueStore();

    const result = await store.cleanupRetainedMutations(1_700_000_000_000);

    expect(result).toEqual({ removedCount: 2 });
    expect(mockRunAsync).toHaveBeenCalledWith(
      expect.stringContaining("WHERE status = 'failed'"),
      1_700_000_000_000,
    );
    expect(mockRunAsync).toHaveBeenCalledWith(
      expect.stringContaining('updated_at < ?'),
      1_700_000_000_000,
    );
  });

  it('applies the same retention rule to the web localStorage queue', async () => {
    const storage = createLocalStorageMock([
      buildQueuedMutation({
        id: 'old_failed',
        status: 'failed',
        updatedAt: 999,
      }),
      buildQueuedMutation({
        id: 'recent_failed',
        status: 'failed',
        updatedAt: 1000,
      }),
      buildQueuedMutation({
        id: 'old_pending',
        status: 'pending',
        updatedAt: 100,
      }),
      buildQueuedMutation({
        id: 'old_retrying',
        status: 'retrying',
        nextRetryAt: 2000,
        updatedAt: 100,
      }),
      buildQueuedMutation({
        id: 'old_in_flight',
        status: 'in_flight',
        updatedAt: 100,
      }),
    ]);
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: storage,
    });
    const store = new WebSQLiteMutationQueueStore();

    const result = await store.cleanupRetainedMutations(1000);
    const retainedMutations = await store.getQueuedMutations(10);

    expect(result).toEqual({ removedCount: 1 });
    expect(retainedMutations.map((mutation) => mutation.id).sort()).toEqual([
      'old_in_flight',
      'old_pending',
      'old_retrying',
      'recent_failed',
    ]);
  });
});

function createLocalStorageMock(initialMutations: QueuedMutation[]): Storage {
  const state = new Map<string, string>();
  state.set('offline-queue', JSON.stringify(initialMutations));

  return {
    clear: jest.fn(() => {
      state.clear();
    }),
    getItem: jest.fn((_key: string) => state.get('offline-queue') ?? null),
    key: jest.fn((index: number) => [...state.keys()][index] ?? null),
    get length() {
      return state.size;
    },
    removeItem: jest.fn((key: string) => {
      state.delete(key);
    }),
    setItem: jest.fn((_key: string, value: string) => {
      state.set('offline-queue', value);
    }),
  };
}

function buildQueuedMutation(overrides: Partial<QueuedMutation> = {}): QueuedMutation {
  const status: MutationStatus = overrides.status ?? 'pending';

  return {
    id: 'mut_seeded',
    method: 'POST',
    url: 'local://feature/note.create',
    body: JSON.stringify({ note: 'queued body' }),
    headers: {
      'X-Mobile-Write-Operation': 'note.create',
    },
    status,
    idempotencyKey: 'idem_seeded',
    attemptCount: 0,
    maxAttempts: 5,
    nextRetryAt: 0,
    lastError: status === 'failed' ? 'HTTP 400: private detail' : null,
    createdAt: 100,
    updatedAt: 100,
    lastAttemptAt: null,
    ...overrides,
  };
}
