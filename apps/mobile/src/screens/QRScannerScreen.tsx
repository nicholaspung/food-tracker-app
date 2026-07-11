import { Ionicons } from '../ui/AppIcon';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

import { FeatureDetailScreenScaffold } from '../components/shared';
import { getPlatformPointerEventsProps, getPlatformPointerEventsStyle } from '../lib/platformPointerEvents';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { createThemedStyles, useTheme } from '../theme';
import { Button, Card, Text } from '../ui';
import { PageErrorToast } from '../components/shared/PageErrorToast';
import { useFriendInviteQrFlow } from './friends/useFriendInviteQrFlow';

type QRScannerScreenProps = NativeStackScreenProps<RootStackParamList, 'QRScanner'>;

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
    ...StyleSheet.absoluteFill,
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
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [isTorchEnabled, setIsTorchEnabled] = useState(false);

  const handleBackPress = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    navigation.navigate('Friends');
  };

  const isCameraGranted = cameraPermission?.granted === true;
  const isCameraBlocked = cameraPermission && !cameraPermission.canAskAgain;
  const handleRequestComplete = useCallback(() => {
    navigation.navigate('Friends', {
      initialFriendsSubTab: 'sent',
      initialSection: 'friends-list',
    });
  }, [navigation]);
  const qrFlow = useFriendInviteQrFlow({
    onComplete: handleRequestComplete,
    source: 'QRScannerScreen',
  });

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
          <PageErrorToast errorMessage={qrFlow.errorMessage} title="Scan failed" />

          <View style={styles.camera}>
            <CameraView
              autofocus="on"
              barcodeScannerSettings={{
                barcodeTypes: ['qr'],
              }}
              enableTorch={isTorchEnabled}
              facing="back"
              onBarcodeScanned={!qrFlow.hasScanned && !qrFlow.isSubmitting ? qrFlow.handleBarcodeScanned : undefined}
              style={styles.camera}
              zoom={QR_SCAN_ZOOM}
            />
            <View
              {...getPlatformPointerEventsProps('box-none')}
              style={[styles.overlay, getPlatformPointerEventsStyle('box-none')]}
            >
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

              <View
                {...getPlatformPointerEventsProps('none')}
                style={[styles.scanWindowWrap, getPlatformPointerEventsStyle('none')]}
              >
                <View style={styles.scanWindow} />
              </View>

              {qrFlow.isSubmitting || qrFlow.hasScanned ? (
                <View style={styles.overlayBottomCard}>
                  <View style={styles.statusRow}>
                    {qrFlow.isSubmitting ? <ActivityIndicator color={theme.colors.text.brand} size="small" /> : null}
                    <Text style={styles.statusText}>
                      {qrFlow.isSubmitting
                        ? `Sending request for ${qrFlow.scannedCode}...`
                        : qrFlow.hasScanned && qrFlow.scannedCode
                          ? `Detected invite code ${qrFlow.scannedCode}.`
                          : 'Scan paused. Try another QR code.'}
                    </Text>
                  </View>
                  {qrFlow.hasScanned && !qrFlow.isSubmitting ? (
                    <Button
                      label="Scan Again"
                      onPress={qrFlow.resetScanner}
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
          <Text tone="warning" variant="label">
            {isCameraBlocked ? 'Camera access is off' : 'Camera needed for QR scanning'}
          </Text>
          <Text tone="warning">
            {isCameraBlocked
              ? 'Turn on camera access in device settings to scan friend QR codes.'
              : 'Yummy Recs uses the camera to scan friend QR codes on this device.'}
          </Text>
          <Button
            label={isCameraBlocked ? 'Open Settings' : 'Continue'}
            onPress={() => {
              if (isCameraBlocked) {
                void Linking.openSettings();
                return;
              }

              void requestCameraPermission();
            }}
          />
        </Card>
      )}
    </FeatureDetailScreenScaffold>
  );
}
