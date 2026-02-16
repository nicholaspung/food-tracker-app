export interface BillCalculationItem {
  id?: string;
  itemName: string;
  price: number;
  assignedTo: string[];
}

export interface BillCalculationParticipant {
  id: string;
  userId?: string | null;
  participantName?: string;
  amountOwed: number;
  paidStatus: 'pending' | 'paid';
}

export interface BillCalculationExtras {
  tax: number;
  tip: number;
  fees: number;
}

export function calculateEvenSplit(totalAmount: number, numberOfPeople: number): number {
  if (numberOfPeople === 0) {
    throw new Error('Number of people cannot be zero');
  }

  const perPerson = totalAmount / numberOfPeople;
  return roundToTwoDecimals(perPerson);
}

export function calculateItemizedSplit(
  items: BillCalculationItem[],
  participants: BillCalculationParticipant[],
  extras: BillCalculationExtras,
  extrasSplitMode: 'proportional' | 'equal',
): BillCalculationParticipant[] {
  const subtotal = items.reduce((sum, item) => sum + item.price, 0);
  const totalExtras = extras.tax + extras.tip + extras.fees;

  const participantAmounts = new Map<string, number>();
  participants.forEach((participant) => {
    participantAmounts.set(participant.id, 0);
  });

  items.forEach((item) => {
    if (item.assignedTo.length === 0) {
      throw new Error(`Item "${item.itemName}" has no participants assigned`);
    }

    const costPerPerson = item.price / item.assignedTo.length;

    item.assignedTo.forEach((participantId) => {
      const currentAmount = participantAmounts.get(participantId) ?? 0;
      participantAmounts.set(participantId, currentAmount + costPerPerson);
    });
  });

  if (extrasSplitMode === 'proportional') {
    participants.forEach((participant) => {
      const baseAmount = participantAmounts.get(participant.id) ?? 0;
      const proportion = subtotal > 0 ? baseAmount / subtotal : 0;
      const extrasShare = totalExtras * proportion;
      participantAmounts.set(participant.id, roundToTwoDecimals(baseAmount + extrasShare));
    });
  } else {
    const extrasPerPerson = totalExtras / participants.length;

    participants.forEach((participant) => {
      const baseAmount = participantAmounts.get(participant.id) ?? 0;
      participantAmounts.set(participant.id, roundToTwoDecimals(baseAmount + extrasPerPerson));
    });
  }

  const calculatedTotal = Array.from(participantAmounts.values()).reduce((sum, amount) => sum + amount, 0);
  const expectedTotal = roundToTwoDecimals(subtotal + totalExtras);
  const roundingError = roundToTwoDecimals(expectedTotal - calculatedTotal);

  if (Math.abs(roundingError) > 0.001 && participants.length > 0) {
    const firstParticipantId = participants[0].id;
    const currentAmount = participantAmounts.get(firstParticipantId) ?? 0;
    participantAmounts.set(firstParticipantId, roundToTwoDecimals(currentAmount + roundingError));
  }

  return participants.map((participant) => ({
    ...participant,
    amountOwed: participantAmounts.get(participant.id) ?? 0,
  }));
}

export function calculateCustomSplit(
  participants: BillCalculationParticipant[],
  totalAmount: number,
): BillCalculationParticipant[] {
  const calculatedTotal = participants.reduce((sum, participant) => sum + participant.amountOwed, 0);
  const roundingError = roundToTwoDecimals(totalAmount - calculatedTotal);

  if (Math.abs(roundingError) > 0.001 && participants.length > 0) {
    const updatedParticipants = [...participants];
    updatedParticipants[0] = {
      ...updatedParticipants[0],
      amountOwed: roundToTwoDecimals(updatedParticipants[0].amountOwed + roundingError),
    };
    return updatedParticipants;
  }

  return participants;
}

export function validateBillTotal(
  participants: BillCalculationParticipant[],
  totalAmount: number,
): boolean {
  const calculatedTotal = participants.reduce((sum, participant) => sum + participant.amountOwed, 0);
  const difference = Math.abs(totalAmount - calculatedTotal);

  return difference < 0.01;
}

export function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function roundToTwoDecimals(num: number): number {
  return Math.round(num * 100) / 100;
}
