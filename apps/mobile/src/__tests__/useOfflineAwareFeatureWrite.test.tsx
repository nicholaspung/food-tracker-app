import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import {
  DurableFeatureWriteFailure,
  useOfflineAwareFeatureWrite,
} from '../features/store/useOfflineAwareFeatureWrite';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { useSync } from '../providers/SyncProvider';

jest.mock('../observability', () => ({
  trackObservabilityEvent: jest.fn(),
}));

jest.mock('../providers/ConnectivityProvider', () => ({
  useConnectivity: jest.fn(),
}));

jest.mock('../providers/SyncProvider', () => ({
  useSync: jest.fn(),
}));

const mockedUseConnectivity = useConnectivity as jest.MockedFunction<typeof useConnectivity>;
const mockedUseSync = useSync as jest.MockedFunction<typeof useSync>;

describe('useOfflineAwareFeatureWrite', () => {
  const beginMutationDelivery = jest.fn();
  const completeMutationDelivery = jest.fn();
  const deferMutationDelivery = jest.fn();
  const discardMutationDelivery = jest.fn();
  const stageMutation = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    beginMutationDelivery.mockResolvedValue(undefined);
    completeMutationDelivery.mockResolvedValue(undefined);
    deferMutationDelivery.mockResolvedValue(undefined);
    discardMutationDelivery.mockResolvedValue(undefined);
    stageMutation.mockResolvedValue({
      id: 'mutation_1',
      idempotencyKey: 'idem_1',
    });
    mockedUseSync.mockReturnValue({
      beginMutationDelivery,
      completeMutationDelivery,
      deferMutationDelivery,
      discardMutationDelivery,
      stageMutation,
    } as unknown as ReturnType<typeof useSync>);
  });

  async function renderWriteFeature(): Promise<{
    getWriteFeature: () => ReturnType<typeof useOfflineAwareFeatureWrite>;
    renderer: ReactTestRenderer;
  }> {
    let writeFeature: ReturnType<typeof useOfflineAwareFeatureWrite> | null = null;
    let renderer: ReactTestRenderer | null = null;

    function TestComponent() {
      writeFeature = useOfflineAwareFeatureWrite();
      return null;
    }

    await act(async () => {
      renderer = create(React.createElement(TestComponent));
    });

    if (!renderer) {
      throw new Error('Expected hook to render.');
    }

    return {
      getWriteFeature: () => {
        if (!writeFeature) {
          throw new Error('Expected write feature hook.');
        }
        return writeFeature;
      },
      renderer,
    };
  }

  it('persists before online delivery and completes with the domain result', async () => {
    mockedUseConnectivity.mockReturnValue({
      isOnline: true,
      status: 'online',
    } as ReturnType<typeof useConnectivity>);
    const execute = jest.fn().mockResolvedValue('created');
    const { getWriteFeature, renderer } = await renderWriteFeature();

    const result = await getWriteFeature()({
      operationName: 'feedback.create',
      offline: {
        strategy: 'outbox',
        payload: {
          title: 'Subject',
          description: 'Body',
        },
      },
      execute,
    });

    expect(stageMutation).toHaveBeenCalledWith({
      method: 'POST',
      url: 'local://feature/feedback.create',
      headers: {
        'X-Mobile-Write-Operation': 'feedback.create',
      },
      body: {
        schemaVersion: 1,
        payload: {
          title: 'Subject',
          description: 'Body',
        },
      },
    });
    expect(stageMutation.mock.invocationCallOrder[0]).toBeLessThan(
      execute.mock.invocationCallOrder[0],
    );
    expect(beginMutationDelivery).toHaveBeenCalledWith('mutation_1');
    expect(execute).toHaveBeenCalledWith({
      headers: {
        'Idempotency-Key': 'idem_1',
        'X-Idempotency-Key': 'idem_1',
        'X-Mobile-Write-Operation': 'feedback.create',
      },
    });
    expect(completeMutationDelivery).toHaveBeenCalledWith('mutation_1');
    expect(result).toEqual({ status: 'completed', result: 'created' });

    await act(async () => {
      renderer.unmount();
    });
  });

  it('queues a write while connectivity is still unknown', async () => {
    mockedUseConnectivity.mockReturnValue({
      isOnline: false,
      status: 'unknown',
    } as ReturnType<typeof useConnectivity>);
    const execute = jest.fn().mockResolvedValue('created');
    const { getWriteFeature, renderer } = await renderWriteFeature();

    const result = await getWriteFeature()({
      operationName: 'feedback.create',
      offline: {
        strategy: 'outbox',
        payload: {
          title: 'Subject',
          description: 'Body',
        },
      },
      execute,
    });

    expect(stageMutation).toHaveBeenCalledTimes(1);
    expect(beginMutationDelivery).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 'queued' });

    await act(async () => {
      renderer.unmount();
    });
  });

  it('keeps the same command queued after a stale-online transport failure', async () => {
    mockedUseConnectivity.mockReturnValue({
      isOnline: true,
      status: 'online',
    } as ReturnType<typeof useConnectivity>);
    const execute = jest.fn().mockRejectedValue(new TypeError('Network request failed'));
    const { getWriteFeature, renderer } = await renderWriteFeature();

    const result = await getWriteFeature()({
      operationName: 'bill.update',
      offline: {
        strategy: 'api',
        input: {
          method: 'PUT',
          url: 'https://example.test/api/bills/bill_123',
          body: { status: 'settled' },
        },
      },
      execute,
    });

    expect(execute).toHaveBeenCalledWith({
      headers: {
        'Idempotency-Key': 'idem_1',
        'X-Idempotency-Key': 'idem_1',
      },
    });
    expect(deferMutationDelivery).toHaveBeenCalledWith(
      'mutation_1',
      'Network request failed',
    );
    expect(completeMutationDelivery).not.toHaveBeenCalled();
    expect(discardMutationDelivery).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 'queued' });

    await act(async () => {
      renderer.unmount();
    });
  });

  it('keeps the staged command queued after a retryable server response', async () => {
    mockedUseConnectivity.mockReturnValue({
      isOnline: true,
      status: 'online',
    } as ReturnType<typeof useConnectivity>);
    const execute = jest.fn().mockRejectedValue(
      Object.assign(new Error('Service Unavailable.'), { status: 503 }),
    );
    const { getWriteFeature, renderer } = await renderWriteFeature();

    const result = await getWriteFeature()({
      operationName: 'note.create',
      offline: {
        strategy: 'outbox',
        payload: {
          title: 'Response loss note',
          content: 'Keep this queued',
          photos: [],
        },
      },
      execute,
    });

    expect(deferMutationDelivery).toHaveBeenCalledWith('mutation_1', 'Service Unavailable.');
    expect(completeMutationDelivery).not.toHaveBeenCalled();
    expect(discardMutationDelivery).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 'queued' });

    await act(async () => {
      renderer.unmount();
    });
  });

  it('discards terminal failures and exposes a typed failed outcome', async () => {
    mockedUseConnectivity.mockReturnValue({
      isOnline: true,
      status: 'online',
    } as ReturnType<typeof useConnectivity>);
    const terminalError = Object.assign(new Error('Validation failed'), { status: 400 });
    const execute = jest.fn().mockRejectedValue(terminalError);
    const { getWriteFeature, renderer } = await renderWriteFeature();

    await expect(
      getWriteFeature()({
        operationName: 'feedback.create',
        offline: {
          strategy: 'outbox',
          payload: {
            title: '',
            description: '',
          },
        },
        execute,
      }),
    ).rejects.toMatchObject({
      message: 'Validation failed',
      name: DurableFeatureWriteFailure.name,
      retryable: false,
      status: 'failed',
    });

    expect(discardMutationDelivery).toHaveBeenCalledWith('mutation_1');
    expect(deferMutationDelivery).not.toHaveBeenCalled();

    await act(async () => {
      renderer.unmount();
    });
  });
});
