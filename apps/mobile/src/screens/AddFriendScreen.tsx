import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, View } from 'react-native';

import { FeatureFormScreenScaffold, PageErrorToast, SegmentedControl } from '../components/shared';
import type { SegmentedControlOption } from '../components/shared';
import {
  resolveOwnFriendCode,
  sanitizeFriendCode,
  useFriendWrites,
  validateFriendRequestCode,
} from '../features';
import { getPlatformPointerEventsProps, getPlatformPointerEventsStyle } from '../lib/platformPointerEvents';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { trackProductEvent } from '../observability/productAnalytics';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { createThemedStyles, useTheme } from '../theme';
import { Ionicons } from '../ui/AppIcon';
import { Button, Card, Input, Text } from '../ui';
import { useFriendInviteQrFlow } from './friends/useFriendInviteQrFlow';

type AddFriendScreenProps = NativeStackScreenProps<RootStackParamList, 'AddFriend'>;
type AddFriendMethodTab = 'friend-code' | 'scan-qr';

const ADD_FRIEND_METHOD_OPTIONS: readonly SegmentedControlOption<AddFriendMethodTab>[] = [
  { label: 'Friend Code', value: 'friend-code' },
  { label: 'Scan QR', value: 'scan-qr' },
];

const QR_SCAN_ZOOM = 0.08;

const useStyles = createThemedStyles((theme) => ({
  body: {
    gap: theme.spacing.md,
  },
  formCard: {
    gap: theme.spacing.sm,
  },
  helperCard: {
    gap: theme.spacing.xs,
  },
  scannerBody: {
    flexGrow: 1,
  },
  cameraSection: {
    backgroundColor: theme.colors.background.surface,
    borderColor: theme.colors.border.default,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    minHeight: 440,
    overflow: 'hidden',
  },
  camera: {
    flex: 1,
    minHeight: 440,
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

export function AddFriendScreen({ navigation }: AddFriendScreenProps) {
  const theme = useTheme();
  const styles = useStyles();
  const friendWrites = useFriendWrites();
  const { user } = useAuth();
  const { isOnline } = useConnectivity();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [activeTab, setActiveTab] = useState<AddFriendMethodTab>('friend-code');
  const [friendCode, setFriendCode] = useState('');
  const [manualErrorMessage, setManualErrorMessage] = useState<string | null>(null);
  const [isManualSubmitting, setIsManualSubmitting] = useState(false);
  const [isTorchEnabled, setIsTorchEnabled] = useState(false);

  const myFriendCode = useMemo(
    () => resolveOwnFriendCode(user?.id, user?.friendCode),
    [user?.friendCode, user?.id],
  );

  const handleBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    navigation.navigate('Friends');
  };

  const handleRequestComplete = useCallback(() => {
    navigation.navigate('Friends', {
      initialFriendsSubTab: 'sent',
      initialSection: 'friends-list',
    });
  }, [navigation]);
  const qrFlow = useFriendInviteQrFlow({
    onComplete: handleRequestComplete,
    source: 'AddFriendScreen',
  });

  const handleTabChange = (nextTab: AddFriendMethodTab) => {
    setActiveTab(nextTab);
    setManualErrorMessage(null);

    trackObservabilityEvent('ADD_FRIEND_METHOD_TAB_CHANGED', {
      source: 'AddFriendScreen',
      method: nextTab,
    });

    if (nextTab === 'scan-qr') {
      trackObservabilityEvent('ADD_FRIEND_SCAN_QR_TAPPED', {
        source: 'AddFriendScreen',
      });
      qrFlow.resetScanner();
    }
  };

  const handleSubmit = async () => {
    if (isManualSubmitting || qrFlow.isSubmitting) {
      return;
    }

    const validationResult = validateFriendRequestCode({
      code: friendCode,
      entryMethod: 'manual_code',
      ownFriendCode: myFriendCode,
    });

    if (!validationResult.ok) {
      trackObservabilityEvent('FRIEND_REQUEST_SEND_VALIDATION_FAILED', {
        source: 'AddFriendScreen',
        entryMethod: 'manual_code',
        reason: validationResult.reason,
        isOnline,
      });
      setManualErrorMessage(validationResult.message);
      return;
    }

    setManualErrorMessage(null);
    trackObservabilityEvent('FRIEND_REQUEST_SEND_STARTED', {
      source: 'AddFriendScreen',
      entryMethod: 'manual_code',
      codeLength: validationResult.code.length,
      isOnline,
    });
    setIsManualSubmitting(true);

    try {
      const requestResult = await friendWrites.sendFriendRequest({
        code: validationResult.code,
        entryMethod: 'manual_code',
      });

      if (requestResult.status === 'queued') {
        trackObservabilityEvent('FRIEND_REQUEST_SEND_SUCCEEDED', {
          source: 'AddFriendScreen',
          entryMethod: 'manual_code',
          queued: true,
        });
        trackProductEvent('social.friend_request_sent', {
          source: 'AddFriendScreen',
          entryMethod: 'manual_code',
          queued: true,
        });
        handleRequestComplete();
        return;
      }

      trackObservabilityEvent('FRIEND_REQUEST_SEND_SUCCEEDED', {
        source: 'AddFriendScreen',
        entryMethod: 'manual_code',
        queued: false,
      });
      trackProductEvent('social.friend_request_sent', {
        source: 'AddFriendScreen',
        entryMethod: 'manual_code',
        queued: false,
      });
      handleRequestComplete();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not send friend request.';
      trackObservabilityEvent('FRIEND_REQUEST_SEND_FAILED', {
        source: 'AddFriendScreen',
        entryMethod: 'manual_code',
        errorMessage: message,
        errorType: error instanceof Error ? error.name : 'unknown_error',
        isOnline,
      });
      setManualErrorMessage(message);
    } finally {
      setIsManualSubmitting(false);
    }
  };
  const canSubmit = friendCode.length === 8 && !isManualSubmitting && !qrFlow.isSubmitting;
  const isCameraGranted = cameraPermission?.granted === true;
  const isCameraBlocked = cameraPermission && !cameraPermission.canAskAgain;

  return (
    <FeatureFormScreenScaffold
      keyboardAware
      bodyStyle={activeTab === 'scan-qr' ? styles.scannerBody : undefined}
      headerBottomContent={
        <SegmentedControl
          onChange={handleTabChange}
          options={ADD_FRIEND_METHOD_OPTIONS}
          value={activeTab}
        />
      }
      headerBottomCompact
      onBackPress={handleBack}
      primaryAction={
        activeTab === 'friend-code'
          ? {
              disabled: !canSubmit,
              label: 'Send Request',
              loading: isManualSubmitting,
              onPress: () => {
                void handleSubmit();
              },
            }
          : undefined
      }
      subtitle="Type a friend code or scan a QR invite."
      testID="add-friend-screen"
      title="Add Friend"
    >
      {activeTab === 'friend-code' ? (
        <View style={styles.body}>
          <PageErrorToast errorMessage={manualErrorMessage} title="Could not send friend request" />

          <Card style={styles.formCard}>
            <Input
              autoCapitalize="characters"
              autoCorrect={false}
              keyboardType="ascii-capable"
              label="Friend Code"
              maxLength={8}
              onChangeText={(value) => {
                setManualErrorMessage(null);
                setFriendCode(sanitizeFriendCode(value));
              }}
              placeholder="Enter 8-character code"
              value={friendCode}
            />
          </Card>

          <Card style={styles.helperCard}>
            <Text variant="label">Need a code?</Text>
            <Text tone="secondary">
              Ask your friend to open the Friends tab and share their 8-character friend code.
            </Text>
          </Card>
        </View>
      ) : isCameraGranted ? (
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
                  Hold the QR inside the square. A valid invite sends automatically.
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
        <View style={styles.body}>
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

          <Card style={styles.helperCard}>
            <Text variant="label">Need a QR invite?</Text>
            <Text tone="secondary">
              Ask your friend to open the Friends tab and show their QR invite.
            </Text>
          </Card>
        </View>
      )}
    </FeatureFormScreenScaffold>
  );
}
