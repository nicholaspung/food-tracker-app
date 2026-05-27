import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Linking, View } from 'react-native';

import {
  FeatureFormScreenScaffold,
  LinearProgressBar,
  PageErrorToast,
  PhotoSourcePickerCard,
} from '../components/shared';
import { useMonthlyUsage, useReceiptScanFlow } from '../features';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { createThemedStyles, useTheme } from '../theme';
import { Button, Card, Text } from '../ui';

type ReceiptScanScreenProps = NativeStackScreenProps<RootStackParamList, 'ReceiptScan'>;

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

function formatDetectedCurrency(value: number | undefined): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? `$${value.toFixed(2)}`
    : 'Not found';
}

const useStyles = createThemedStyles((theme) => ({
  card: {
    gap: theme.spacing.sm,
  },
  tipCard: {
    backgroundColor: theme.colors.status.infoBg,
    borderColor: theme.colors.status.infoBorder,
    borderWidth: 1,
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
  successHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  itemRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
    justifyContent: 'space-between',
  },
  itemName: {
    flex: 1,
  },
  detectedTotalsPanel: {
    backgroundColor: theme.colors.background.muted,
    borderColor: theme.colors.border.subtle,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    gap: theme.spacing.xs,
    padding: theme.spacing.sm,
  },
  detectedTotalsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  errorActionsRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  errorAction: {
    flex: 1,
  },
}));

export function ReceiptScanScreen({ navigation, route }: ReceiptScanScreenProps) {
  const theme = useTheme();
  const styles = useStyles();
  const receiptScanFlow = useReceiptScanFlow();
  const monthlyUsage = useMonthlyUsage();
  const [progressValue, setProgressValue] = useState(0);
  const [processingElapsedMs, setProcessingElapsedMs] = useState(0);
  const processingSpinValue = useRef(new Animated.Value(0)).current;

  const phase =
    receiptScanFlow.status === 'processing'
      ? 'processing'
      : receiptScanFlow.status === 'success'
        ? 'success'
        : receiptScanFlow.status === 'error'
          ? 'error'
          : 'choose';

  useEffect(() => {
    if (receiptScanFlow.status === 'processing') {
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

    if (receiptScanFlow.status === 'success') {
      setProgressValue(1);
      setProcessingElapsedMs(0);
    }

    return undefined;
  }, [processingSpinValue, receiptScanFlow.status]);

  const returnToBillDraft = () => {
    const result = receiptScanFlow.result;
    if (!result) {
      navigation.goBack();
      return;
    }

    navigation.popTo('CreateBill', {
      billId: route.params?.billId,
      receiptScanResult: result,
    });
  };

  const title =
    phase === 'processing'
      ? 'Processing Receipt'
      : phase === 'success'
        ? 'Receipt Scan Complete'
        : 'Scan Receipt';
  const subtitle =
    phase === 'processing'
      ? 'Extracting receipt items and totals from your image.'
      : phase === 'success'
        ? 'Review the extracted items before assigning them.'
        : 'Capture or upload a receipt image to fill an itemized bill draft.';
  const processingPercent = Math.round(progressValue * 100);
  const processingSpin = processingSpinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });
  const usageText = monthlyUsage.snapshot
    ? typeof monthlyUsage.snapshot.limits.receiptScansMonthly === 'number'
      ? `${Math.max(
          monthlyUsage.snapshot.limits.receiptScansMonthly - monthlyUsage.snapshot.usage.receiptScans,
          0,
        )} of ${monthlyUsage.snapshot.limits.receiptScansMonthly} monthly receipt scans left.`
      : 'Monthly receipt scans are unlimited for this account.'
    : monthlyUsage.isLoading
      ? 'Checking monthly receipt scan usage...'
      : 'Free accounts include 25 receipt scans per month. Subscribers include 100.';

  return (
    <FeatureFormScreenScaffold
      onBackPress={() => {
        navigation.goBack();
      }}
      primaryAction={{
        label: phase === 'success' ? 'Apply to Bill Draft' : 'Back to Bill',
        disabled: phase === 'processing',
        variant: phase === 'success' ? 'primary' : 'secondary',
        onPress: () => {
          if (phase === 'success') {
            returnToBillDraft();
            return;
          }
          navigation.goBack();
        },
      }}
      subtitle={subtitle}
      title={title}
    >
      {phase === 'choose' ? (
        <>
          <Card style={styles.tipCard}>
            <Text tone="info" variant="bodySm">
              Tip: flat, well-lit receipt photos produce better item and total extraction.
            </Text>
            <Text tone="info" variant="bodySm">
              {usageText}
            </Text>
            <Text tone="info" variant="bodySm">
              Failed scans still count toward your monthly limit.
            </Text>
          </Card>

          <PhotoSourcePickerCard
            cardStyle={styles.card}
            description="Take a new photo or upload an existing receipt image."
            isSelecting={receiptScanFlow.status === 'selecting'}
            onCameraPress={() => {
              void receiptScanFlow.scanReceipt('camera');
            }}
            onGalleryPress={() => {
              void receiptScanFlow.scanReceipt('gallery');
            }}
          />
        </>
      ) : null}

      {phase === 'processing' ? (
        <Card style={styles.card}>
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
              <Text tone="secondary">We're processing your receipt now.</Text>
              <Text tone="secondary" variant="bodySm">
                {formatElapsedSeconds(processingElapsedMs)}
              </Text>
            </View>
          </View>
          <Text variant="label">Processing "{receiptScanFlow.selectedImageName}"</Text>
          <LinearProgressBar progress={progressValue} />
          <Text tone="secondary">
            {processingPercent}% complete. Reading item names, prices, tax, tip, and fees.
          </Text>
        </Card>
      ) : null}

      {phase === 'success' && receiptScanFlow.result ? (
        <Card style={styles.card}>
          <View style={styles.successHeader}>
            <Ionicons color={theme.colors.text.success} name="checkmark-circle" size={18} />
            <Text tone="success" variant="label">
              Receipt scan completed
            </Text>
          </View>
          <Text tone="secondary">
            {receiptScanFlow.result.items.length} item
            {receiptScanFlow.result.items.length === 1 ? '' : 's'} found. Items will start
            unassigned so you can choose who had each one.
          </Text>
          <View style={styles.detectedTotalsPanel}>
            <Text variant="label">Detected tax, fees, and tip</Text>
            <View style={styles.detectedTotalsRow}>
              <Text tone="secondary">Tax</Text>
              <Text variant="labelStrong">{formatDetectedCurrency(receiptScanFlow.result.tax)}</Text>
            </View>
            <View style={styles.detectedTotalsRow}>
              <Text tone="secondary">Fees</Text>
              <Text variant="labelStrong">{formatDetectedCurrency(receiptScanFlow.result.fees)}</Text>
            </View>
            <View style={styles.detectedTotalsRow}>
              <Text tone="secondary">Tip</Text>
              <Text variant="labelStrong">{formatDetectedCurrency(receiptScanFlow.result.tip)}</Text>
            </View>
          </View>
          {receiptScanFlow.result.items.slice(0, 8).map((item, index) => (
            <View key={`${item.name}-${index}`} style={styles.itemRow}>
              <Text numberOfLines={1} style={styles.itemName}>
                {item.name}
              </Text>
              <Text variant="labelStrong">${item.price.toFixed(2)}</Text>
            </View>
          ))}
          {receiptScanFlow.result.warnings.length > 0 ? (
            <Text tone="warning" variant="bodySm">
              {receiptScanFlow.result.warnings[0]}
            </Text>
          ) : null}
        </Card>
      ) : null}

      <PageErrorToast
        actionLabel="Try Again"
        errorMessage={
          phase === 'error' ? receiptScanFlow.errorMessage ?? 'Could not process this receipt.' : null
        }
        onAction={() => {
          receiptScanFlow.reset();
          void receiptScanFlow.scanReceipt(receiptScanFlow.lastRequestedSource);
        }}
        title="Receipt scan failed"
      />
      <PageErrorToast
        errorMessage={
          phase === 'choose' && receiptScanFlow.errorMessage ? receiptScanFlow.errorMessage : null
        }
        title="Receipt scan failed"
      />

      {phase === 'error' && receiptScanFlow.permissionNeedsSettings ? (
        <Card style={styles.card}>
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
