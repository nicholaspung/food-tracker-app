import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { CameraView, useCameraPermissions } from 'expo-camera';

import { ErrorState, FeatureDetailScreenScaffold } from '../components/shared';
import { inviteFriend } from '../features';
import { useQueuedWrite } from '../features/store/useQueuedWrite';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useTheme } from '../theme';
import { Button, Card, Input, Text } from '../ui';

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

export function QRScannerScreen({ navigation }: QRScannerScreenProps) {
  const theme = useTheme();
  const queueWrite = useQueuedWrite();
  const queryClient = useQueryClient();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

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
    cameraFrame: {
      minHeight: 280,
      overflow: 'hidden',
      borderRadius: theme.radii.md,
      borderWidth: 1,
      borderColor: theme.colors.border.default,
      backgroundColor: theme.colors.background.muted,
    },
    camera: {
      flex: 1,
      minHeight: 280,
    },
    scanOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scanWindow: {
      width: 190,
      height: 190,
      borderRadius: theme.radii.md,
      borderWidth: 2,
      borderColor: theme.colors.border.info,
      backgroundColor: 'transparent',
    },
    scannerActions: {
      marginTop: theme.spacing.xs,
      flexDirection: 'row',
      gap: theme.spacing.xs,
    },
    scannerAction: {
      flex: 1,
    },
    submitAction: {
      marginTop: theme.spacing.xxs,
    },
  });

  const isCameraGranted = cameraPermission?.granted === true;

  const handleBarcodeScanned = ({ data }: { data: string }) => {
    const normalizedCode = extractFriendCodeFromPayload(data);
    if (!normalizedCode) {
      setErrorMessage('QR code did not contain a valid 8-character friend code.');
      setHasScanned(true);
      return;
    }

    setScannedCode(normalizedCode);
    setErrorMessage(null);
    setHasScanned(true);
  };

  const handleScanResult = async () => {
    const normalizedCode = sanitizeFriendCode(scannedCode);
    if (normalizedCode.length !== 8) {
      setErrorMessage('Friend code must be 8 characters.');
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      await queueWrite('friend.qr.scan');
      await inviteFriend({
        code: normalizedCode,
      });

      await queryClient.invalidateQueries({ queryKey: ['feature', 'friends'] });
      navigation.navigate('Friends');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not process QR invite.';
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <FeatureDetailScreenScaffold
      keyboardAware
      onBackPress={handleBackPress}
      title="QR Invite Scanner"
    >
      {isCameraGranted ? (
        <Card>
          <Text variant="label">Scan friend QR code</Text>
          <Text tone="secondary">Align the code within the frame to auto-fill a friend code.</Text>
          <View style={styles.cameraFrame}>
            <CameraView
              barcodeScannerSettings={{
                barcodeTypes: ['qr'],
              }}
              facing="back"
              onBarcodeScanned={!hasScanned && !isSubmitting ? handleBarcodeScanned : undefined}
              style={styles.camera}
            />
            <View pointerEvents="none" style={styles.scanOverlay}>
              <View style={styles.scanWindow} />
            </View>
          </View>
          <Text tone="secondary">
            {hasScanned
              ? 'QR code captured. Tap Scan Again to read another code.'
              : 'Scanner is active and ready.'}
          </Text>
          <View style={styles.scannerActions}>
            <Button
              disabled={!hasScanned || isSubmitting}
              label="Scan Again"
              onPress={() => {
                setHasScanned(false);
                setErrorMessage(null);
              }}
              style={styles.scannerAction}
              variant="secondary"
            />
          </View>
        </Card>
      ) : (
        <Card tone="warning">
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

      <Input
        autoCapitalize="characters"
        autoCorrect={false}
        keyboardType="ascii-capable"
        label="Scanned invite code"
        maxLength={8}
        onChangeText={(value) => {
          setScannedCode(sanitizeFriendCode(value));
          setHasScanned(false);
        }}
        placeholder="Enter 8-character code"
        value={scannedCode}
      />

      {errorMessage ? <ErrorState description={errorMessage} title="Scan failed" /> : null}

      <Button
        disabled={scannedCode.length !== 8 || isSubmitting}
        label={isSubmitting ? 'Sending...' : 'Send Request'}
        onPress={() => {
          void handleScanResult();
        }}
        style={styles.submitAction}
      />
    </FeatureDetailScreenScaffold>
  );
}
