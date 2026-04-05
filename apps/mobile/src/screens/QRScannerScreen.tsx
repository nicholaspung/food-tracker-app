import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { CameraView, useCameraPermissions } from 'expo-camera';

import { FeatureDetailScreenScaffold } from '../components/shared';
import { inviteFriend } from '../features';
import { useFeatureOutboxQueue } from '../features/store/useFeatureOutboxQueue';
import { useQueuedWrite } from '../features/store/useQueuedWrite';
import { showQueuedOfflineAlert } from '../lib/offlineAlerts';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { useTheme } from '../theme';
import { Button, Card, Text } from '../ui';
import { PageErrorToast } from '../components/shared/PageErrorToast';

type QRScannerScreenProps = NativeStackScreenProps<RootStackParamList, 'QRScanner'>;

function sanitizeFriendCode(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 8);
}

function extractFriendCodeFromPayload(payload: string): string | null {
  const trimmedPayload = payload.trim();
  if (!trimmedPayload) {
    return null;
  }

  let candidate = trimmedPayload;

  try {
    const parsed = new URL(trimmedPayload);
    candidate =
      parsed.searchParams.get('friendCode') ??
      parsed.searchParams.get('code') ??
      parsed.pathname.split('/').pop() ??
      trimmedPayload;
  } catch {
    // Payload might not be a URL; in that case we treat it as a raw friend code.
  }

  const normalized = sanitizeFriendCode(candidate);
  return normalized.length === 8 ? normalized : null;
}

function generateFriendCode(userId: string | undefined): string {
  if (!userId) {
    return 'LOCAL000';
  }

  const cleanId = userId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return cleanId.slice(0, 8).padEnd(8, 'X');
}

export function QRScannerScreen({ navigation }: QRScannerScreenProps) {
  const theme = useTheme();
  const queueWrite = useQueuedWrite();
  const queueFeatureOutbox = useFeatureOutboxQueue();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { isOnline } = useConnectivity();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const scanLockRef = useRef(false);

  const [scannedCode, setScannedCode] = useState('');
  const [hasScanned, setHasScanned] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleBackPress = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    navigation.navigate('Friends');
  };

  const styles = StyleSheet.create({
    body: {
      flex: 1,
      gap: theme.spacing.md,
      paddingBottom: theme.spacing.md,
      paddingHorizontal: theme.spacing.md,
      paddingTop: theme.spacing.sm,
    },
    cameraSection: {
      flex: 1,
      minHeight: 420,
      overflow: 'hidden',
      borderRadius: theme.radii.lg,
      borderWidth: 1,
      borderColor: theme.colors.border.default,
      backgroundColor: theme.colors.background.surface,
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
    scanWindowWrap: {
      alignItems: 'center',
      flex: 1,
      justifyContent: 'center',
    },
    scanWindow: {
      width: '72%',
      aspectRatio: 1,
      maxHeight: 300,
      maxWidth: 300,
      minHeight: 220,
      minWidth: 220,
      borderRadius: theme.radii.md,
      borderWidth: 3,
      borderColor: theme.colors.border.info,
      backgroundColor: 'transparent',
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
  });

  const isCameraGranted = cameraPermission?.granted === true;
  const myFriendCode = generateFriendCode(user?.id);

  const handleScanResult = async (inviteCode: string) => {
    const normalizedCode = sanitizeFriendCode(inviteCode);
    trackObservabilityEvent('QR_SCAN_SUBMIT_STARTED', {
      source: 'QRScannerScreen',
    });
    if (normalizedCode.length !== 8) {
      setErrorMessage('Friend code must be 8 characters.');
      setHasScanned(true);
      return;
    }

    if (normalizedCode === myFriendCode) {
      setErrorMessage('You cannot add yourself as a friend.');
      setHasScanned(true);
      return;
    }

    setErrorMessage(null);
    setScannedCode(normalizedCode);
    setIsSubmitting(true);

    try {
      if (!isOnline) {
        await queueFeatureOutbox('friend.request.send', {
          code: normalizedCode,
        });
        await queryClient.invalidateQueries({ queryKey: ['feature', 'friends'] });
        showQueuedOfflineAlert('Friend request');
        navigation.navigate('Friends', {
          initialFriendsSubTab: 'sent',
          initialSection: 'friends-list',
        });
        return;
      }

      await queueWrite('friend.qr.scan');
      await inviteFriend({
        code: normalizedCode,
      });

      await queryClient.invalidateQueries({ queryKey: ['feature', 'friends'] });
      trackObservabilityEvent('QR_SCAN_SUBMIT_COMPLETED', {
        source: 'QRScannerScreen',
      });
      navigation.navigate('Friends', {
        initialFriendsSubTab: 'sent',
        initialSection: 'friends-list',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not process QR invite.';
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

  const handleBarcodeScanned = ({ data }: { data: string }) => {
    if (scanLockRef.current) {
      return;
    }

    scanLockRef.current = true;
    const normalizedCode = extractFriendCodeFromPayload(data);
    if (!normalizedCode) {
      trackObservabilityEvent('QR_SCAN_INVALID_CODE', {
        source: 'QRScannerScreen',
      });
      setErrorMessage('QR code did not contain a valid 8-character friend code.');
      setHasScanned(true);
      return;
    }

    trackObservabilityEvent('QR_SCAN_CODE_DETECTED', {
      source: 'QRScannerScreen',
    });
    setScannedCode(normalizedCode);
    setErrorMessage(null);
    setHasScanned(true);
    void handleScanResult(normalizedCode);
  };

  return (
    <FeatureDetailScreenScaffold
      bodyStyle={styles.body}
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
              barcodeScannerSettings={{
                barcodeTypes: ['qr'],
              }}
              facing="back"
              onBarcodeScanned={!hasScanned && !isSubmitting ? handleBarcodeScanned : undefined}
              style={styles.camera}
            />
            <View pointerEvents="box-none" style={styles.overlay}>
              <View style={styles.overlayTopCard}>
                <Text style={styles.overlayTitle} variant="sectionTitleTight">Scan friend QR code</Text>
                <Text style={styles.overlayText}>
                  Point your camera at the invite QR. A valid code will be detected and sent automatically.
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
                      onPress={() => {
                        scanLockRef.current = false;
                        setHasScanned(false);
                        setScannedCode('');
                        setErrorMessage(null);
                      }}
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
