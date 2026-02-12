import { createFetchMutationTransport } from '../offline/fetchMutationTransport';
import type { QueuedMutation } from '../offline/types';

function createQueuedMutation(overrides: Partial<QueuedMutation> = {}): QueuedMutation {
  return {
    id: 'mut_1',
    method: 'POST',
    url: 'https://api.example.com/visits',
    body: JSON.stringify({ rating: 5 }),
    headers: {},
    status: 'pending',
    idempotencyKey: 'idem_123',
    attemptCount: 0,
    maxAttempts: 5,
    nextRetryAt: 0,
    lastError: null,
    createdAt: 1,
    updatedAt: 1,
    lastAttemptAt: null,
    ...overrides,
  };
}

describe('createFetchMutationTransport', () => {
  it('adds idempotency headers to outgoing writes', async () => {
    const fetchMock = jest.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => '',
    }));

    const transport = createFetchMutationTransport({
      fetchImplementation: fetchMock as unknown as typeof fetch,
      getAuthToken: () => 'jwt_value',
    });

    const result = await transport.send(createQueuedMutation());

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calls = fetchMock.mock.calls as unknown[][];
    const requestInit = (calls[0]?.[1] ?? {}) as RequestInit;

    expect(requestInit.headers).toMatchObject({
      'Idempotency-Key': 'idem_123',
      'X-Idempotency-Key': 'idem_123',
      Authorization: 'Bearer jwt_value',
    });
  });

  it('marks 409 conflicts as non-retryable', async () => {
    const fetchMock = jest.fn(async () => ({
      ok: false,
      status: 409,
      text: async () => 'Duplicate write',
    }));

    const transport = createFetchMutationTransport({
      fetchImplementation: fetchMock as unknown as typeof fetch,
    });

    const result = await transport.send(createQueuedMutation());

    expect(result.ok).toBe(false);
    expect(result.retryable).toBe(false);
    expect(result.statusCode).toBe(409);
    expect(result.errorMessage).toContain('Conflict');
  });
});
