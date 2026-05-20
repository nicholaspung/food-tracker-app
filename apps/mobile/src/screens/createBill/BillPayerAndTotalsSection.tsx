import { Ionicons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';

import { StatusPill, OptionList, OptionListRow } from '../../components/shared';
import { formatCurrency } from '../../features/bills/billCalculations';
import type { OwedAmountEntry, DraftParticipant } from '../../features/bills/billDraft';
import { createThemedStyles, useTheme } from '../../theme';
import { Card, Input, Text } from '../../ui';

interface BillPayerAndTotalsSectionProps {
  isEqualSplitMode: boolean;
  isManualSplitMode: boolean;
  isPayerDropdownOpen: boolean;
  owedAmountEntries: OwedAmountEntry[];
  owedTotal: number;
  participants: DraftParticipant[];
  payerParticipantId: string;
  previewTotal: number;
  totalsMatch: boolean;
  onChangeOwedAmount: (participantId: string, value: string) => void;
  onSelectPayer: (participantId: string) => void;
  onTogglePayerDropdown: () => void;
}

const billNumericInputProps = {
  showInlineKeyboardDismissButton: false,
  useDefaultReturnKeyType: false,
} as const;

const useStyles = createThemedStyles((theme) => ({
  owedAmountInput: {
    width: 120,
  },
  owedAmountValue: {
    color: theme.colors.text.primary,
    textAlign: 'right',
    width: 120,
  },
  owedParticipantInfo: {
    flex: 1,
    gap: 2,
  },
  owedParticipantTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  owedRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  owedSection: {
    backgroundColor: theme.colors.background.muted,
    borderColor: theme.colors.border.subtle,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    gap: theme.spacing.sm,
    padding: theme.spacing.sm,
  },
  payerDropdownLabel: {
    color: theme.colors.text.primary,
    flex: 1,
  },
  payerDropdownTrigger: {
    alignItems: 'center',
    backgroundColor: theme.colors.background.surface,
    borderColor: theme.colors.border.default,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: theme.sizes.inputMinHeight,
    paddingHorizontal: theme.spacing.md,
  },
  payerDropdownTriggerOpen: {
    borderColor: theme.colors.border.strong,
  },
  payerOptionsList: {
    borderColor: theme.colors.border.info,
  },
  payerSection: {
    backgroundColor: theme.colors.status.infoBg,
    borderColor: theme.colors.border.info,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    gap: theme.spacing.xs,
    padding: theme.spacing.sm,
  },
  sectionCard: {
    gap: theme.spacing.sm,
  },
  sectionHint: {
    color: theme.colors.text.muted,
  },
  sectionTitle: {
    color: theme.colors.text.primary,
  },
  sectionTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  subsectionTitle: {
    color: theme.colors.text.primary,
  },
  subsectionTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  totalsDivider: {
    borderTopColor: theme.colors.border.subtle,
    borderTopWidth: 1,
    marginVertical: theme.spacing.xxs,
  },
  totalsLabel: {
    color: theme.colors.text.secondary,
  },
  totalsLabelStrong: {
    color: theme.colors.text.primary,
  },
  totalsPanel: {
    borderRadius: theme.radii.md,
    borderWidth: 1,
    gap: theme.spacing.xs,
    padding: theme.spacing.sm,
  },
  totalsPanelHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  totalsPanelMatch: {
    backgroundColor: theme.colors.status.successBg,
    borderColor: theme.colors.border.success,
  },
  totalsPanelMismatch: {
    backgroundColor: theme.colors.status.warningBg,
    borderColor: theme.colors.border.warning,
  },
  totalsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  totalsRowStrong: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  totalsValue: {
    color: theme.colors.text.primary,
  },
  totalsValueStrong: {
    color: theme.colors.text.primary,
  },
}));

export function BillPayerAndTotalsSection({
  isEqualSplitMode,
  isManualSplitMode,
  isPayerDropdownOpen,
  owedAmountEntries,
  owedTotal,
  participants,
  payerParticipantId,
  previewTotal,
  totalsMatch,
  onChangeOwedAmount,
  onSelectPayer,
  onTogglePayerDropdown,
}: BillPayerAndTotalsSectionProps) {
  const theme = useTheme();
  const styles = useStyles();
  const selectedPayer =
    participants.find((participant) => participant.id === payerParticipantId) ??
    null;
  const selectedPayerLabel = selectedPayer?.name ?? 'Select payer';

  return (
    <Card style={styles.sectionCard}>
      <View style={styles.sectionTitleRow} testID="bill-payer-owed-section">
        <Ionicons
          color={theme.colors.text.secondary}
          name="wallet-outline"
          size={16}
        />
        <Text style={styles.sectionTitle} variant="titleSm">
          Payer & Owed Amounts
        </Text>
      </View>

      <View style={styles.payerSection}>
        <View style={styles.subsectionTitleRow}>
          <Ionicons
            color={theme.colors.text.info}
            name="person-outline"
            size={15}
          />
          <Text style={styles.subsectionTitle} variant="bodyMdBold">
            Step 1: Who paid the bill?
          </Text>
          <StatusPill label="Required" tone="info" />
        </View>
        <Text style={styles.sectionHint} variant="bodySmCompact">
          Choose the payer first. Owed amounts below depend on this selection.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={onTogglePayerDropdown}
          style={[
            styles.payerDropdownTrigger,
            isPayerDropdownOpen ? styles.payerDropdownTriggerOpen : null,
          ]}
        >
          <Text
            numberOfLines={1}
            style={styles.payerDropdownLabel}
            variant="bodyLgComfortable"
          >
            {selectedPayerLabel}
          </Text>
          <Ionicons
            color={theme.colors.text.muted}
            name={isPayerDropdownOpen ? 'chevron-up' : 'chevron-down'}
            size={18}
          />
        </Pressable>

        {isPayerDropdownOpen ? (
          <OptionList style={styles.payerOptionsList}>
            {participants.map((participant, index) => {
              const isSelected = participant.id === payerParticipantId;

              return (
                <OptionListRow
                  chevron={false}
                  isLast={index === participants.length - 1}
                  key={participant.id}
                  onPress={() => {
                    onSelectPayer(participant.id);
                  }}
                  rightAccessory={
                    isSelected ? (
                      <Ionicons
                        color={theme.colors.text.info}
                        name="checkmark"
                        size={18}
                      />
                    ) : null
                  }
                  title={participant.name}
                />
              );
            })}
          </OptionList>
        ) : null}
      </View>

      <View style={styles.owedSection}>
        <View style={styles.subsectionTitleRow}>
          <Ionicons
            color={theme.colors.text.secondary}
            name="list-outline"
            size={15}
          />
          <Text style={styles.subsectionTitle} variant="bodyMdBold">
            {isEqualSplitMode
              ? 'Step 2: Auto-split owed amounts'
              : isManualSplitMode
                ? 'Step 2: Enter owed amounts'
                : 'Step 2: Calculated owed amounts'}
          </Text>
        </View>
        <Text style={styles.sectionHint} variant="bodySmCompact">
          {isEqualSplitMode
            ? "Equal split automatically calculates each person's owed amount from the total bill price."
            : isManualSplitMode
              ? "Enter each person's share. Values must add up to the total bill price."
              : 'Amounts are calculated from item assignments, tax, tip, and fees.'}
        </Text>
        {owedAmountEntries.map((entry, index) => {
          const isPayer = entry.participant.id === payerParticipantId;

          return (
            <View key={entry.participant.id} style={styles.owedRow}>
              <View style={styles.owedParticipantInfo}>
                <View style={styles.owedParticipantTitleRow}>
                  <Text variant="label">{entry.participant.name}</Text>
                  <StatusPill
                    label={isPayer ? 'Paid' : 'Unpaid'}
                    tone={isPayer ? 'success' : 'muted'}
                  />
                </View>
                <Text style={styles.sectionHint} variant="bodySmCompact">
                  {isPayer
                    ? 'Marked paid when the bill is created.'
                    : 'Will start as unpaid.'}
                </Text>
              </View>
              {isManualSplitMode ? (
                <Input
                  containerStyle={styles.owedAmountInput}
                  keyboardType="decimal-pad"
                  onChangeText={(value) => {
                    onChangeOwedAmount(entry.participant.id, value);
                  }}
                  placeholder="0.00"
                  testID={`bill-owed-amount-input-${index}`}
                  {...billNumericInputProps}
                  value={entry.inputValue}
                />
              ) : (
                <Text style={styles.owedAmountValue} variant="bodyLgTightBold">
                  {formatCurrency(entry.amount)}
                </Text>
              )}
            </View>
          );
        })}
      </View>

      <View
        style={[
          styles.totalsPanel,
          totalsMatch ? styles.totalsPanelMatch : styles.totalsPanelMismatch,
        ]}
      >
        <View style={styles.totalsPanelHeader}>
          <Text style={styles.totalsLabelStrong} variant="bodyMdBold">
            Bill Total Check
          </Text>
          <StatusPill
            label={totalsMatch ? 'Balanced' : 'Mismatch'}
            tone={totalsMatch ? 'success' : 'warning'}
          />
        </View>
        <View style={styles.totalsRowStrong}>
          <Text style={styles.totalsLabelStrong} variant="bodyMdBold">
            Bill total
          </Text>
          <Text style={styles.totalsValueStrong} variant="bodyLgBold">
            {formatCurrency(previewTotal)}
          </Text>
        </View>
        <View style={styles.totalsDivider} />
        <View style={styles.totalsRow}>
          <Text style={styles.totalsLabel} variant="label">
            Owed total
          </Text>
          <Text style={styles.totalsValue} variant="labelStrong">
            {formatCurrency(owedTotal)}
          </Text>
        </View>
        <Text tone={totalsMatch ? 'success' : 'danger'}>
          {totalsMatch
            ? 'Owed amounts match the bill total.'
            : 'Owed amounts must match the bill total.'}
        </Text>
      </View>
    </Card>
  );
}
