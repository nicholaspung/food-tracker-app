import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { useWriteTelemetry } from '../features/store/useWriteTelemetry';
import { trackObservabilityEvent } from '../observability';
import { useConnectivity } from '../providers/ConnectivityProvider';

jest.mock('../observability', () => ({
  trackObservabilityEvent: jest.fn(),
}));

jest.mock('../providers/ConnectivityProvider', () => ({
  useConnectivity: jest.fn(),
}));

const mockedTrackObservabilityEvent = trackObservabilityEvent as jest.MockedFunction<
  typeof trackObservabilityEvent
>;
const mockedUseConnectivity = useConnectivity as jest.MockedFunction<typeof useConnectivity>;

describe('useWriteTelemetry', () => {
  beforeEach(() => {
    mockedTrackObservabilityEvent.mockReset();
    mockedUseConnectivity.mockReturnValue({ isOnline: true } as ReturnType<typeof useConnectivity>);
  });

  it('records an observability event without enqueueing a marker mutation', async () => {
    let trackWriteTelemetry: ReturnType<typeof useWriteTelemetry> | null = null;
    let renderer: ReactTestRenderer | null = null;

    function TestComponent() {
      trackWriteTelemetry = useWriteTelemetry();
      return null;
    }

    await act(async () => {
      renderer = create(React.createElement(TestComponent));
    });

    await act(async () => {
      await trackWriteTelemetry?.('bill.create');
    });

    expect(mockedTrackObservabilityEvent).toHaveBeenCalledWith('ONLINE_WRITE_MARKED', {
      source: 'useWriteTelemetry',
      operationName: 'bill.create',
      isOnline: true,
    });

    await act(async () => {
      renderer?.unmount();
    });
  });
});
