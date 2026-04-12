import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { useOfflineAwareFeatureWrite } from '../features/store/useOfflineAwareFeatureWrite';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { useSync } from '../providers/SyncProvider';
import { trackObservabilityEvent } from '../observability';

jest.mock('../observability', () => ({
  trackObservabilityEvent: jest.fn(),
}));

jest.mock('../providers/ConnectivityProvider', () => ({
  useConnectivity: jest.fn(),
}));

jest.mock('../providers/SyncProvider', () => ({
  useSync: jest.fn(),
}));

const mockedTrackObservabilityEvent = trackObservabilityEvent as jest.MockedFunction<
  typeof trackObservabilityEvent
>;
const mockedUseConnectivity = useConnectivity as jest.MockedFunction<typeof useConnectivity>;
const mockedUseSync = useSync as jest.MockedFunction<typeof useSync>;

describe('useOfflineAwareFeatureWrite', () => {
  const enqueueMutation = jest.fn();

  beforeEach(() => {
    enqueueMutation.mockReset();
    mockedTrackObservabilityEvent.mockReset();
    mockedUseSync.mockReturnValue({
      enqueueMutation,
    } as unknown as ReturnType<typeof useSync>);
  });

  it('tracks telemetry and executes the live write when online', async () => {
    mockedUseConnectivity.mockReturnValue({ isOnline: true } as ReturnType<typeof useConnectivity>);

    let writeFeature: ReturnType<typeof useOfflineAwareFeatureWrite> | null = null;
    let renderer: ReactTestRenderer | null = null;
    const execute = jest.fn().mockResolvedValue('created');

    function TestComponent() {
      writeFeature = useOfflineAwareFeatureWrite();
      return null;
    }

    await act(async () => {
      renderer = create(React.createElement(TestComponent));
    });

    let result:
      | Awaited<ReturnType<ReturnType<typeof useOfflineAwareFeatureWrite>>>
      | undefined;
    await act(async () => {
      result = await writeFeature?.({
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
    });

    expect(mockedTrackObservabilityEvent).toHaveBeenCalledWith('ONLINE_WRITE_MARKED', {
      source: 'useWriteTelemetry',
      operationName: 'feedback.create',
      isOnline: true,
    });
    expect(enqueueMutation).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ status: 'completed', result: 'created' });

    await act(async () => {
      renderer?.unmount();
    });
  });

  it('enqueues a replayable outbox mutation instead of executing when offline', async () => {
    mockedUseConnectivity.mockReturnValue({ isOnline: false } as ReturnType<typeof useConnectivity>);

    let writeFeature: ReturnType<typeof useOfflineAwareFeatureWrite> | null = null;
    let renderer: ReactTestRenderer | null = null;
    const execute = jest.fn().mockResolvedValue('created');

    function TestComponent() {
      writeFeature = useOfflineAwareFeatureWrite();
      return null;
    }

    await act(async () => {
      renderer = create(React.createElement(TestComponent));
    });

    let result:
      | Awaited<ReturnType<ReturnType<typeof useOfflineAwareFeatureWrite>>>
      | undefined;
    await act(async () => {
      result = await writeFeature?.({
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
    });

    expect(enqueueMutation).toHaveBeenCalledWith({
      method: 'POST',
      url: 'local://feature/feedback.create',
      headers: {
        'X-Mobile-Write-Operation': 'feedback.create',
      },
      body: {
        title: 'Subject',
        description: 'Body',
      },
    });
    expect(execute).not.toHaveBeenCalled();
    expect(mockedTrackObservabilityEvent).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 'queued' });

    await act(async () => {
      renderer?.unmount();
    });
  });

  it('enqueues the provided api mutation instead of executing when offline', async () => {
    mockedUseConnectivity.mockReturnValue({ isOnline: false } as ReturnType<typeof useConnectivity>);

    let writeFeature: ReturnType<typeof useOfflineAwareFeatureWrite> | null = null;
    let renderer: ReactTestRenderer | null = null;
    const execute = jest.fn().mockResolvedValue('updated');

    function TestComponent() {
      writeFeature = useOfflineAwareFeatureWrite();
      return null;
    }

    await act(async () => {
      renderer = create(React.createElement(TestComponent));
    });

    let result:
      | Awaited<ReturnType<ReturnType<typeof useOfflineAwareFeatureWrite>>>
      | undefined;
    await act(async () => {
      result = await writeFeature?.({
        operationName: 'bill.update',
        offline: {
          strategy: 'api',
          input: {
            method: 'PUT',
            url: 'https://example.test/api/bills/bill_123',
            headers: {
              'X-Mobile-Write-Operation': 'bill.update',
            },
            body: {
              status: 'settled',
            },
          },
        },
        execute,
      });
    });

    expect(enqueueMutation).toHaveBeenCalledWith({
      method: 'PUT',
      url: 'https://example.test/api/bills/bill_123',
      headers: {
        'X-Mobile-Write-Operation': 'bill.update',
      },
      body: {
        status: 'settled',
      },
    });
    expect(execute).not.toHaveBeenCalled();
    expect(mockedTrackObservabilityEvent).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 'queued' });

    await act(async () => {
      renderer?.unmount();
    });
  });
});
