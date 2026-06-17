import { Ionicons } from '../../ui/AppIcon';
import { Fragment } from 'react';
import { Pressable, View } from 'react-native';
import {
  OptionList,
  OptionListInlineBody,
  OptionListRow,
  SegmentedControl,
} from '../../components/shared';
import {
  formatCurrency,
} from '../../features/bills/billCalculations';
import {
  type DraftAdvancedSplitType,
  type DraftBillItem,
  type DraftParticipant,
} from '../../features/bills/billDraft';
import { createThemedStyles, useTheme } from '../../theme';
import { Input, Text } from '../../ui';
import type { BillDraftItemEditorController } from './useCreateBillItemCompositionController';

interface BillDraftItemEditorProps {
  controller: BillDraftItemEditorController;
  onRemoveItemRequest: (item: DraftBillItem) => void;
  participants: DraftParticipant[];
}

const useStyles = createThemedStyles((theme) => ({
  sectionCard: {
    gap: theme.spacing.sm,
  },
  sectionTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  sectionTitle: {
    color: theme.colors.text.primary,
  },
  sectionHint: {
    color: theme.colors.text.muted,
  },
  itemComposerRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  itemNameInput: {
    flex: 1,
  },
  itemPriceInput: {
    width: 110,
  },
  addItemButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.button.primaryBg,
    borderRadius: theme.radii.md,
    justifyContent: 'center',
    minHeight: theme.sizes.inputMinHeight,
    paddingHorizontal: theme.spacing.sm,
  },
  addItemButtonDisabled: {
    backgroundColor: theme.colors.button.primaryDisabledBg,
  },
  addItemButtonLabel: {
    color: theme.colors.text.inverse,
  },
  itemsList: {
    borderColor: theme.colors.border.subtle,
  },
  itemRowAccessory: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  itemPrice: {
    color: theme.colors.text.primary,
  },
  itemExpandIndicator: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 32,
    minWidth: 24,
  },
  removeItemButton: {
    alignItems: 'center',
    borderRadius: theme.radii.pill,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  itemSplitBody: {
    gap: theme.spacing.sm,
  },
  itemSplitModeRow: {
    gap: theme.spacing.xs,
  },
  itemSplitTypeRow: {
    gap: theme.spacing.xs,
  },
  splitControl: {
    alignSelf: 'flex-start',
  },
  assignmentChipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  assignmentChip: {
    backgroundColor: theme.colors.background.surface,
    borderColor: theme.colors.border.default,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xxs,
  },
  assignmentChipSelected: {
    backgroundColor: theme.colors.fill.brand,
    borderColor: theme.colors.fill.brand,
  },
  assignmentChipLabel: {
    color: theme.colors.text.secondary,
  },
  assignmentChipLabelSelected: {
    color: theme.colors.text.inverse,
  },
  advancedSplitValueRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  advancedSplitLabel: {
    color: theme.colors.text.primary,
    flex: 1,
  },
  advancedSplitInput: {
    width: 120,
  },
  advancedSplitControls: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  splitLockButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.background.surface,
    borderColor: theme.colors.border.default,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  splitLockButtonLocked: {
    backgroundColor: theme.colors.status.infoBg,
    borderColor: theme.colors.border.info,
  },
}));

export function BillDraftItemEditor({
  controller,
  onRemoveItemRequest,
  participants,
}: BillDraftItemEditorProps) {
  const theme = useTheme();
  const styles = useStyles();
  const {
    draftItemName,
    draftItemPrice,
    expandedItemIds,
    items,
    addItem,
    buildItemSplitSummary,
    getAdvancedItemBalanceFact,
    getAdvancedSplitInputValue,
    handleDraftItemPriceChange,
    isAdvancedSplitValueLocked,
    isSimpleItemParticipantAssigned,
    setDraftItemName,
    toggleAdvancedItemParticipant,
    toggleAdvancedSplitLock,
    toggleItemExpanded,
    toggleSimpleItemParticipant,
    updateAdvancedSplitType,
    updateAdvancedSplitValue,
    updateItemSplitMode,
  } = controller;
  const isAddDisabled = !draftItemName.trim() || !draftItemPrice.trim();

  return (
    <>
      <View style={styles.sectionTitleRow}>
        <Ionicons color={theme.colors.text.secondary} name="cash-outline" size={16} />
        <Text style={styles.sectionTitle} variant="titleSm">Items</Text>
      </View>
      <Text style={styles.sectionHint} variant="bodySmCompact">
        Custom mode: add items, then choose simple or complex assignment per item.
      </Text>

      <View style={styles.itemComposerRow}>
        <Input
          containerStyle={styles.itemNameInput}
          onChangeText={setDraftItemName}
          placeholder="Item name"
          testID="bill-item-name-input"
          value={draftItemName}
        />
        <Input
          containerStyle={styles.itemPriceInput}
          keyboardType="decimal-pad"
          onChangeText={handleDraftItemPriceChange}
          placeholder="0.00"
          showInlineKeyboardDismissButton={false}
          testID="bill-item-price-input"
          useDefaultReturnKeyType={false}
          value={draftItemPrice}
        />
        <Pressable
          accessibilityRole="button"
          disabled={isAddDisabled}
          onPress={addItem}
          style={({ pressed }) => [
            styles.addItemButton,
            isAddDisabled ? styles.addItemButtonDisabled : null,
            pressed ? { opacity: 0.8 } : null,
          ]}
        >
          <Text style={styles.addItemButtonLabel} variant="labelStrong">+ Add Item</Text>
        </Pressable>
      </View>

      {items.length > 0 ? (
        <OptionList style={styles.itemsList}>
          {items.map((item, index) => {
            const isLast = index === items.length - 1;
            const isExpanded = expandedItemIds.includes(item.id);
            const advancedBalanceFact = getAdvancedItemBalanceFact(item);

            return (
              <Fragment key={item.id}>
                <OptionListRow
                  accessibilityHint={
                    isExpanded
                      ? 'Collapses item split details'
                      : 'Expands item split details'
                  }
                  accessibilityState={{ expanded: isExpanded }}
                  chevron={false}
                  connected={isExpanded}
                  isLast={!isExpanded && isLast}
                  leading={
                    <View style={styles.itemExpandIndicator}>
                      <Ionicons
                        color={theme.colors.text.muted}
                        name={isExpanded ? 'chevron-up' : 'chevron-down'}
                        size={18}
                      />
                    </View>
                  }
                  onPress={() => {
                    toggleItemExpanded(item.id);
                  }}
                  rightAccessory={
                    <View style={styles.itemRowAccessory}>
                      <Text style={styles.itemPrice} variant="labelStrong">
                        {formatCurrency(Number(item.price) || 0)}
                      </Text>
                      <Pressable
                        accessibilityLabel={`Remove ${item.name}`}
                        accessibilityRole="button"
                        onPress={() => {
                          onRemoveItemRequest(item);
                        }}
                        style={styles.removeItemButton}
                        testID={`bill-item-remove-${index}`}
                      >
                        <Ionicons color={theme.colors.text.danger} name="trash-outline" size={16} />
                      </Pressable>
                    </View>
                  }
                  subtitle={buildItemSplitSummary(item, participants)}
                  title={item.name}
                />

                {isExpanded ? (
                  <OptionListInlineBody style={styles.itemSplitBody} withBottomDivider={!isLast}>
                    <View style={styles.itemSplitModeRow}>
                      <Text variant="label">Split Mode</Text>
                      <SegmentedControl
                        containerStyle={styles.splitControl}
                        fill={false}
                        onChange={(value: DraftBillItem['splitMode']) => {
                          updateItemSplitMode(item.id, value);
                        }}
                        options={[
                          { label: 'Simple', value: 'simple' },
                          { label: 'Complex', value: 'advanced' },
                        ]}
                        value={item.splitMode}
                      />
                    </View>

                    {item.splitMode === 'simple' ? (
                      <>
                        <Text style={styles.sectionHint} variant="bodySmCompact">Choose who shares this item.</Text>
                        <View style={styles.assignmentChipWrap}>
                          {participants.map((participant) => {
                            const isAssigned = isSimpleItemParticipantAssigned(item, participant.id);
                            return (
                              <Pressable
                                accessibilityRole="button"
                                key={participant.id}
                                onPress={() => {
                                  toggleSimpleItemParticipant(item.id, participant.id);
                                }}
                                style={[
                                  styles.assignmentChip,
                                  isAssigned ? styles.assignmentChipSelected : null,
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.assignmentChipLabel,
                                    isAssigned ? styles.assignmentChipLabelSelected : null,
                                  ]}
                                  variant="bodySmTightSemiBold"
                                >
                                  {participant.name}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </>
                    ) : (
                      <>
                        <View style={styles.itemSplitTypeRow}>
                          <Text variant="label">Complex Split Type</Text>
                          <SegmentedControl
                            containerStyle={styles.splitControl}
                            fill={false}
                            onChange={(value: DraftAdvancedSplitType) => {
                              updateAdvancedSplitType(item.id, value);
                            }}
                            options={[
                              { label: '%', value: 'percentage' },
                              { label: '$', value: 'amount' },
                            ]}
                            value={item.advancedSplitType}
                          />
                        </View>
                        <Text style={styles.sectionHint} variant="bodySmCompact">
                          Choose participants and enter split values.
                        </Text>
                        <View style={styles.assignmentChipWrap}>
                          {participants.map((participant) => {
                            const isInSplit = item.advancedSplits.some(
                              (split) => split.participantId === participant.id,
                            );
                            return (
                              <Pressable
                                accessibilityRole="button"
                                key={participant.id}
                                onPress={() => {
                                  toggleAdvancedItemParticipant(item.id, participant.id);
                                }}
                                style={[
                                  styles.assignmentChip,
                                  isInSplit ? styles.assignmentChipSelected : null,
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.assignmentChipLabel,
                                    isInSplit ? styles.assignmentChipLabelSelected : null,
                                  ]}
                                  variant="bodySmTightSemiBold"
                                >
                                  {participant.name}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>

                        {participants.map((participant) => {
                          const split = item.advancedSplits.find(
                            (entry) => entry.participantId === participant.id,
                          );
                          if (!split) {
                            return null;
                          }

                          const isLocked = isAdvancedSplitValueLocked(split, item.advancedSplitType);
                          return (
                            <View key={`${item.id}:${participant.id}`} style={styles.advancedSplitValueRow}>
                              <Text style={styles.advancedSplitLabel} variant="label">{participant.name}</Text>
                              <View style={styles.advancedSplitControls}>
                                <Pressable
                                  accessibilityLabel={isLocked ? 'Unlock split value' : 'Lock split value'}
                                  accessibilityRole="button"
                                  onPress={() => {
                                    toggleAdvancedSplitLock(
                                      item.id,
                                      participant.id,
                                      item.advancedSplitType,
                                    );
                                  }}
                                  style={[
                                    styles.splitLockButton,
                                    isLocked ? styles.splitLockButtonLocked : null,
                                  ]}
                                >
                                  <Ionicons
                                    color={isLocked ? theme.colors.text.info : theme.colors.text.muted}
                                    name={isLocked ? 'lock-closed' : 'lock-open-outline'}
                                    size={14}
                                  />
                                </Pressable>
                                <Input
                                  containerStyle={styles.advancedSplitInput}
                                  keyboardType="decimal-pad"
                                  onChangeText={(value) => {
                                    updateAdvancedSplitValue(
                                      item.id,
                                      participant.id,
                                      item.advancedSplitType,
                                      value,
                                    );
                                  }}
                                  placeholder="0.00"
                                  showInlineKeyboardDismissButton={false}
                                  useDefaultReturnKeyType={false}
                                  value={getAdvancedSplitInputValue(split, item.advancedSplitType)}
                                />
                              </View>
                            </View>
                          );
                        })}

                        <Text tone={advancedBalanceFact?.tone ?? 'warning'}>
                          {`Current split: ${advancedBalanceFact?.displayText ?? '0% of 100%'}`}
                        </Text>
                      </>
                    )}
                  </OptionListInlineBody>
                ) : null}
              </Fragment>
            );
          })}
        </OptionList>
      ) : (
        <Text style={styles.sectionHint} variant="bodySmCompact">Add at least one item with a price.</Text>
      )}
    </>
  );
}
