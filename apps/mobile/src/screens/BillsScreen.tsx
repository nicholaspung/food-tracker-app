import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { EmptyState, ErrorState, Skeleton } from '../components/shared';
import {
  createBill,
  createEntityId,
  listBills,
  type BillItemRecord,
  type BillParticipantRecord,
} from '../features';
import {
  calculateItemizedSplit,
  formatCurrency,
  validateBillTotal,
  type BillCalculationItem,
  type BillCalculationParticipant,
} from '../features/bills/billCalculations';
import { useQueuedWrite } from '../features/store/useQueuedWrite';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useAuth } from '../providers/AuthProvider';
import { useTheme } from '../theme';
import { Button, Card, Input, ListItem, Screen, Text } from '../ui';

type BillsScreenProps = NativeStackScreenProps<RootStackParamList, 'Bills'>;

interface DraftBillItem {
  id: string;
  name: string;
  price: string;
  assignedTo: string;
}

function parseNames(rawNames: string): string[] {
  return rawNames
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

export function BillsScreen({ navigation }: BillsScreenProps) {
  const theme = useTheme();
  const { user } = useAuth();
  const queueWrite = useQueuedWrite();
  const queryClient = useQueryClient();

  const billsQuery = useQuery({
    queryKey: ['feature', 'bills'],
    queryFn: listBills,
  });

  const [title, setTitle] = useState('');
  const [restaurantName, setRestaurantName] = useState('');
  const [participantsInput, setParticipantsInput] = useState('');
  const [tax, setTax] = useState('0');
  const [tip, setTip] = useState('0');
  const [fees, setFees] = useState('0');
  const [extrasSplitMode, setExtrasSplitMode] = useState<'proportional' | 'equal'>('proportional');
  const [draftItems, setDraftItems] = useState<DraftBillItem[]>([]);
  const [draftItemName, setDraftItemName] = useState('');
  const [draftItemPrice, setDraftItemPrice] = useState('');
  const [draftAssignedTo, setDraftAssignedTo] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const styles = StyleSheet.create({
    container: {
      gap: theme.spacing.md,
    },
    row: {
      flexDirection: 'row',
      gap: theme.spacing.sm,
    },
    rowAction: {
      flex: 1,
    },
  });

  const addDraftItem = () => {
    if (!draftItemName.trim() || !draftItemPrice.trim()) {
      return;
    }

    setDraftItems((currentItems) => [
      ...currentItems,
      {
        id: createEntityId('bill_item_draft'),
        name: draftItemName.trim(),
        price: draftItemPrice.trim(),
        assignedTo: draftAssignedTo.trim(),
      },
    ]);

    setDraftItemName('');
    setDraftItemPrice('');
    setDraftAssignedTo('');
  };

  const previewTotal = useMemo(() => {
    const subtotal = draftItems.reduce((sum, item) => sum + Number(item.price || '0'), 0);
    const extras = Number(tax || '0') + Number(tip || '0') + Number(fees || '0');
    return subtotal + extras;
  }, [draftItems, fees, tax, tip]);

  const handleCreateBill = async () => {
    if (!title.trim() || !restaurantName.trim()) {
      setErrorMessage('Bill title and restaurant are required.');
      return;
    }

    const participantNames = parseNames(participantsInput);
    if (participantNames.length === 0) {
      setErrorMessage('Add at least one participant.');
      return;
    }

    if (draftItems.length === 0) {
      setErrorMessage('Add at least one item.');
      return;
    }

    const participantRecords: BillParticipantRecord[] = participantNames.map((participantName) => ({
      id: createEntityId('bill_participant'),
      name: participantName,
      amountOwed: 0,
      paidStatus: 'pending',
    }));

    const participantLookup = new Map<string, string>();
    participantRecords.forEach((participant) => {
      participantLookup.set(participant.name.toLowerCase(), participant.id);
    });

    const itemRecords: BillItemRecord[] = [];
    for (const draftItem of draftItems) {
      const price = Number(draftItem.price);
      if (Number.isNaN(price) || price <= 0) {
        setErrorMessage('Item prices must be positive numbers.');
        return;
      }

      const assignedNames = parseNames(draftItem.assignedTo);
      const assignedParticipantIds =
        assignedNames.length > 0
          ? assignedNames
              .map((name) => participantLookup.get(name.toLowerCase()))
              .filter((value): value is string => Boolean(value))
          : participantRecords.map((participant) => participant.id);

      if (assignedParticipantIds.length === 0) {
        setErrorMessage(`No valid participants assigned for item ${draftItem.name}.`);
        return;
      }

      itemRecords.push({
        id: createEntityId('bill_item'),
        itemName: draftItem.name,
        price,
        assignedToParticipantIds: assignedParticipantIds,
      });
    }

    const billCalcItems: BillCalculationItem[] = itemRecords.map((item) => ({
      id: item.id,
      itemName: item.itemName,
      price: item.price,
      assignedTo: item.assignedToParticipantIds,
    }));

    const billCalcParticipants: BillCalculationParticipant[] = participantRecords.map((participant) => ({
      id: participant.id,
      participantName: participant.name,
      amountOwed: 0,
      paidStatus: participant.paidStatus,
    }));

    const parsedTax = Number(tax || '0');
    const parsedTip = Number(tip || '0');
    const parsedFees = Number(fees || '0');

    const participantsWithTotals = calculateItemizedSplit(
      billCalcItems,
      billCalcParticipants,
      {
        tax: parsedTax,
        tip: parsedTip,
        fees: parsedFees,
      },
      extrasSplitMode,
    );

    const participantTotalsMap = new Map<string, number>();
    participantsWithTotals.forEach((participant) => {
      participantTotalsMap.set(participant.id, participant.amountOwed);
    });

    const finalParticipants: BillParticipantRecord[] = participantRecords.map((participant) => ({
      ...participant,
      amountOwed: participantTotalsMap.get(participant.id) ?? 0,
    }));

    const isValid = validateBillTotal(finalParticipants, previewTotal);
    if (!isValid) {
      setErrorMessage('Calculated totals do not match bill total.');
      return;
    }

    setErrorMessage(null);

    try {
      await queueWrite('bill.create');
      await createBill({
        title,
        restaurantName,
        createdByUserId: user?.id ?? 'unknown_user',
        items: itemRecords,
        participants: finalParticipants,
        tax: parsedTax,
        tip: parsedTip,
        fees: parsedFees,
        extrasSplitMode,
      });

      setTitle('');
      setRestaurantName('');
      setParticipantsInput('');
      setTax('0');
      setTip('0');
      setFees('0');
      setDraftItems([]);

      await queryClient.invalidateQueries({ queryKey: ['feature', 'bills'] });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not create bill.';
      setErrorMessage(message);
    }
  };

  return (
    <Screen scroll keyboardAware>
      <View style={styles.container}>
        <Text variant="titleMd">Bills</Text>

        <Card>
          <Text variant="label">Itemized bill flow</Text>
          <Input label="Bill title" onChangeText={setTitle} placeholder="Dinner split" value={title} />
          <Input
            label="Restaurant"
            onChangeText={setRestaurantName}
            placeholder="Restaurant name"
            value={restaurantName}
          />
          <Input
            label="Participants (comma separated)"
            onChangeText={setParticipantsInput}
            placeholder="Alex, Sam, Jordan"
            value={participantsInput}
          />

          <View style={styles.row}>
            <Input containerStyle={styles.rowAction} keyboardType="decimal-pad" label="Tax" onChangeText={setTax} value={tax} />
            <Input containerStyle={styles.rowAction} keyboardType="decimal-pad" label="Tip" onChangeText={setTip} value={tip} />
            <Input containerStyle={styles.rowAction} keyboardType="decimal-pad" label="Fees" onChangeText={setFees} value={fees} />
          </View>

          <View style={styles.row}>
            <Button
              label="Proportional"
              onPress={() => {
                setExtrasSplitMode('proportional');
              }}
              style={styles.rowAction}
              variant={extrasSplitMode === 'proportional' ? 'primary' : 'secondary'}
            />
            <Button
              label="Equal"
              onPress={() => {
                setExtrasSplitMode('equal');
              }}
              style={styles.rowAction}
              variant={extrasSplitMode === 'equal' ? 'primary' : 'secondary'}
            />
          </View>

          <Text tone="secondary">Bill preview total: {formatCurrency(previewTotal)}</Text>

          <Input
            label="Item name"
            onChangeText={setDraftItemName}
            placeholder="Ramen"
            value={draftItemName}
          />
          <Input
            keyboardType="decimal-pad"
            label="Item price"
            onChangeText={setDraftItemPrice}
            placeholder="14.50"
            value={draftItemPrice}
          />
          <Input
            label="Assigned to (comma separated, optional)"
            onChangeText={setDraftAssignedTo}
            placeholder="Alex, Sam"
            value={draftAssignedTo}
          />

          <Button label="Add Item" onPress={addDraftItem} variant="secondary" />

          {draftItems.map((item) => (
            <ListItem
              key={item.id}
              description={`Assigned: ${item.assignedTo || 'Everyone'}`}
              title={`${item.name} - ${formatCurrency(Number(item.price))}`}
            />
          ))}

          {errorMessage ? <ErrorState description={errorMessage} title="Bill creation failed" /> : null}

          <Button
            label="Create Itemized Bill"
            onPress={() => {
              void handleCreateBill();
            }}
          />
        </Card>

        {billsQuery.isLoading ? (
          <>
            <Skeleton height={20} />
            <Skeleton height={20} />
          </>
        ) : null}

        {billsQuery.isError ? (
          <ErrorState
            description="Could not load bills."
            onRetry={() => {
              void billsQuery.refetch();
            }}
            title="Bills unavailable"
          />
        ) : null}

        {!billsQuery.isLoading && !billsQuery.isError && (billsQuery.data?.length ?? 0) === 0 ? (
          <EmptyState description="Create an itemized bill to start splitting." title="No bills yet" />
        ) : null}

        {!billsQuery.isLoading && !billsQuery.isError
          ? (billsQuery.data ?? []).map((bill) => (
              <Card key={bill.id} tone={bill.status === 'settled' ? 'success' : 'info'}>
                <ListItem
                  description={`${bill.restaurantName} | ${bill.items.length} items`}
                  title={bill.title}
                  trailing={<Text tone="muted">{bill.status}</Text>}
                />
                <Button
                  label="Open Bill"
                  onPress={() => {
                    navigation.navigate('BillDetail', { billId: bill.id });
                  }}
                  variant="secondary"
                />
              </Card>
            ))
          : null}
      </View>
    </Screen>
  );
}
