import React from 'react';
import { act, create } from 'react-test-renderer';
import { useQueryClient } from '@tanstack/react-query';
import { useCameraPermissions } from 'expo-camera';

import { QRScannerScreen } from '../screens/QRScannerScreen';
import { inviteFriend } from '../features';
import { useOfflineAwareFeatureWrite } from '../features/store/useOfflineAwareFeatureWrite';
import { useWriteTelemetry } from '../features/store/useWriteTelemetry';
import { useAuth } from '../providers/AuthProvider';

const mockReact = React;

jest.mock('react-native', () => ({
  ActivityIndicator: (props: Record<string, unknown>) => mockReact.createElement('ActivityIndicator', props),
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

jest.mock('@expo/vector-icons', () => ({
  Ionicons: (props: Record<string, unknown>) => mockReact.createElement('Ionicons', props),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: jest.fn(),
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
    inviteFriend: jest.fn(),
  };
});

jest.mock('../features/store/useOfflineAwareFeatureWrite', () => ({
  useOfflineAwareFeatureWrite: jest.fn(),
}));

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

const mockedUseQueryClient = useQueryClient as jest.MockedFunction<typeof useQueryClient>;
const mockedUseCameraPermissions = useCameraPermissions as jest.MockedFunction<typeof useCameraPermissions>;
const mockedInviteFriend = inviteFriend as jest.MockedFunction<typeof inviteFriend>;
const mockedUseOfflineAwareFeatureWrite = useOfflineAwareFeatureWrite as jest.MockedFunction<
  typeof useOfflineAwareFeatureWrite
>;
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
  let invalidateQueries: jest.Mock;
  let writeFeature: jest.Mock;

  beforeEach(() => {
    invalidateQueries = jest.fn().mockResolvedValue(undefined);
    writeFeature = jest.fn(async ({ execute }: { execute: () => Promise<unknown> }) => {
      await execute();
      return {
        status: 'executed',
      };
    });

    mockedUseQueryClient.mockReturnValue({
      invalidateQueries,
    } as never);
    mockedUseCameraPermissions.mockReturnValue([
      {
        canAskAgain: true,
        granted: true,
      },
      jest.fn(),
    ] as never);
    mockedUseOfflineAwareFeatureWrite.mockReturnValue(writeFeature as ReturnType<typeof useOfflineAwareFeatureWrite>);
    mockedUseWriteTelemetry.mockReturnValue(jest.fn().mockResolvedValue(undefined));
    mockedUseAuth.mockReturnValue({
      user: {
        friendCode: 'SELF1234',
        id: 'user-1',
      },
    } as never);
    mockedInviteFriend.mockResolvedValue({
      createdAt: '2026-04-25T12:00:00.000Z',
      email: '',
      id: 'friendship-1',
      name: 'Friend',
      status: 'pending_sent',
      userId: 'friend-user-1',
    });
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

    expect(writeFeature).toHaveBeenCalledWith(expect.objectContaining({
      offline: {
        payload: {
          code: 'ABCD1234',
        },
        strategy: 'outbox',
      },
      operationName: 'friend.request.send',
    }));
    expect(mockedInviteFriend).toHaveBeenCalledWith({
      code: 'ABCD1234',
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['feature', 'friends'],
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

    expect(writeFeature).not.toHaveBeenCalled();
    expect(mockedInviteFriend).not.toHaveBeenCalled();
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
});
