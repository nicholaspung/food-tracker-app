/**
 * Bill calculation utilities for splitting bills
 */

export interface BillItem {
  id?: string;
  item_name: string;
  price: number;
  assigned_to: string[]; // Array of participant IDs
}

export interface BillParticipant {
  id: string;
  user_id?: string | null;
  participant_name?: string;
  amount_owed: number;
  paid_status: 'pending' | 'paid';
}

export interface BillExtras {
  tax: number;
  tip: number;
  fees: number;
}

/**
 * Calculate even split for a bill
 * @param totalAmount - Total bill amount
 * @param numberOfPeople - Number of people splitting the bill
 * @returns Amount per person
 */
export function calculateEvenSplit(
  totalAmount: number,
  numberOfPeople: number
): number {
  if (numberOfPeople === 0) {
    throw new Error('Number of people cannot be zero');
  }

  const perPerson = totalAmount / numberOfPeople;
  return roundToTwoDecimals(perPerson);
}

/**
 * Calculate itemized split with extras (tax, tip, fees)
 * @param items - Array of bill items
 * @param participants - Array of participants
 * @param extras - Tax, tip, and fees
 * @param extrasSplitMode - How to split extras: 'proportional' or 'equal'
 * @returns Updated participants with calculated amounts
 */
export function calculateItemizedSplit(
  items: BillItem[],
  participants: BillParticipant[],
  extras: BillExtras,
  extrasSplitMode: 'proportional' | 'equal'
): BillParticipant[] {
  // Calculate subtotal (sum of all items)
  const subtotal = items.reduce((sum, item) => sum + item.price, 0);

  // Calculate total extras
  const totalExtras = extras.tax + extras.tip + extras.fees;

  // Initialize participant amounts map
  const participantAmounts = new Map<string, number>();
  participants.forEach(p => participantAmounts.set(p.id, 0));

  // Calculate base amounts from items
  items.forEach(item => {
    if (item.assigned_to.length === 0) {
      throw new Error(`Item "${item.item_name}" has no participants assigned`);
    }

    // Split item cost among assigned participants
    const costPerPerson = item.price / item.assigned_to.length;

    item.assigned_to.forEach(participantId => {
      const currentAmount = participantAmounts.get(participantId) || 0;
      participantAmounts.set(participantId, currentAmount + costPerPerson);
    });
  });

  // Add extras to each participant
  if (extrasSplitMode === 'proportional') {
    // Proportional split: distribute extras based on each participant's portion of subtotal
    participants.forEach(participant => {
      const baseAmount = participantAmounts.get(participant.id) || 0;
      const proportion = subtotal > 0 ? baseAmount / subtotal : 0;
      const extrasShare = totalExtras * proportion;
      const totalAmount = baseAmount + extrasShare;

      participantAmounts.set(participant.id, roundToTwoDecimals(totalAmount));
    });
  } else {
    // Equal split: divide extras equally among all participants
    const extrasPerPerson = totalExtras / participants.length;

    participants.forEach(participant => {
      const baseAmount = participantAmounts.get(participant.id) || 0;
      const totalAmount = baseAmount + extrasPerPerson;

      participantAmounts.set(participant.id, roundToTwoDecimals(totalAmount));
    });
  }

  // Adjust for rounding errors
  const calculatedTotal = Array.from(participantAmounts.values()).reduce(
    (sum, amount) => sum + amount,
    0
  );
  const expectedTotal = roundToTwoDecimals(subtotal + totalExtras);
  const roundingError = roundToTwoDecimals(expectedTotal - calculatedTotal);

  // If there's a rounding error, add it to the first participant
  if (Math.abs(roundingError) > 0.001 && participants.length > 0) {
    const firstParticipantId = participants[0].id;
    const currentAmount = participantAmounts.get(firstParticipantId) || 0;
    participantAmounts.set(
      firstParticipantId,
      roundToTwoDecimals(currentAmount + roundingError)
    );
  }

  // Return updated participants
  return participants.map(participant => ({
    ...participant,
    amount_owed: participantAmounts.get(participant.id) || 0,
  }));
}

/**
 * Calculate custom split amounts
 * @param participants - Array of participants with custom amounts
 * @param totalAmount - Expected total amount
 * @returns Updated participants, adjusted for rounding if needed
 */
export function calculateCustomSplit(
  participants: BillParticipant[],
  totalAmount: number
): BillParticipant[] {
  const calculatedTotal = participants.reduce(
    (sum, p) => sum + p.amount_owed,
    0
  );
  const roundingError = roundToTwoDecimals(totalAmount - calculatedTotal);

  // If there's a rounding error, add it to the first participant
  if (Math.abs(roundingError) > 0.001 && participants.length > 0) {
    const updatedParticipants = [...participants];
    updatedParticipants[0] = {
      ...updatedParticipants[0],
      amount_owed: roundToTwoDecimals(
        updatedParticipants[0].amount_owed + roundingError
      ),
    };
    return updatedParticipants;
  }

  return participants;
}

/**
 * Validate that bill amounts are correct
 * @param participants - Array of participants
 * @param totalAmount - Expected total amount
 * @returns True if amounts match, false otherwise
 */
export function validateBillTotal(
  participants: BillParticipant[],
  totalAmount: number
): boolean {
  const calculatedTotal = participants.reduce(
    (sum, p) => sum + p.amount_owed,
    0
  );

  const difference = Math.abs(totalAmount - calculatedTotal);

  // Allow for 1 cent difference due to rounding
  return difference < 0.01;
}

/**
 * Get summary statistics for a bill
 */
export function getBillSummary(participants: BillParticipant[], currentUserId: string) {
  const totalOwed = participants.reduce((sum, p) => sum + p.amount_owed, 0);
  const totalPaid = participants
    .filter(p => p.paid_status === 'paid')
    .reduce((sum, p) => sum + p.amount_owed, 0);
  const totalPending = totalOwed - totalPaid;

  const currentUserParticipant = participants.find(
    p => p.user_id === currentUserId
  );

  const youOwe = currentUserParticipant?.paid_status === 'pending'
    ? currentUserParticipant.amount_owed
    : 0;

  const youAreOwed = participants
    .filter(p => p.user_id !== currentUserId && p.paid_status === 'pending')
    .reduce((sum, p) => sum + p.amount_owed, 0);

  const paidCount = participants.filter(p => p.paid_status === 'paid').length;
  const totalCount = participants.length;

  return {
    totalOwed: roundToTwoDecimals(totalOwed),
    totalPaid: roundToTwoDecimals(totalPaid),
    totalPending: roundToTwoDecimals(totalPending),
    youOwe: roundToTwoDecimals(youOwe),
    youAreOwed: roundToTwoDecimals(youAreOwed),
    paidCount,
    totalCount,
    isFullyPaid: paidCount === totalCount,
  };
}

/**
 * Round number to 2 decimal places
 */
function roundToTwoDecimals(num: number): number {
  return Math.round(num * 100) / 100;
}

/**
 * Format currency amount
 */
export function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}
