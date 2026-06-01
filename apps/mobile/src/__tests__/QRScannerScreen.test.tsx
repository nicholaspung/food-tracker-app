import React from 'react';
import { act, create } from 'react-test-renderer';
import { useCameraPermissions } from 'expo-camera';

import { QRScannerScreen } from '../screens/QRScannerScreen';
import { useFriendWrites } from '../features';
import { useWriteTelemetry } from '../features/store/useWriteTelemetry';
import { useAuth } from '../providers/AuthProvider';

const mockReact = React;

jest.mock('react-native', () => ({
  ActivityIndicator: (props: Record<string, unknown>) => mockReact.createElement('ActivityIndicator', props),
  Linking: {
    openSettings: jest.fn(),
  },
  Pressable: (props: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Pressable', props, props.children),
  StyleSheet: {
    absoluteFillObject: {
      bottom: 0,
      left: 0,
      position: 'absolute',
      right: 0,
      top: 0,
    },
  },
  View: (props: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('View', props, props.children),
}));

jest.mock('expo-camera', () => ({
  CameraView: (props: Record<string, unknown>) => mockReact.createElement('CameraView', props),
  useCameraPermissions: jest.fn(),
}));

jest.mock('../components/shared', () => ({
  FeatureDetailScreenScaffold: (
    props: Record<string, unknown> & { children?: React.ReactNode },
  ) => mockReact.createElement('FeatureDetailScreenScaffold', props, props.children),
}));

jest.mock('../components/shared/PageErrorToast', () => ({
  PageErrorToast: (props: Record<string, unknown>) => mockReact.createElement('PageErrorToast', props),
}));

jest.mock('../features', () => {
  const friendCodeUtils = jest.requireActual('../features/store/friendCodeUtils');

  return {
    ...friendCodeUtils,
    friendsQueryKeys: {
      root: ['feature', 'friends'],
    },
    useFriendWrites: jest.fn(),
  };
});

jest.mock('../features/store/useWriteTelemetry', () => ({
  useWriteTelemetry: jest.fn(),
}));

jest.mock('../observability', () => ({
  trackObservabilityEvent: jest.fn(),
}));

jest.mock('../providers/AuthProvider', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../lib/offlineAlerts', () => ({
  showQueuedOfflineAlert: jest.fn(),
}));

jest.mock('../theme', () => ({
  createThemedStyles: (factory: (theme: Record<string, any>) => Record<string, unknown>) => () =>
    factory({
      colors: {
        background: {
          surface: 'surface',
        },
        border: {
          default: 'defaultBorder',
          info: 'infoBorder',
          subtle: 'subtleBorder',
        },
        status: {
          infoBg: 'infoBg',
        },
        text: {
          brand: 'brandText',
          info: 'infoText',
          primary: 'primaryText',
          secondary: 'secondaryText',
        },
      },
      radii: {
        lg: 12,
        md: 8,
        pill: 999,
      },
      spacing: {
        md: 16,
        sm: 8,
        xs: 6,
      },
    }),
  useTheme: () => ({
    colors: {
      text: {
        brand: 'brandText',
        info: 'infoText',
        secondary: 'secondaryText',
      },
    },
  }),
}));

jest.mock('../ui', () => ({
  Button: (props: Record<string, unknown>) => mockReact.createElement('Button', props),
  Card: (props: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Card', props, props.children),
  Text: (props: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Text', props, props.children),
}));

const mockedUseCameraPermissions = useCameraPermissions as jest.MockedFunction<typeof useCameraPermissions>;
const mockedUseFriendWrites = useFriendWrites as jest.MockedFunction<typeof useFriendWrites>;
const mockedUseWriteTelemetry = useWriteTelemetry as jest.MockedFunction<typeof useWriteTelemetry>;
const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

function renderScanner() {
  let renderer: any;

  act(() => {
    renderer = create(
      <QRScannerScreen
        navigation={{
          canGoBack: jest.fn(() => true),
          goBack: jest.fn(),
          navigate: jest.fn(),
        } as never}
        route={{
          key: 'QRScanner-route',
          name: 'QRScanner',
        } as never}
      />,
    );
  });

  if (renderer === undefined) {
    throw new Error('QRScannerScreen did not render.');
  }

  return renderer;
}

describe('QRScannerScreen', () => {
  let sendFriendRequest: jest.Mock;

  beforeEach(() => {
    sendFriendRequest = jest.fn(async ({ beforeExecute }: { beforeExecute?: () => Promise<void> }) => {
      await beforeExecute?.();
      return {
        status: 'completed',
      };
    });

    mockedUseCameraPermissions.mockReturnValue([
      {
        canAskAgain: true,
        granted: true,
      },
      jest.fn(),
    ] as never);
    mockedUseFriendWrites.mockReturnValue({
      acceptFriendRequest: jest.fn(),
      removeFriend: jest.fn(),
      sendFriendRequest,
    } as never);
    mockedUseWriteTelemetry.mockReturnValue(jest.fn().mockResolvedValue(undefined));
    mockedUseAuth.mockReturnValue({
      user: {
        friendCode: 'SELF1234',
        id: 'user-1',
      },
    } as never);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('configures the camera for QR scanning with focus, torch support, and modest zoom', () => {
    const renderer = renderScanner();

    const camera = renderer.root.findByType('CameraView');

    expect(camera.props.autofocus).toBe('on');
    expect(camera.props.barcodeScannerSettings).toEqual({
      barcodeTypes: ['qr'],
    });
    expect(camera.props.enableTorch).toBe(false);
    expect(camera.props.facing).toBe('back');
    expect(camera.props.onBarcodeScanned).toEqual(expect.any(Function));
    expect(camera.props.zoom).toBe(0.08);
  });

  it('submits a valid QR invite through the offline-aware write path', async () => {
    const renderer = renderScanner();
    const camera = renderer.root.findByType('CameraView');

    await act(async () => {
      camera.props.onBarcodeScanned({
        data: 'yummyrecs://friends/add?friendCode=ABCD1234',
      });
    });

    expect(sendFriendRequest).toHaveBeenCalledWith({
      beforeExecute: expect.any(Function),
      code: 'ABCD1234',
      trackOnlineWrite: false,
    });
  });

  it('does not submit an invalid QR payload', () => {
    jest.useFakeTimers();
    const renderer = renderScanner();
    const camera = renderer.root.findByType('CameraView');

    act(() => {
      camera.props.onBarcodeScanned({
        data: 'https://example.com/not-a-friend-invite',
      });
    });

    expect(sendFriendRequest).not.toHaveBeenCalled();
  });

  it('resets paused scan state when Scan Again is pressed', () => {
    const renderer = renderScanner();
    const camera = renderer.root.findByType('CameraView');

    act(() => {
      camera.props.onBarcodeScanned({
        data: 'yummyrecs://friends/add?friendCode=SELF1234',
      });
    });

    expect(renderer.root.findByType('CameraView').props.onBarcodeScanned).toBeUndefined();

    const scanAgainButton = renderer.root.findByProps({ label: 'Scan Again' });
    act(() => {
      scanAgainButton.props.onPress();
    });

    expect(renderer.root.findByType('CameraView').props.onBarcodeScanned).toEqual(
      expect.any(Function),
    );
  });

  it('uses neutral copy before requesting camera permission', () => {
    const requestCameraPermission = jest.fn();
    mockedUseCameraPermissions.mockReturnValue([
      {
        canAskAgain: true,
        granted: false,
      },
      requestCameraPermission,
    ] as never);

    const renderer = renderScanner();
    const continueButton = renderer.root.findByProps({ label: 'Continue' });

    expect(() => renderer.root.findByProps({ label: 'Allow Camera Access' })).toThrow();

    act(() => {
      continueButton.props.onPress();
    });

    expect(requestCameraPermission).toHaveBeenCalledTimes(1);
  });
});
