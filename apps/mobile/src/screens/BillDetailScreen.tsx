import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { EmptyState, ErrorState, Skeleton } from '../components/shared';
import {
  createEntityId,
  getBillById,
  markBillParticipantPaid,
  updateBill,
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
import { Button, Card, Input, ListItem, Screen, Text } from '../ui';

type BillDetailScreenProps = NativeStackScreenProps<RootStackParamList, 'BillDetail'>;

function computeBillTotals(
  subtotal: number,
  tax: number,
  tip: number,
  fees: number,
  participants: BillParticipantRecord[],
): {
  total: number;
  participantTotal: number;
  isValid: boolean;
} {
  const total = subtotal + tax + tip + fees;
  const participantTotal = participants.reduce((sum, participant) => sum + participant.amountOwed, 0);

  return {
    total,
    participantTotal,
    isValid: validateBillTotal(participants, total),
  };
}

export function BillDetailScreen({ navigation, route }: BillDetailScreenProps) {
  const { billId } = route.params;
  const queueWrite = useQueuedWrite();
  const queryClient = useQueryClient();

  const billQuery = useQuery({
    queryKey: ['feature', 'bill', billId],
    queryFn: () => getBillById(billId),
  });

  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [newItemAssignedTo, setNewItemAssignedTo] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const subtotal = useMemo(() => {
    const bill = billQuery.data;
    if (!bill) {
      return 0;
    }

    return bill.items.reduce((sum, item) => sum + item.price, 0);
  }, [billQuery.data]);

  const totals = useMemo(() => {
    const bill = billQuery.data;
    if (!bill) {
      return {
        total: 0,
        participantTotal: 0,
        isValid: true,
      };
    }

    return computeBillTotals(subtotal, bill.tax, bill.tip, bill.fees, bill.participants);
  }, [billQuery.data, subtotal]);

  const refreshBill = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['feature', 'bills'] }),
      queryClient.invalidateQueries({ queryKey: ['feature', 'bill', billId] }),
    ]);
  };

  const togglePaidStatus = async (participantId: string, currentStatus: BillParticipantRecord['paidStatus']) => {
    setErrorMessage(null);

    try {
      await queueWrite('bill.participant.toggle-paid');
      await markBillParticipantPaid(
        billId,
        participantId,
        currentStatus === 'paid' ? 'pending' : 'paid',
      );
      await refreshBill();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not update paid status.';
      setErrorMessage(message);
    }
  };

  const addItemToBill = async () => {
    const bill = billQuery.data;
    if (!bill) {
      return;
    }

    if (!newItemName.trim() || !newItemPrice.trim()) {
      setErrorMessage('Item name and price are required.');
      return;
    }

    const parsedPrice = Number(newItemPrice);
    if (Number.isNaN(parsedPrice) || parsedPrice <= 0) {
      setErrorMessage('Item price must be greater than zero.');
      return;
    }

    const assignedNames = newItemAssignedTo
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);

    const participantLookup = new Map<string, string>();
    bill.participants.forEach((participant) => {
      participantLookup.set(participant.name.toLowerCase(), participant.id);
    });

    const assignedParticipantIds =
      assignedNames.length > 0
        ? assignedNames
            .map((name) => participantLookup.get(name))
            .filter((value): value is string => Boolean(value))
        : bill.participants.map((participant) => participant.id);

    if (assignedParticipantIds.length === 0) {
      setErrorMessage('No valid participants found for item assignment.');
      return;
    }

    const updatedItems = [
      ...bill.items,
      {
        id: createEntityId('bill_item'),
        itemName: newItemName.trim(),
        price: parsedPrice,
        assignedToParticipantIds: assignedParticipantIds,
      },
    ];

    const calcItems: BillCalculationItem[] = updatedItems.map((item) => ({
      id: item.id,
      itemName: item.itemName,
      price: item.price,
      assignedTo: item.assignedToParticipantIds,
    }));

    const calcParticipants: BillCalculationParticipant[] = bill.participants.map((participant) => ({
      id: participant.id,
      participantName: participant.name,
      amountOwed: 0,
      paidStatus: participant.paidStatus,
    }));

    const participantsWithTotals = calculateItemizedSplit(
      calcItems,
      calcParticipants,
      {
        tax: bill.tax,
        tip: bill.tip,
        fees: bill.fees,
      },
      bill.extrasSplitMode,
    );

    const participantTotalsMap = new Map<string, number>();
    participantsWithTotals.forEach((participant) => {
      participantTotalsMap.set(participant.id, participant.amountOwed);
    });

    const updatedParticipants = bill.participants.map((participant) => ({
      ...participant,
      amountOwed: participantTotalsMap.get(participant.id) ?? 0,
    }));

    const nextSubtotal = updatedItems.reduce((sum, item) => sum + item.price, 0);
    const nextTotals = computeBillTotals(nextSubtotal, bill.tax, bill.tip, bill.fees, updatedParticipants);

    if (!nextTotals.isValid) {
      setErrorMessage('Updated bill totals are invalid.');
      return;
    }

    setErrorMessage(null);

    try {
      await queueWrite('bill.item.add');
      await updateBill(billId, {
        items: updatedItems,
        participants: updatedParticipants,
      });

      setNewItemName('');
      setNewItemPrice('');
      setNewItemAssignedTo('');

      await refreshBill();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not update bill.';
      setErrorMessage(message);
    }
  };

  if (billQuery.isLoading) {
    return (
      <Screen>
        <Skeleton height={20} />
        <Skeleton height={20} />
      </Screen>
    );
  }

  if (billQuery.isError) {
    return (
      <Screen>
        <ErrorState
          description="Could not load bill detail."
          onRetry={() => {
            void billQuery.refetch();
          }}
          title="Bill unavailable"
        />
      </Screen>
    );
  }

  if (!billQuery.data) {
    return (
      <Screen>
        <EmptyState
          actionLabel="Back to Bills"
          onAction={() => {
            navigation.navigate('Bills');
          }}
          title="Bill not found"
        />
      </Screen>
    );
  }

  const bill = billQuery.data;

  return (
    <Screen scroll keyboardAware>
      <Text variant="titleMd">{bill.title}</Text>
      <Text tone="secondary">{bill.restaurantName}</Text>

      {errorMessage ? <ErrorState description={errorMessage} title="Bill update failed" /> : null}

      <Card>
        <Text variant="label">Calculation parity summary</Text>
        <Text tone="secondary">Subtotal: {formatCurrency(subtotal)}</Text>
        <Text tone="secondary">Tax: {formatCurrency(bill.tax)}</Text>
        <Text tone="secondary">Tip: {formatCurrency(bill.tip)}</Text>
        <Text tone="secondary">Fees: {formatCurrency(bill.fees)}</Text>
        <Text tone="secondary">Total: {formatCurrency(totals.total)}</Text>
        <Text tone="secondary">Participant total: {formatCurrency(totals.participantTotal)}</Text>
        <Text tone={totals.isValid ? 'success' : 'danger'}>
          {totals.isValid ? 'Totals match expected bill total.' : 'Totals mismatch detected.'}
        </Text>
      </Card>

      <Card>
        <Text variant="label">Participants</Text>
        {bill.participants.map((participant) => (
          <ListItem
            key={participant.id}
            description={formatCurrency(participant.amountOwed)}
            title={participant.name}
            trailing={
              <Button
                label={participant.paidStatus === 'paid' ? 'Mark Pending' : 'Mark Paid'}
                onPress={() => {
                  void togglePaidStatus(participant.id, participant.paidStatus);
                }}
                variant="secondary"
              />
            }
          />
        ))}
      </Card>

      <Card>
        <Text variant="label">Itemized entries</Text>
        {bill.items.map((item) => (
          <ListItem
            key={item.id}
            description={`Assigned to ${item.assignedToParticipantIds.length} participant(s)`}
            title={`${item.itemName} - ${formatCurrency(item.price)}`}
          />
        ))}

        <Input
          label="Item name"
          onChangeText={setNewItemName}
          placeholder="New item"
          value={newItemName}
        />
        <Input
          keyboardType="decimal-pad"
          label="Item price"
          onChangeText={setNewItemPrice}
          placeholder="12.00"
          value={newItemPrice}
        />
        <Input
          label="Assign to names (optional comma separated)"
          onChangeText={setNewItemAssignedTo}
          placeholder="Alex, Sam"
          value={newItemAssignedTo}
        />

        <Button
          label="Add Item"
          onPress={() => {
            void addItemToBill();
          }}
          variant="secondary"
        />
      </Card>
    </Screen>
  );
}
