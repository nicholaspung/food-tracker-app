import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Animated, Easing, Linking, View } from 'react-native';

import {
  FeatureFormScreenScaffold,
  LinearProgressBar,
  PageErrorToast,
  PhotoSourcePickerCard,
} from '../components/shared';
import { useMenuScanFlow, useMonthlyUsage } from '../features';
import {
  type MenuScanPhase,
  type PhotoProcessingScreenProps,
} from './photoProcessing/shared';
import { createThemedStyles, useTheme } from '../theme';
import { Button, Card, Text } from '../ui';

const PROCESSING_PROGRESS_CAP = 0.94;
const PROCESSING_PROGRESS_INTERVAL_MS = 500;

function getNextProcessingProgress(currentValue: number): number {
  if (currentValue < 0.35) {
    return Number(Math.min(0.35, currentValue + 0.07).toFixed(3));
  }

  const remainingProgress = PROCESSING_PROGRESS_CAP - currentValue;
  if (remainingProgress <= 0.004) {
    return PROCESSING_PROGRESS_CAP;
  }

  return Number(
    Math.min(
      PROCESSING_PROGRESS_CAP,
      currentValue + Math.max(0.004, remainingProgress * 0.12),
    ).toFixed(3),
  );
}

function formatElapsedSeconds(elapsedMs: number): string {
  return `${Math.max(0, Math.floor(elapsedMs / 1000))}s elapsed`;
}

const useStyles = createThemedStyles((theme) => ({
  chooseCard: {
    gap: theme.spacing.sm,
  },
  tipCard: {
    backgroundColor: theme.colors.status.infoBg,
    borderColor: theme.colors.status.infoBorder,
    borderWidth: 1,
    gap: theme.spacing.xs,
  },
  processingCard: {
    gap: theme.spacing.sm,
  },
  processingHint: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  processingMotionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  processingSpinner: {
    alignItems: 'center',
    backgroundColor: theme.colors.status.infoBg,
    borderColor: theme.colors.status.infoBorder,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  processingTextBlock: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  successCard: {
    borderColor: theme.colors.status.successBorder,
    borderWidth: 1,
    gap: theme.spacing.sm,
  },
  addedItemRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  footerButton: {
    marginTop: theme.spacing.sm,
  },
  errorCard: {
    borderColor: theme.colors.status.dangerBorder,
    borderWidth: 1,
    gap: theme.spacing.sm,
  },
  errorActionsRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  errorAction: {
    flex: 1,
  },
}));

export function MenuScanPhotoProcessingScreen({
  navigation,
  route,
}: PhotoProcessingScreenProps) {
  const theme = useTheme();
  const styles = useStyles();

  const mode = route.params?.mode ?? 'general';
  const restaurantId = route.params?.restaurantId;
  const restaurantName = route.params?.restaurantName?.trim() ?? 'this restaurant';
  const returnTo = route.params?.returnTo;
  const returnToRestaurantDiscoveryRestaurantParams =
    route.params?.returnToRestaurantDiscoveryRestaurantParams;
  const sourceNoteId = route.params?.sourceNoteId;
  const tastingSessionId = route.params?.tastingSessionId;
  const autoStartSourcePicker = route.params?.autoStartSourcePicker === true;
  const isMenuScan = mode === 'menu_scan' && Boolean(restaurantId);

  const [progressValue, setProgressValue] = useState(0);
  const [processingElapsedMs, setProcessingElapsedMs] = useState(0);
  const [countdownValue, setCountdownValue] = useState(5);
  const processingSpinValue = useRef(new Animated.Value(0)).current;
  const autoPromptedRef = useRef(false);
  const hasTriggeredCountdownNavigationRef = useRef(false);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const monthlyUsage = useMonthlyUsage();

  const navigateBackToItems = useCallback(() => {
    if (!restaurantId) {
      navigation.goBack();
      return;
    }

    if (returnTo === 'TastingSessionPlanning' && tastingSessionId) {
      navigation.popTo('TastingSessionPlanning', {
        sessionId: tastingSessionId,
      });
      return;
    }

    if (returnTo === 'RestaurantDiscoveryRestaurant') {
      navigation.popTo('RestaurantDiscoveryRestaurant', {
        ...(returnToRestaurantDiscoveryRestaurantParams ?? {
          restaurantId,
          restaurantName,
        }),
      });
      return;
    }

    navigation.popTo('CreateVisit', {
      preselectedRestaurantId: restaurantId,
      preselectedRestaurantName: restaurantName,
      returnToStep: 1,
      sourceNoteId,
    });
  }, [
    navigation,
    restaurantId,
    restaurantName,
    returnTo,
    returnToRestaurantDiscoveryRestaurantParams,
    sourceNoteId,
    tastingSessionId,
  ]);

  const startCountdown = useCallback(() => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
    }

    setCountdownValue(5);
    hasTriggeredCountdownNavigationRef.current = false;
    countdownIntervalRef.current = setInterval(() => {
      setCountdownValue((currentValue) => {
        if (currentValue <= 1) {
          if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
          }
          return 0;
        }

        return currentValue - 1;
      });
    }, 1000);
  }, []);

  const menuScanFlow = useMenuScanFlow({
    analyticsSource:
      returnTo === 'RestaurantDiscoveryRestaurant'
        ? 'FoodDiscoveryRestaurant'
        : 'CreateVisitMenuScan',
    restaurantId: restaurantId ?? '',
    restaurantName,
    onSuccess: startCountdown,
  });

  const phase: MenuScanPhase =
    menuScanFlow.status === 'processing'
      ? 'processing'
      : menuScanFlow.status === 'success'
        ? 'success'
        : menuScanFlow.status === 'error'
          ? 'error'
          : 'choose';

  useEffect(() => {
    if (menuScanFlow.status === 'processing') {
      setProgressValue(0.04);
      setProcessingElapsedMs(0);
      processingSpinValue.setValue(0);
      const spinAnimation = Animated.loop(
        Animated.timing(processingSpinValue, {
          duration: 1200,
          easing: Easing.linear,
          toValue: 1,
          useNativeDriver: true,
        }),
      );
      spinAnimation.start();
      const progressInterval = setInterval(() => {
        setProcessingElapsedMs((currentValue) => currentValue + PROCESSING_PROGRESS_INTERVAL_MS);
        setProgressValue(getNextProcessingProgress);
      }, PROCESSING_PROGRESS_INTERVAL_MS);

      return () => {
        spinAnimation.stop();
        clearInterval(progressInterval);
      };
    }

    if (menuScanFlow.status === 'success') {
      setProgressValue(1);
      setProcessingElapsedMs(0);
    }

    return undefined;
  }, [menuScanFlow.status, processingSpinValue]);

  useEffect(() => {
    if (
      !isMenuScan ||
      !autoStartSourcePicker ||
      autoPromptedRef.current ||
      phase !== 'choose'
    ) {
      return;
    }

    autoPromptedRef.current = true;
    Alert.alert('Scan Menu Photo', 'Choose how you want to add your menu photo.', [
      {
        text: 'Take Photo',
        onPress: () => {
          void menuScanFlow.scanMenu('camera');
        },
      },
      {
        text: 'Upload Image',
        onPress: () => {
          void menuScanFlow.scanMenu('gallery');
        },
      },
      {
        text: 'Cancel',
        style: 'cancel',
      },
    ]);
  }, [autoStartSourcePicker, isMenuScan, menuScanFlow, phase]);

  useEffect(() => {
    if (
      phase !== 'success' ||
      countdownValue !== 0 ||
      hasTriggeredCountdownNavigationRef.current
    ) {
      return;
    }

    hasTriggeredCountdownNavigationRef.current = true;
    navigateBackToItems();
  }, [countdownValue, navigateBackToItems, phase]);

  useEffect(() => {
    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, []);

  if (!isMenuScan) {
    return (
      <FeatureFormScreenScaffold
        onBackPress={() => {
          navigation.goBack();
        }}
        primaryAction={{
          label: 'Back',
          onPress: () => {
            navigation.goBack();
          },
        }}
        subtitle="This route is reserved for the menu scanning flow."
        title="Process Photos"
      >
        <Card>
          <Text tone="secondary">
            Use “Scan Menu Photo” from Track Restaurant Visit to continue.
          </Text>
        </Card>
      </FeatureFormScreenScaffold>
    );
  }

  const menuScanTitle =
    phase === 'processing'
      ? 'Processing Menu Photo'
      : phase === 'success'
        ? 'Menu Scan Complete'
        : 'Scan Menu Photo';
  const menuScanSubtitle =
    phase === 'processing'
      ? 'Extracting menu items from your uploaded image.'
        : phase === 'success'
        ? menuScanFlow.createdItemNames.length > 0
          ? 'New items were added to this restaurant.'
          : 'Existing menu items were matched for this restaurant.'
        : `Capture or upload a menu image for ${restaurantName}.`;
  const processingPercent = Math.round(progressValue * 100);
  const processingSpin = processingSpinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });
  const processingDetail =
    processingElapsedMs >= 12000
      ? 'Still working. Detailed menus can take a little longer.'
      : progressValue >= 0.72
        ? 'Reading item names and matching them to this restaurant.'
        : 'Uploading and preparing your image.';
  const menuScanUsageText = monthlyUsage.snapshot
    ? typeof monthlyUsage.snapshot.limits.menuScansMonthly === 'number'
      ? `${Math.max(
          monthlyUsage.snapshot.limits.menuScansMonthly - monthlyUsage.snapshot.usage.menuScans,
          0,
        )} of ${monthlyUsage.snapshot.limits.menuScansMonthly} monthly menu scans left.`
      : 'Monthly menu scans are unlimited for this account.'
    : monthlyUsage.isLoading
      ? 'Checking monthly menu scan usage...'
      : 'Free accounts include 25 menu scans per month. Subscribers include 100.';
  const shouldShowSourcePicker =
    phase === 'choose' ||
    (phase === 'error' && !menuScanFlow.permissionNeedsSettings);

  return (
    <FeatureFormScreenScaffold
      onBackPress={() => {
        navigateBackToItems();
      }}
      primaryAction={{
        label: phase === 'processing' ? 'Processing...' : 'Back to Menu Items',
        disabled: phase === 'processing',
        variant: 'secondary',
        onPress: () => {
          navigateBackToItems();
        },
      }}
      subtitle={menuScanSubtitle}
      title={menuScanTitle}
    >
      {shouldShowSourcePicker ? (
        <>
          <Card style={styles.tipCard}>
            <Text tone="info" variant="bodySm">
              Tip: clear, well-lit menu photos produce better item extraction.
            </Text>
            <Text tone="info" variant="bodySm">
              {menuScanUsageText}
            </Text>
            <Text tone="info" variant="bodySm">
              Failed scans still count toward your monthly limit.
            </Text>
          </Card>

          <PhotoSourcePickerCard
            cardStyle={styles.chooseCard}
            description="Take a new photo or upload an existing menu image."
            isSelecting={menuScanFlow.status === 'selecting'}
            onCameraPress={() => {
              void menuScanFlow.scanMenu('camera');
            }}
            onGalleryPress={() => {
              void menuScanFlow.scanMenu('gallery');
            }}
          />
        </>
      ) : null}

      {phase === 'processing' ? (
        <Card style={styles.processingCard}>
          <View style={styles.processingMotionRow}>
            <Animated.View
              style={[
                styles.processingSpinner,
                {
                  transform: [{ rotate: processingSpin }],
                },
              ]}
            >
              <Ionicons color={theme.colors.text.info} name="sync-outline" size={22} />
            </Animated.View>
            <View style={styles.processingTextBlock}>
              <Text tone="secondary">We're processing your image now.</Text>
              <Text tone="secondary" variant="bodySm">
                {formatElapsedSeconds(processingElapsedMs)}
              </Text>
            </View>
          </View>
          <Text variant="label">Processing "{menuScanFlow.selectedImageName}"</Text>
          <LinearProgressBar progress={progressValue} />
          <Text tone="secondary">
            {processingPercent}% complete. {processingDetail}
          </Text>
        </Card>
      ) : null}

      {phase === 'success' ? (
        <Card style={styles.successCard}>
          <View style={styles.processingHint}>
            <Ionicons
              color={theme.colors.text.success}
              name="checkmark-circle"
              size={18}
            />
            <Text tone="success" variant="label">
              Menu scan completed
            </Text>
          </View>
          {menuScanFlow.createdItemNames.length > 0 ? (
            <>
              <Text tone="secondary">Added items:</Text>
              {menuScanFlow.createdItemNames.map((itemName) => (
                <View key={itemName} style={styles.addedItemRow}>
                  <Ionicons
                    color={theme.colors.text.success}
                    name="checkmark-outline"
                    size={14}
                  />
                  <Text>{itemName}</Text>
                </View>
              ))}
            </>
          ) : null}
          {menuScanFlow.existingItemNames.length > 0 ? (
            <>
              <Text tone="secondary">
                {menuScanFlow.createdItemNames.length > 0 ? 'Already on this menu:' : 'Matched items:'}
              </Text>
              {menuScanFlow.existingItemNames.map((itemName) => (
                <View key={itemName} style={styles.addedItemRow}>
                  <Ionicons
                    color={theme.colors.text.info}
                    name="checkmark-done-outline"
                    size={14}
                  />
                  <Text>{itemName}</Text>
                </View>
              ))}
            </>
          ) : null}
          <Text tone="secondary">
            Returning to menu items in {countdownValue} second
            {countdownValue === 1 ? '' : 's'}...
          </Text>
          <Button
            label="Go to Menu Items Now"
            onPress={() => {
              navigateBackToItems();
            }}
            style={styles.footerButton}
          />
        </Card>
      ) : null}

      <PageErrorToast
        actionLabel="Try Again"
        errorMessage={
          phase === 'error' ? menuScanFlow.errorMessage ?? 'Could not process this photo.' : null
        }
        onAction={() => {
          menuScanFlow.reset();
          void menuScanFlow.scanMenu(menuScanFlow.lastRequestedSource);
        }}
        title="Menu scan failed"
      />
      <PageErrorToast
        errorMessage={
          phase === 'choose' && menuScanFlow.errorMessage ? menuScanFlow.errorMessage : null
        }
        title="Menu scan failed"
      />

      {phase === 'error' && menuScanFlow.permissionNeedsSettings ? (
        <Card style={styles.errorCard}>
          <Text tone="danger">
            Camera or photo library permission is blocked in settings.
          </Text>
          <View style={styles.errorActionsRow}>
            <Button
              label="Open Settings"
              onPress={() => {
                void Linking.openSettings();
              }}
              style={styles.errorAction}
              variant="secondary"
            />
          </View>
        </Card>
      ) : null}
    </FeatureFormScreenScaffold>
  );
}
