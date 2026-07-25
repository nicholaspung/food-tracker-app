import { Ionicons } from '../ui/AppIcon';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect } from 'react';
import { AccessibilityInfo, Linking, Platform, View } from 'react-native';

import {
  FeatureFormScreenScaffold,
  PageErrorToast,
  PhotoSourcePickerCard,
  ScanProcessingProgressCard,
  useScanProcessingProgress,
} from '../components/shared';
import { useMonthlyUsage, useReceiptScanFlow } from '../features';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { createThemedStyles, useTheme } from '../theme';
import { Button, Card, Text } from '../ui';

type ReceiptScanScreenProps = NativeStackScreenProps<RootStackParamList, 'ReceiptScan'>;

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
  const processingProgress = useScanProcessingProgress(receiptScanFlow.status);

  const phase =
    receiptScanFlow.status === 'processing'
      ? 'processing'
      : receiptScanFlow.status === 'success'
        ? 'success'
        : receiptScanFlow.status === 'error'
          ? 'error'
          : 'choose';

  useEffect(() => {
    if (Platform.OS !== 'ios') {
      return;
    }

    if (phase === 'success') {
      AccessibilityInfo.announceForAccessibility('Receipt scan complete.');
    } else if (phase === 'error') {
      AccessibilityInfo.announceForAccessibility('Receipt scan failed.');
    }
  }, [phase]);

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
        <ScanProcessingProgressCard
          detailText="Reading item names, prices, tax, tip, and fees."
          elapsedLabel={processingProgress.elapsedLabel}
          imageName={receiptScanFlow.selectedImageName}
          processingPercent={processingProgress.processingPercent}
          progressAccessibilityLabel="Receipt scan progress"
          progressValue={processingProgress.progressValue}
          spin={processingProgress.processingSpin}
          statusText="We're processing your receipt now."
        />
      ) : null}

      {phase === 'success' && receiptScanFlow.result ? (
        <Card style={styles.card}>
          <View
            accessibilityLabel="Receipt scan complete"
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
            style={styles.successHeader}
          >
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

      {phase === 'error' && !receiptScanFlow.permissionNeedsSettings ? (
        <PhotoSourcePickerCard
          cardStyle={styles.card}
          description="Choose a clearer receipt image or try a different source."
          isSelecting={receiptScanFlow.status === 'selecting'}
          onCameraPress={() => {
            void receiptScanFlow.scanReceipt('camera');
          }}
          onGalleryPress={() => {
            void receiptScanFlow.scanReceipt('gallery');
          }}
          title="Try Another Receipt Image"
        />
      ) : null}

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
