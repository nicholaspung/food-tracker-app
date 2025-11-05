/**
 * Bill validation utilities
 */

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

/**
 * Validate bill name
 */
export function validateBillName(billName: string): ValidationResult {
  const errors: ValidationError[] = [];

  if (!billName || billName.trim() === '') {
    errors.push({
      field: 'bill_name',
      message: 'Bill name is required',
    });
  }

  if (billName.length > 200) {
    errors.push({
      field: 'bill_name',
      message: 'Bill name must be 200 characters or less',
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validate bill amount
 */
export function validateAmount(
  amount: number,
  fieldName: string = 'amount'
): ValidationResult {
  const errors: ValidationError[] = [];

  if (amount < 0) {
    errors.push({
      field: fieldName,
      message: 'Amount cannot be negative',
    });
  }

  if (isNaN(amount)) {
    errors.push({
      field: fieldName,
      message: 'Amount must be a valid number',
    });
  }

  if (amount > 1000000) {
    errors.push({
      field: fieldName,
      message: 'Amount is too large (max: $1,000,000)',
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validate total bill amount
 */
export function validateTotalAmount(totalAmount: number): ValidationResult {
  const errors: ValidationError[] = [];

  if (totalAmount <= 0) {
    errors.push({
      field: 'total_amount',
      message: 'Total amount must be greater than $0',
    });
  }

  const amountValidation = validateAmount(totalAmount, 'total_amount');
  errors.push(...amountValidation.errors);

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validate participants list
 */
export function validateParticipants(
  participants: Array<{ id: string; user_id?: string | null; participant_name?: string }>
): ValidationResult {
  const errors: ValidationError[] = [];

  if (!participants || participants.length === 0) {
    errors.push({
      field: 'participants',
      message: 'At least one participant is required',
    });
  }

  if (participants.length > 100) {
    errors.push({
      field: 'participants',
      message: 'Too many participants (max: 100)',
    });
  }

  // Check for duplicate participants
  const userIds = participants
    .filter(p => p.user_id)
    .map(p => p.user_id);

  const uniqueUserIds = new Set(userIds);
  if (userIds.length !== uniqueUserIds.size) {
    errors.push({
      field: 'participants',
      message: 'Duplicate participants found',
    });
  }

  // Validate participant names for non-users
  participants.forEach((participant, index) => {
    if (!participant.user_id && !participant.participant_name) {
      errors.push({
        field: `participant_${index}`,
        message: 'Participant name is required for non-users',
      });
    }

    if (participant.participant_name && participant.participant_name.length > 100) {
      errors.push({
        field: `participant_${index}`,
        message: 'Participant name must be 100 characters or less',
      });
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validate bill items for itemized split
 */
export function validateBillItems(
  items: Array<{
    item_name: string;
    price: number;
    assigned_to: string[];
  }>
): ValidationResult {
  const errors: ValidationError[] = [];

  if (!items || items.length === 0) {
    errors.push({
      field: 'items',
      message: 'At least one item is required for itemized split',
    });
  }

  items.forEach((item, index) => {
    // Validate item name
    if (!item.item_name || item.item_name.trim() === '') {
      errors.push({
        field: `item_${index}_name`,
        message: `Item ${index + 1}: Name is required`,
      });
    }

    if (item.item_name.length > 200) {
      errors.push({
        field: `item_${index}_name`,
        message: `Item ${index + 1}: Name must be 200 characters or less`,
      });
    }

    // Validate item price
    const priceValidation = validateAmount(item.price, `item_${index}_price`);
    priceValidation.errors.forEach(error => {
      errors.push({
        field: error.field,
        message: `Item ${index + 1}: ${error.message}`,
      });
    });

    if (item.price === 0) {
      errors.push({
        field: `item_${index}_price`,
        message: `Item ${index + 1}: Price must be greater than $0`,
      });
    }

    // Validate assigned participants
    if (!item.assigned_to || item.assigned_to.length === 0) {
      errors.push({
        field: `item_${index}_assigned`,
        message: `Item ${index + 1}: At least one participant must be assigned`,
      });
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validate bill extras (tax, tip, fees)
 */
export function validateExtras(extras: {
  tax: number;
  tip: number;
  fees: number;
}): ValidationResult {
  const errors: ValidationError[] = [];

  const taxValidation = validateAmount(extras.tax, 'tax');
  const tipValidation = validateAmount(extras.tip, 'tip');
  const feesValidation = validateAmount(extras.fees, 'fees');

  errors.push(...taxValidation.errors);
  errors.push(...tipValidation.errors);
  errors.push(...feesValidation.errors);

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validate complete bill data for even split
 */
export function validateEvenSplitBill(data: {
  bill_name: string;
  total_amount: number;
  participants: Array<{ id: string; user_id?: string | null; participant_name?: string }>;
}): ValidationResult {
  const errors: ValidationError[] = [];

  const nameValidation = validateBillName(data.bill_name);
  const amountValidation = validateTotalAmount(data.total_amount);
  const participantsValidation = validateParticipants(data.participants);

  errors.push(...nameValidation.errors);
  errors.push(...amountValidation.errors);
  errors.push(...participantsValidation.errors);

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validate complete bill data for itemized split
 */
export function validateItemizedSplitBill(data: {
  bill_name: string;
  participants: Array<{ id: string; user_id?: string | null; participant_name?: string }>;
  items: Array<{
    item_name: string;
    price: number;
    assigned_to: string[];
  }>;
  extras: {
    tax: number;
    tip: number;
    fees: number;
  };
}): ValidationResult {
  const errors: ValidationError[] = [];

  const nameValidation = validateBillName(data.bill_name);
  const participantsValidation = validateParticipants(data.participants);
  const itemsValidation = validateBillItems(data.items);
  const extrasValidation = validateExtras(data.extras);

  errors.push(...nameValidation.errors);
  errors.push(...participantsValidation.errors);
  errors.push(...itemsValidation.errors);
  errors.push(...extrasValidation.errors);

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validate custom split amounts
 */
export function validateCustomSplitAmounts(
  participants: Array<{ amount_owed: number }>,
  totalAmount: number
): ValidationResult {
  const errors: ValidationError[] = [];

  const calculatedTotal = participants.reduce(
    (sum, p) => sum + p.amount_owed,
    0
  );

  const difference = Math.abs(totalAmount - calculatedTotal);

  // Allow for 1 cent difference due to rounding
  if (difference >= 0.01) {
    errors.push({
      field: 'custom_amounts',
      message: `Custom amounts ($${calculatedTotal.toFixed(
        2
      )}) don't match total ($${totalAmount.toFixed(2)})`,
    });
  }

  participants.forEach((participant, index) => {
    const amountValidation = validateAmount(
      participant.amount_owed,
      `participant_${index}_amount`
    );
    errors.push(...amountValidation.errors);
  });

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Get first validation error message
 */
export function getFirstError(result: ValidationResult): string | null {
  return result.errors.length > 0 ? result.errors[0].message : null;
}

/**
 * Get all validation error messages
 */
export function getAllErrors(result: ValidationResult): string[] {
  return result.errors.map(e => e.message);
}
