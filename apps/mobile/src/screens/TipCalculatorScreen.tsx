import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BackHeaderScreenScaffold, SegmentedControl } from '../components/shared';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useTheme } from '../theme';
import { Button, Card, Input, Text } from '../ui';

type TipCalculatorScreenProps = NativeStackScreenProps<RootStackParamList, 'TipCalculator'>;
type TipMode = 'percentage' | 'custom';

const PRESET_PERCENTAGES = [15, 18, 20, 25] as const;

function parseMoney(value: string): number {
  return Number.parseFloat(value) || 0;
}

export function TipCalculatorScreen({ navigation }: TipCalculatorScreenProps) {
  const theme = useTheme();
  const [subtotal, setSubtotal] = useState('');
  const [taxes, setTaxes] = useState('');
  const [tipMode, setTipMode] = useState<TipMode>('percentage');
  const [tipPercent, setTipPercent] = useState('18');
  const [customTipAmount, setCustomTipAmount] = useState('');

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

  const styles = StyleSheet.create({
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
  });

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
      keyboardAware
      onBackPress={() => {
        if (navigation.canGoBack()) {
          navigation.goBack();
          return;
        }
        navigation.navigate('Misc');
      }}
      subtitle="Quickly estimate a tip before you split the bill."
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
            testID="tip-subtotal"
            value={subtotal}
          />
          <Input
            keyboardType="decimal-pad"
            label="Taxes"
            onChangeText={(value) => {
              handleMoneyInput(value, setTaxes);
            }}
            placeholder="0.00"
            testID="tip-taxes"
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
            onChange={setTipMode}
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
                testID="tip-percentage"
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
              testID="tip-custom-amount"
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
