import { SQLiteMutationQueueStore as NativeSQLiteMutationQueueStore } from '../offline/SQLiteMutationQueueStore';
import { SQLiteMutationQueueStore as WebSQLiteMutationQueueStore } from '../offline/SQLiteMutationQueueStore.web';
import { createFetchMutationTransport } from '../offline/fetchMutationTransport';
import type { MutationStatus, QueuedMutation } from '../offline/types';

const mockRunAsync = jest.fn();
const mockGetAllAsync = jest.fn();

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(async () => ({
    execAsync: jest.fn(),
    getAllAsync: mockGetAllAsync,
    getFirstAsync: jest.fn(),
    runAsync: mockRunAsync,
  })),
}));

describe('SQLiteMutationQueueStore retention cleanup', () => {
  beforeEach(() => {
    mockRunAsync.mockReset();
    mockRunAsync.mockResolvedValue({ changes: 0 });
    mockGetAllAsync.mockReset();
    mockGetAllAsync.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('initializes native SQLite storage without deleting endpoint-specific rows', async () => {
    const store = new NativeSQLiteMutationQueueStore();

    await store.initialize();

    expect(mockRunAsync).toHaveBeenCalledTimes(1);
    expect(mockRunAsync).toHaveBeenCalledWith(
      expect.stringContaining("WHERE status = 'in_flight'"),
      expect.any(Number),
    );
    expect(mockRunAsync).not.toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM offline_mutation_queue'),
      expect.anything(),
    );
  });

  it('initializes the web queue without filtering endpoint-specific rows', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    const storage = createLocalStorageMock([
      buildQueuedMutation({
        id: 'old_probe',
        status: 'pending',
        url: 'https://api.example.com/api/mobile/offline-probe',
        updatedAt: 100,
      }),
      buildQueuedMutation({
        id: 'old_in_flight',
        status: 'in_flight',
        url: 'local://feature/note.create',
        updatedAt: 100,
      }),
    ]);
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: storage,
    });
    const store = new WebSQLiteMutationQueueStore();

    await store.initialize();
    const queuedMutations = await store.getQueuedMutations(10);

    expect(queuedMutations.map((mutation) => mutation.id).sort()).toEqual([
      'old_in_flight',
      'old_probe',
    ]);
    expect(queuedMutations.find((mutation) => mutation.id === 'old_probe')?.url).toBe(
      'https://api.example.com/api/mobile/offline-probe',
    );
    expect(queuedMutations.find((mutation) => mutation.id === 'old_in_flight')).toEqual(
      expect.objectContaining({
        nextRetryAt: 0,
        status: 'pending',
        updatedAt: 1_700_000_000_000,
      }),
    );
  });

  it('persists the originating account in native SQLite rows', async () => {
    const store = new NativeSQLiteMutationQueueStore();

    await store.enqueue({
      method: 'POST',
      originAccountId: 'account_a',
      url: 'local://feature/feedback.create',
    });

    expect(mockRunAsync).toHaveBeenCalledWith(
      expect.stringContaining('origin_account_id'),
      expect.any(String),
      'POST',
      'local://feature/feedback.create',
      'account_a',
      null,
      '{}',
      'pending',
      expect.any(String),
      0,
      5,
      0,
      null,
      expect.any(Number),
      expect.any(Number),
      null,
    );
  });

  it('round-trips the originating account through web queue storage', async () => {
    const storage = createLocalStorageMock([]);
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: storage,
    });
    const firstStore = new WebSQLiteMutationQueueStore();

    await firstStore.enqueue({
      method: 'POST',
      originAccountId: 'account_a',
      url: 'local://feature/feedback.create',
    });

    const restartedStore = new WebSQLiteMutationQueueStore();
    expect((await restartedStore.getQueuedMutations(1))[0]?.originAccountId).toBe('account_a');
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

  describe.each(['native', 'web'] as const)('%s queue destination binding', (platform) => {
    it.each([
      ['same origin', 'https://api.example.com/api/visits', true],
      ['normalized default port', 'https://api.example.com:443/api/visits', true],
      ['foreign origin', 'https://attacker.example/collect', false],
      ['malformed URL', '/api/visits', false],
    ])('%s', async (_caseName, url, shouldSend) => {
      const queuedMutation = buildQueuedMutation({ url });
      const loadedMutation = await loadQueueRow(platform, queuedMutation);
      const fetchMock = jest.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => '',
      }));
      const getAuthToken = jest.fn(() => 'live-token');
      const transport = createFetchMutationTransport({
        backendUrl: 'https://api.example.com',
        fetchImplementation: fetchMock as unknown as typeof fetch,
        getActiveAccountId: () => 'user_1',
        getAuthToken,
      });

      const result = await transport.send(loadedMutation);

      expect(result.ok).toBe(shouldSend);
      expect(fetchMock).toHaveBeenCalledTimes(shouldSend ? 1 : 0);
      expect(getAuthToken).toHaveBeenCalledTimes(shouldSend ? 1 : 0);
    });
  });
});

async function loadQueueRow(
  platform: 'native' | 'web',
  mutation: QueuedMutation,
): Promise<QueuedMutation> {
  if (platform === 'native') {
    mockGetAllAsync.mockResolvedValueOnce([buildNativeQueueRow(mutation)]);
    const store = new NativeSQLiteMutationQueueStore();
    const loaded = await store.getReadyMutations(Date.now(), 1);
    return loaded[0] as QueuedMutation;
  }

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: createLocalStorageMock([mutation]),
  });
  const store = new WebSQLiteMutationQueueStore();
  const loaded = await store.getReadyMutations(Date.now(), 1);
  return loaded[0] as QueuedMutation;
}

function buildNativeQueueRow(mutation: QueuedMutation) {
  return {
    id: mutation.id,
    method: mutation.method,
    url: mutation.url,
    origin_account_id: mutation.originAccountId,
    body: mutation.body,
    headers: JSON.stringify(mutation.headers),
    status: mutation.status,
    idempotency_key: mutation.idempotencyKey,
    attempt_count: mutation.attemptCount,
    max_attempts: mutation.maxAttempts,
    next_retry_at: mutation.nextRetryAt,
    last_error: mutation.lastError,
    created_at: mutation.createdAt,
    updated_at: mutation.updatedAt,
    last_attempt_at: mutation.lastAttemptAt,
  };
}

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
    originAccountId: 'user_1',
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
