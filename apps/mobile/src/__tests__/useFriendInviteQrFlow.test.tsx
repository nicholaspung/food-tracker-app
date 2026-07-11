import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { useFriendWrites } from '../features';
import { trackObservabilityEvent } from '../observability';
import { trackProductEvent } from '../observability/productAnalytics';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { useFriendInviteQrFlow } from '../screens/friends/useFriendInviteQrFlow';

jest.mock('../features', () => {
  const friendCodeUtils = jest.requireActual('../features/store/friendCodeUtils');

  return {
    ...friendCodeUtils,
    useFriendWrites: jest.fn(),
  };
});

jest.mock('../observability', () => ({
  trackObservabilityEvent: jest.fn(),
}));

jest.mock('../observability/productAnalytics', () => ({
  trackProductEvent: jest.fn(),
}));

jest.mock('../providers/AuthProvider', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../providers/ConnectivityProvider', () => ({
  useConnectivity: jest.fn(),
}));

const mockedUseFriendWrites = useFriendWrites as jest.MockedFunction<typeof useFriendWrites>;
const mockedTrackObservabilityEvent = trackObservabilityEvent as jest.MockedFunction<
  typeof trackObservabilityEvent
>;
const mockedTrackProductEvent = trackProductEvent as jest.MockedFunction<typeof trackProductEvent>;
const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockedUseConnectivity = useConnectivity as jest.MockedFunction<typeof useConnectivity>;

type FriendInviteQrFlow = ReturnType<typeof useFriendInviteQrFlow>;

function renderQrFlow(onComplete: jest.Mock): {
  getFlow: () => FriendInviteQrFlow;
  renderer: ReactTestRenderer;
} {
  let flow: FriendInviteQrFlow | null = null;

  function Probe() {
    const nextFlow = useFriendInviteQrFlow({
      onComplete,
      source: 'QRScannerScreen',
    });

    useEffect(() => {
      flow = nextFlow;
    }, [nextFlow]);

    return null;
  }

  let renderer: ReactTestRenderer | null = null;
  act(() => {
    renderer = create(<Probe />);
  });

  if (!renderer) {
    throw new Error('Expected QR flow probe to render.');
  }

  return {
    getFlow: () => {
      if (!flow) {
        throw new Error('Expected QR flow controller.');
      }
      return flow;
    },
    renderer,
  };
}

describe('useFriendInviteQrFlow', () => {
  let onComplete: jest.Mock;
  let sendFriendRequest: jest.Mock;

  beforeEach(() => {
    onComplete = jest.fn();
    sendFriendRequest = jest.fn().mockResolvedValue({ status: 'completed' });
    mockedUseFriendWrites.mockReturnValue({ sendFriendRequest } as never);
    mockedUseAuth.mockReturnValue({
      user: {
        friendCode: 'SELF1234',
        id: 'user-1',
      },
    } as never);
    mockedUseConnectivity.mockReturnValue({ isOnline: true } as never);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('uses the shared offline-aware write path and records queued success consistently', async () => {
    sendFriendRequest.mockResolvedValue({ status: 'queued' });
    const { getFlow } = renderQrFlow(onComplete);

    await act(async () => {
      await getFlow().handleBarcodeScanned({
        data: 'yummyrecs://friends/add?friendCode=ABCD1234',
      });
    });

    expect(sendFriendRequest).toHaveBeenCalledWith({
      code: 'ABCD1234',
      entryMethod: 'qr_scan',
    });
    expect(mockedTrackObservabilityEvent).toHaveBeenCalledWith(
      'FRIEND_REQUEST_SEND_SUCCEEDED',
      {
        entryMethod: 'qr_scan',
        queued: true,
        source: 'QRScannerScreen',
      },
    );
    expect(mockedTrackProductEvent).toHaveBeenCalledWith('social.friend_request_sent', {
      entryMethod: 'qr_scan',
      queued: true,
      source: 'QRScannerScreen',
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('locks invalid scans until the retry delay and clears the timer on unmount', () => {
    jest.useFakeTimers();
    const { getFlow, renderer } = renderQrFlow(onComplete);

    act(() => {
      void getFlow().handleBarcodeScanned({ data: 'https://example.com/not-an-invite' });
      void getFlow().handleBarcodeScanned({ data: 'https://example.com/not-an-invite' });
    });

    expect(mockedTrackObservabilityEvent).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(1);

    act(() => {
      jest.advanceTimersByTime(1200);
      void getFlow().handleBarcodeScanned({ data: 'https://example.com/not-an-invite' });
    });

    expect(mockedTrackObservabilityEvent).toHaveBeenCalledTimes(2);
    expect(jest.getTimerCount()).toBe(1);

    act(() => {
      renderer.unmount();
    });

    expect(jest.getTimerCount()).toBe(0);
  });

  it('keeps the scanner paused and exposes write failures for retry', async () => {
    sendFriendRequest.mockRejectedValue(new Error('Friend request failed'));
    const { getFlow } = renderQrFlow(onComplete);

    await act(async () => {
      await getFlow().handleBarcodeScanned({
        data: 'yummyrecs://friends/add?friendCode=ABCD1234',
      });
    });

    expect(getFlow().errorMessage).toBe('Friend request failed');
    expect(getFlow().hasScanned).toBe(true);
    expect(getFlow().isSubmitting).toBe(false);
    expect(onComplete).not.toHaveBeenCalled();
    expect(mockedTrackObservabilityEvent).toHaveBeenCalledWith(
      'FRIEND_REQUEST_SEND_FAILED',
      expect.objectContaining({
        entryMethod: 'qr_scan',
        errorMessage: 'Friend request failed',
        isOnline: true,
        source: 'QRScannerScreen',
      }),
    );
  });
});
