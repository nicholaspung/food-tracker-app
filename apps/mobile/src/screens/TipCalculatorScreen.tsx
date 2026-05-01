import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { BackHeaderScreenScaffold, SegmentedControl } from '../components/shared';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { createThemedStyles } from '../theme';
import { Button, Card, Input, Text } from '../ui';

type TipCalculatorScreenProps = NativeStackScreenProps<RootStackParamList, 'TipCalculator'>;
type TipMode = 'percentage' | 'custom';

const PRESET_PERCENTAGES = [15, 18, 20, 25] as const;

const useStyles = createThemedStyles((theme) => ({
  body: {
    gap: theme.spacing.md,
  },
  row: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  rowAction: {
    flex: 1,
  },
  resultCard: {
    borderWidth: 2,
  },
  resultRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  totalDivider: {
    borderTopColor: theme.colors.border.subtle,
    borderTopWidth: 1,
    marginTop: theme.spacing.xs,
    paddingTop: theme.spacing.sm,
  },
}));

function parseMoney(value: string): number {
  return Number.parseFloat(value) || 0;
}

export function TipCalculatorScreen({ navigation }: TipCalculatorScreenProps) {
  const styles = useStyles();
  const [subtotal, setSubtotal] = useState('');
  const [taxes, setTaxes] = useState('');
  const [tipMode, setTipMode] = useState<TipMode>('percentage');
  const [tipPercent, setTipPercent] = useState('18');
  const [customTipAmount, setCustomTipAmount] = useState('');
  const [hasTrackedCalculationEvent, setHasTrackedCalculationEvent] = useState(false);

  const parsedSubtotal = parseMoney(subtotal);
  const parsedTaxes = parseMoney(taxes);
  const parsedTipPercent = Number.parseFloat(tipPercent) || 0;
  const parsedCustomTip = parseMoney(customTipAmount);
  const pretipTotal = parsedSubtotal + parsedTaxes;

  const tipAmount = useMemo(() => {
    if (tipMode === 'custom') {
      return parsedCustomTip;
    }

    return parsedSubtotal * (parsedTipPercent / 100);
  }, [parsedCustomTip, parsedSubtotal, parsedTipPercent, tipMode]);

  const finalTotal = pretipTotal + tipAmount;

  useEffect(() => {
    if (pretipTotal <= 0) {
      if (hasTrackedCalculationEvent) {
        setHasTrackedCalculationEvent(false);
      }
      return;
    }

    if (hasTrackedCalculationEvent) {
      return;
    }

    trackObservabilityEvent('TIP_CALCULATOR_CALCULATION_COMPLETED', {
      source: 'TipCalculatorScreen',
      tipMode,
      subtotal: parsedSubtotal,
      taxes: parsedTaxes,
      tipAmount,
      totalAmount: finalTotal,
    });
    setHasTrackedCalculationEvent(true);
  }, [finalTotal, hasTrackedCalculationEvent, parsedSubtotal, parsedTaxes, pretipTotal, tipAmount, tipMode]);

  const handleMoneyInput = (value: string, setter: (nextValue: string) => void) => {
    if (value === '' || /^\d*\.?\d{0,2}$/.test(value)) {
      setter(value);
    }
  };

  const handlePercentInput = (value: string) => {
    if (value === '' || /^\d{0,2}(\.\d{0,2})?$/.test(value)) {
      setTipPercent(value);
    }
  };

  return (
    <BackHeaderScreenScaffold
      adjustKeyboardSpaceForFixedHeader
      headerScrollMode="fixed"
      keyboardAware
      onBackPress={() => {
        if (navigation.canGoBack()) {
          navigation.goBack();
          return;
        }
        navigation.navigate('Misc');
      }}
      subtitle="Quickly estimate a tip before you split the bill."
      testID="tip-calculator-screen"
      title="Tip Calculator"
    >
      <View style={styles.body}>
        <Card>
          <Text variant="label">Bill Details</Text>
          <Input
            keyboardType="decimal-pad"
            label="Subtotal"
            onChangeText={(value) => {
              handleMoneyInput(value, setSubtotal);
            }}
            placeholder="0.00"
            showInlineKeyboardDismissButton={false}
            testID="tip-subtotal"
            useDefaultReturnKeyType={false}
            value={subtotal}
          />
          <Input
            keyboardType="decimal-pad"
            label="Taxes"
            onChangeText={(value) => {
              handleMoneyInput(value, setTaxes);
            }}
            placeholder="0.00"
            showInlineKeyboardDismissButton={false}
            testID="tip-taxes"
            useDefaultReturnKeyType={false}
            value={taxes}
          />

          <View style={styles.resultRow}>
            <Text tone="secondary" variant="label">
              Total Before Tip
            </Text>
            <Text variant="titleMd">${pretipTotal.toFixed(2)}</Text>
          </View>
        </Card>

        <Card>
          <Text variant="label">Tip Mode</Text>
          <SegmentedControl
            getOptionTestID={(value) => `tip-mode-${value}`}
            onChange={(nextTipMode: TipMode) => {
              trackObservabilityEvent('TIP_CALCULATOR_TIP_MODE_CHANGED', {
                source: 'TipCalculatorScreen',
                previousTipMode: tipMode,
                nextTipMode,
              });
              setTipMode(nextTipMode);
            }}
            options={[
              { label: 'Percentage', value: 'percentage' },
              { label: 'Specific Amount', value: 'custom' },
            ]}
            value={tipMode}
          />

          {tipMode === 'percentage' ? (
            <>
              <View style={styles.row}>
                {PRESET_PERCENTAGES.map((preset) => (
                  <Button
                    key={preset}
                    label={`${preset}%`}
                    onPress={() => {
                      trackObservabilityEvent('TIP_CALCULATOR_PRESET_SELECTED', {
                        source: 'TipCalculatorScreen',
                        presetPercentage: preset,
                        previousTipPercent: Number.parseFloat(tipPercent) || 0,
                      });
                      setTipPercent(String(preset));
                    }}
                    style={styles.rowAction}
                    testID={`tip-preset-${preset}`}
                    variant={Number.parseFloat(tipPercent) === preset ? 'primary' : 'secondary'}
                  />
                ))}
              </View>
              <Input
                keyboardType="decimal-pad"
                label="Tip Percentage"
                onChangeText={handlePercentInput}
                placeholder="18"
                showInlineKeyboardDismissButton={false}
                testID="tip-percentage"
                useDefaultReturnKeyType={false}
                value={tipPercent}
              />
            </>
          ) : (
            <Input
              keyboardType="decimal-pad"
              label="Tip Amount"
              onChangeText={(value) => {
                handleMoneyInput(value, setCustomTipAmount);
              }}
              placeholder="0.00"
              showInlineKeyboardDismissButton={false}
              testID="tip-custom-amount"
              useDefaultReturnKeyType={false}
              value={customTipAmount}
            />
          )}
        </Card>

        <Card style={styles.resultCard} tone={parsedSubtotal > 0 ? 'success' : 'muted'}>
          <View style={styles.resultRow}>
            <Text tone="secondary" variant="label">
              Tip Amount
            </Text>
            <Text tone={parsedSubtotal > 0 ? 'success' : 'muted'} variant="titleLg">
              ${tipAmount.toFixed(2)}
            </Text>
          </View>

          <View style={styles.totalDivider}>
            <View style={styles.resultRow}>
              <Text variant="label">Total With Tip</Text>
              <Text variant="titleMd">${finalTotal.toFixed(2)}</Text>
            </View>
          </View>
        </Card>
      </View>
    </BackHeaderScreenScaffold>
  );
}
