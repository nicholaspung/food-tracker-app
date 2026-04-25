import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { CameraView, useCameraPermissions } from 'expo-camera';

import { FeatureDetailScreenScaffold } from '../components/shared';
import {
  extractFriendCodeFromQrPayload,
  friendsQueryKeys,
  inviteFriend,
  resolveOwnFriendCode,
  sanitizeFriendCode,
} from '../features';
import { useOfflineAwareFeatureWrite } from '../features/store/useOfflineAwareFeatureWrite';
import { useWriteTelemetry } from '../features/store/useWriteTelemetry';
import { showQueuedOfflineAlert } from '../lib/offlineAlerts';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useAuth } from '../providers/AuthProvider';
import { createThemedStyles, useTheme } from '../theme';
import { Button, Card, Text } from '../ui';
import { PageErrorToast } from '../components/shared/PageErrorToast';

type QRScannerScreenProps = NativeStackScreenProps<RootStackParamList, 'QRScanner'>;

const INVALID_SCAN_RETRY_DELAY_MS = 1200;
const QR_SCAN_ZOOM = 0.08;

const useStyles = createThemedStyles((theme) => ({
  body: {
    flex: 1,
    gap: theme.spacing.md,
    paddingBottom: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
  },
  cameraSection: {
    backgroundColor: theme.colors.background.surface,
    borderColor: theme.colors.border.default,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    flex: 1,
    minHeight: 420,
    overflow: 'hidden',
  },
  camera: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    padding: theme.spacing.md,
  },
  overlayTopCard: {
    alignSelf: 'stretch',
    backgroundColor: theme.colors.background.surface,
    borderColor: theme.colors.border.subtle,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    gap: theme.spacing.xs,
    padding: theme.spacing.md,
  },
  overlayTopHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  overlayBottomCard: {
    alignSelf: 'stretch',
    backgroundColor: theme.colors.background.surface,
    borderColor: theme.colors.border.subtle,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    gap: theme.spacing.xs,
    padding: theme.spacing.md,
  },
  overlayTitle: {
    color: theme.colors.text.primary,
  },
  overlayText: {
    color: theme.colors.text.secondary,
  },
  torchButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.background.surface,
    borderColor: theme.colors.border.default,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  torchButtonActive: {
    backgroundColor: theme.colors.status.infoBg,
    borderColor: theme.colors.border.info,
  },
  scanWindowWrap: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  scanWindow: {
    aspectRatio: 1,
    backgroundColor: 'transparent',
    borderColor: theme.colors.border.info,
    borderRadius: theme.radii.md,
    borderWidth: 3,
    maxHeight: 300,
    maxWidth: 300,
    minHeight: 220,
    minWidth: 220,
    width: '72%',
  },
  statusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  statusText: {
    color: theme.colors.text.secondary,
    flex: 1,
  },
  permissionCard: {
    gap: theme.spacing.sm,
  },
}));

export function QRScannerScreen({ navigation }: QRScannerScreenProps) {
  const theme = useTheme();
  const styles = useStyles();
  const writeFeature = useOfflineAwareFeatureWrite();
  const trackWriteTelemetry = useWriteTelemetry();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const scanLockRef = useRef(false);
  const invalidScanRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [scannedCode, setScannedCode] = useState('');
  const [hasScanned, setHasScanned] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTorchEnabled, setIsTorchEnabled] = useState(false);

  useEffect(() => () => {
    if (invalidScanRetryTimerRef.current) {
      clearTimeout(invalidScanRetryTimerRef.current);
    }
  }, []);

  const handleBackPress = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    navigation.navigate('Friends');
  };

  const isCameraGranted = cameraPermission?.granted === true;
  const myFriendCode = resolveOwnFriendCode(user?.id, user?.friendCode);

  const resetScanner = () => {
    if (invalidScanRetryTimerRef.current) {
      clearTimeout(invalidScanRetryTimerRef.current);
      invalidScanRetryTimerRef.current = null;
    }
    scanLockRef.current = false;
    setHasScanned(false);
    setScannedCode('');
    setErrorMessage(null);
    setIsSubmitting(false);
  };

  const queueInvalidScanRetry = () => {
    if (invalidScanRetryTimerRef.current) {
      clearTimeout(invalidScanRetryTimerRef.current);
    }

    invalidScanRetryTimerRef.current = setTimeout(() => {
      scanLockRef.current = false;
      invalidScanRetryTimerRef.current = null;
    }, INVALID_SCAN_RETRY_DELAY_MS);
  };

  const handleScanResult = async (inviteCode: string) => {
    const normalizedCode = sanitizeFriendCode(inviteCode);
    trackObservabilityEvent('QR_SCAN_SUBMIT_STARTED', {
      source: 'QRScannerScreen',
    });
    if (normalizedCode.length !== 8) {
      trackObservabilityEvent('FRIEND_REQUEST_SEND_VALIDATION_FAILED', {
        source: 'QRScannerScreen',
        entryMethod: 'qr_scan',
        reason: 'invalid_code_length',
        codeLength: normalizedCode.length,
      });
      setErrorMessage('Friend code must be 8 characters.');
      setHasScanned(true);
      return;
    }

    if (normalizedCode === myFriendCode) {
      trackObservabilityEvent('FRIEND_REQUEST_SEND_VALIDATION_FAILED', {
        source: 'QRScannerScreen',
        entryMethod: 'qr_scan',
        reason: 'self_code',
        codeLength: normalizedCode.length,
      });
      setErrorMessage('You cannot add yourself as a friend.');
      setHasScanned(true);
      return;
    }

    setErrorMessage(null);
    setScannedCode(normalizedCode);
    trackObservabilityEvent('FRIEND_REQUEST_SEND_STARTED', {
      source: 'QRScannerScreen',
      entryMethod: 'qr_scan',
      codeLength: normalizedCode.length,
    });
    setIsSubmitting(true);

    try {
      const requestResult = await writeFeature({
        operationName: 'friend.request.send',
        trackOnlineWrite: false,
        offline: {
          strategy: 'outbox',
          payload: {
            code: normalizedCode,
          },
        },
        execute: async () => {
          await trackWriteTelemetry('friend.qr.scan');
          return inviteFriend({
            code: normalizedCode,
          });
        },
      });

      if (requestResult.status === 'queued') {
        await queryClient.invalidateQueries({ queryKey: friendsQueryKeys.root });
        trackObservabilityEvent('FRIEND_REQUEST_SEND_SUCCEEDED', {
          source: 'QRScannerScreen',
          entryMethod: 'qr_scan',
          queued: true,
        });
        trackObservabilityEvent('QR_SCAN_SUBMIT_COMPLETED', {
          source: 'QRScannerScreen',
          queued: true,
        });
        showQueuedOfflineAlert('Friend request');
        navigation.navigate('Friends', {
          initialFriendsSubTab: 'sent',
          initialSection: 'friends-list',
        });
        return;
      }

      await queryClient.invalidateQueries({ queryKey: friendsQueryKeys.root });
      trackObservabilityEvent('FRIEND_REQUEST_SEND_SUCCEEDED', {
        source: 'QRScannerScreen',
        entryMethod: 'qr_scan',
        queued: false,
      });
      trackObservabilityEvent('QR_SCAN_SUBMIT_COMPLETED', {
        source: 'QRScannerScreen',
        queued: false,
      });
      navigation.navigate('Friends', {
        initialFriendsSubTab: 'sent',
        initialSection: 'friends-list',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not process QR invite.';
      trackObservabilityEvent('FRIEND_REQUEST_SEND_FAILED', {
        source: 'QRScannerScreen',
        entryMethod: 'qr_scan',
        errorMessage: message,
        errorType: error instanceof Error ? error.name : 'unknown_error',
      });
      trackObservabilityEvent('QR_SCAN_SUBMIT_FAILED', {
        errorMessage: message,
        errorType: error instanceof Error ? error.name : 'unknown_error',
        source: 'QRScannerScreen',
      });
      setErrorMessage(message);
      setHasScanned(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBarcodeScanned = async ({ data }: { data: string }) => {
    if (scanLockRef.current) {
      return;
    }

    scanLockRef.current = true;
    const normalizedCode = extractFriendCodeFromQrPayload(data);
    if (!normalizedCode) {
      trackObservabilityEvent('QR_SCAN_INVALID_CODE', {
        source: 'QRScannerScreen',
      });
      setErrorMessage('That QR code is not a Yummy Recs friend invite.');
      queueInvalidScanRetry();
      return;
    }

    trackObservabilityEvent('QR_SCAN_CODE_DETECTED', {
      source: 'QRScannerScreen',
    });
    setScannedCode(normalizedCode);
    setErrorMessage(null);
    setHasScanned(true);
    await handleScanResult(normalizedCode);
  };

  return (
    <FeatureDetailScreenScaffold
      bodyStyle={styles.body}
      contentBackgroundTone="muted"
      keyboardAware
      onBackPress={handleBackPress}
      scroll={false}
      title="QR Invite Scanner"
    >
      {isCameraGranted ? (
        <View style={styles.cameraSection}>
          <PageErrorToast errorMessage={errorMessage} title="Scan failed" />

          <View style={styles.camera}>
            <CameraView
              autofocus="on"
              barcodeScannerSettings={{
                barcodeTypes: ['qr'],
              }}
              enableTorch={isTorchEnabled}
              facing="back"
              onBarcodeScanned={!hasScanned && !isSubmitting ? handleBarcodeScanned : undefined}
              style={styles.camera}
              zoom={QR_SCAN_ZOOM}
            />
            <View pointerEvents="box-none" style={styles.overlay}>
              <View style={styles.overlayTopCard}>
                <View style={styles.overlayTopHeader}>
                  <Text style={styles.overlayTitle} variant="sectionTitleTight">Scan friend QR code</Text>
                  <Pressable
                    accessibilityLabel={isTorchEnabled ? 'Turn scanner light off' : 'Turn scanner light on'}
                    accessibilityRole="button"
                    onPress={() => setIsTorchEnabled((currentValue) => !currentValue)}
                    style={({ pressed }) => [
                      styles.torchButton,
                      isTorchEnabled && styles.torchButtonActive,
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <Ionicons
                      color={isTorchEnabled ? theme.colors.text.info : theme.colors.text.secondary}
                      name={isTorchEnabled ? 'flashlight' : 'flashlight-outline'}
                      size={18}
                    />
                  </Pressable>
                </View>
                <Text style={styles.overlayText}>
                  Hold the QR inside the square and move closer if it stays blurry. A valid invite sends automatically.
                </Text>
              </View>

              <View pointerEvents="none" style={styles.scanWindowWrap}>
                <View style={styles.scanWindow} />
              </View>

              {isSubmitting || hasScanned ? (
                <View style={styles.overlayBottomCard}>
                  <View style={styles.statusRow}>
                    {isSubmitting ? <ActivityIndicator color={theme.colors.text.brand} size="small" /> : null}
                    <Text style={styles.statusText}>
                      {isSubmitting
                        ? `Sending request for ${scannedCode}...`
                        : hasScanned && scannedCode
                          ? `Detected invite code ${scannedCode}.`
                          : 'Scan paused. Try another QR code.'}
                    </Text>
                  </View>
                  {hasScanned && !isSubmitting ? (
                    <Button
                      label="Scan Again"
                      onPress={resetScanner}
                      variant="secondary"
                    />
                  ) : null}
                </View>
              ) : null}
            </View>
          </View>
        </View>
      ) : (
        <Card style={styles.permissionCard} tone="warning">
          <Text tone="warning" variant="label">Camera permission required</Text>
          <Text tone="warning">
            Allow camera access to scan friend QR codes on this device.
          </Text>
          <Button
            label="Allow Camera Access"
            onPress={() => {
              void requestCameraPermission();
            }}
          />
          {cameraPermission && !cameraPermission.canAskAgain ? (
            <Text tone="warning">
              Camera access is blocked. Enable it in iOS/Android settings.
            </Text>
          ) : null}
        </Card>
      )}
    </FeatureDetailScreenScaffold>
  );
}
