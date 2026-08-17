import { createFetchMutationTransport } from '../offline/fetchMutationTransport';
import type { QueuedMutation } from '../offline/types';

function createQueuedMutation(overrides: Partial<QueuedMutation> = {}): QueuedMutation {
  return {
    id: 'mut_1',
    method: 'POST',
    url: 'https://api.example.com/visits',
    originAccountId: 'user_1',
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
      getActiveAccountId: () => 'user_1',
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

  it('rejects a queued write when its origin account no longer matches', async () => {
    const fetchMock = jest.fn();
    const transport = createFetchMutationTransport({
      fetchImplementation: fetchMock as unknown as typeof fetch,
      getActiveAccountId: () => 'user_2',
      getAuthToken: () => 'user_2_token',
    });

    const result = await transport.send(createQueuedMutation());

    expect(result).toEqual({
      accountBindingState: 'different_account',
      errorMessage: 'Queued write belongs to a different account and was quarantined.',
      ok: false,
      retryable: false,
      statusCode: null,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('quarantines cross-account food product payloads before decoding or photo upload', async () => {
    const fetchMock = jest.fn();
    const transport = createFetchMutationTransport({
      fetchImplementation: fetchMock as unknown as typeof fetch,
      getActiveAccountId: () => 'user_2',
      getAuthToken: () => 'user_2_token',
    });

    const result = await transport.send(
      createQueuedMutation({
        url: 'local://feature/food-product.create',
        body: JSON.stringify({
          itemName: 'Account A private item',
          photo: {
            mimeType: 'image/jpeg',
            name: 'private.jpg',
            uri: 'file:///private.jpg',
          },
          rating: 5,
        }),
        headers: {
          'X-Mobile-Write-Operation': 'food-product.create',
        },
        originAccountId: 'user_1',
      }),
    );

    expect(result.accountBindingState).toBe('different_account');
    expect(result.retryable).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
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

  it('treats a missing delete target as an idempotent replay success', async () => {
    const fetchMock = jest.fn(async () => ({
      ok: false,
      status: 404,
      text: async () => 'Not found',
    }));
    const transport = createFetchMutationTransport({
      fetchImplementation: fetchMock as unknown as typeof fetch,
    });

    const result = await transport.send(
      createQueuedMutation({
        method: 'DELETE',
        url: 'https://api.example.com/bills/bill_1',
      }),
    );

    expect(result).toEqual({
      errorMessage: null,
      ok: true,
      retryable: false,
      statusCode: 404,
    });
  });

  it('treats aborted sends as cancelled instead of retryable failures', async () => {
    const abortError = new Error('Aborted');
    abortError.name = 'AbortError';
    const controller = new AbortController();
    const fetchMock = jest.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.signal).toBe(controller.signal);
      throw abortError;
    });

    const transport = createFetchMutationTransport({
      fetchImplementation: fetchMock as unknown as typeof fetch,
    });

    const result = await transport.send(createQueuedMutation(), {
      signal: controller.signal,
    });

    expect(result.cancelled).toBe(true);
    expect(result.retryable).toBe(false);
    expect(result.statusCode).toBeNull();
  });

  it('marks invalid local feature outbox payloads as non-retryable terminal failures', async () => {
    const transport = createFetchMutationTransport({
      fetchImplementation: jest.fn() as unknown as typeof fetch,
    });

    const result = await transport.send(
      createQueuedMutation({
        url: 'local://feature/visit.create',
        body: JSON.stringify({
          restaurantName: 'Noodle House',
        }),
        headers: {
          'X-Mobile-Write-Operation': 'visit.create',
        },
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.retryable).toBe(false);
    expect(result.statusCode).toBeNull();
    expect(result.errorMessage).toBe('Invalid payload for visit.create: items is required.');
  });

  it('marks local domain validation errors as non-retryable terminal failures', async () => {
    const transport = createFetchMutationTransport({
      fetchImplementation: jest.fn() as unknown as typeof fetch,
    });

    const result = await transport.send(
      createQueuedMutation({
        url: 'local://feature/tasting-session.status.update',
        body: JSON.stringify({
          sessionId: 'session_1',
          status: 'lobby',
        }),
        headers: {
          'X-Mobile-Write-Operation': 'tasting-session.status.update',
        },
      }),
    );

    expect(result).toEqual({
      errorMessage: 'Unsupported tasting session status transition.',
      ok: false,
      retryable: false,
      statusCode: null,
    });
  });
});
