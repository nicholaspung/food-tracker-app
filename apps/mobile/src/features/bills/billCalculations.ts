interface BillCalculationParticipant {
  id: string;
  userId?: string | null;
  participantName?: string;
  amountOwed: number;
  paidStatus: 'pending' | 'paid';
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
