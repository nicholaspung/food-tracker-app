import { trackObservabilityEvent } from '../../observability';
import type { BillRecord } from '../models';
import type { CreateBillInput, UpdateBillInput } from '../store/featureStore';
import type { OfflineAwareFeatureWriteResult } from '../store/useOfflineAwareFeatureWrite';
import {
  billDraftFacade,
  type BillDraftSubmissionSnapshot,
  type BuildBillDraftSubmissionInput,
} from './billDraft';

export interface CreateBillSubmissionBillWrites {
  createBill: (
    input: CreateBillInput,
  ) => Promise<OfflineAwareFeatureWriteResult<BillRecord>>;
  updateBill: (input: {
    billId: string;
    updates: UpdateBillInput;
  }) => Promise<OfflineAwareFeatureWriteResult<BillRecord>>;
}

export type CreateBillSubmissionDestination =
  | { name: 'Bills' }
  | { name: 'BillDetail'; params: { billId: string } };

export type CreateBillSubmissionResult =
  | {
      errorMessage: string;
      status: 'blocked';
    }
  | {
      destination: CreateBillSubmissionDestination;
      status: 'queued';
    }
  | {
      destination: CreateBillSubmissionDestination;
      status: 'completed';
    }
  | {
      errorMessage: string;
      status: 'failed';
    };

export interface SubmitCreateBillInput {
  billWrites: CreateBillSubmissionBillWrites;
  createEntityId: BuildBillDraftSubmissionInput['createEntityId'];
  createdByUserId: string;
  draft: BillDraftSubmissionSnapshot;
  hasNegativeParticipantAmount: boolean;
  hasUnresolvedSelectedFriends: boolean;
  isOnline: boolean;
  selectedFriendCount: number;
  source?: string;
}

function buildSubmitAnalyticsPayload({
  draft,
  isOnline,
  selectedFriendCount,
  source,
}: Pick<
  SubmitCreateBillInput,
  'draft' | 'isOnline' | 'selectedFriendCount' | 'source'
>) {
  const customParticipantCount = draft.participants.filter(
    (participant) => !participant.isCurrentUser && !participant.userId,
  ).length;

  return {
    source: source ?? 'CreateBillScreen',
    isEditMode: draft.isEditMode,
    splitMode: draft.splitMode,
    customParticipantCount,
    participantCount: draft.participants.length,
    selectedFriendCount,
    itemCount: draft.items.length,
    isOnline,
  };
}

function validationFailure(
  input: Pick<SubmitCreateBillInput, 'draft' | 'isOnline' | 'selectedFriendCount' | 'source'>,
  reason: string,
  errorMessage: string,
): CreateBillSubmissionResult {
  trackObservabilityEvent('CREATE_BILL_SUBMIT_VALIDATION_FAILED', {
    ...buildSubmitAnalyticsPayload(input),
    reason,
  });

  return {
    errorMessage,
    status: 'blocked',
  };
}

export async function submitCreateBill({
  billWrites,
  createEntityId,
  createdByUserId,
  draft,
  hasNegativeParticipantAmount,
  hasUnresolvedSelectedFriends,
  isOnline,
  selectedFriendCount,
  source = 'CreateBillScreen',
}: SubmitCreateBillInput): Promise<CreateBillSubmissionResult> {
  const validationInput = {
    draft,
    isOnline,
    selectedFriendCount,
    source,
  };

  if (!draft.billTitle.trim()) {
    return validationFailure(
      validationInput,
      'missing_bill_name',
      'Bill name is required.',
    );
  }

  if (draft.participants.length <= 1) {
    return validationFailure(
      validationInput,
      'missing_participants',
      'Add at least one other person to split with.',
    );
  }

  if (hasUnresolvedSelectedFriends) {
    return validationFailure(
      validationInput,
      'friend_resolution_failed',
      'Could not resolve one or more selected friends. Refresh and try again.',
    );
  }

  if (hasNegativeParticipantAmount) {
    return validationFailure(
      validationInput,
      'negative_participant_amount',
      'Final price cannot reduce any participant below $0.00.',
    );
  }

  const submission = billDraftFacade.buildSubmission({
    createEntityId,
    draft,
  });

  if (!submission.ok) {
    return validationFailure(validationInput, submission.reason, submission.message);
  }

  const billPayload = submission.payload;
  const startedPayload = {
    source,
    isEditMode: draft.isEditMode,
    splitMode: draft.splitMode,
    itemCount: billPayload.items?.length ?? 0,
    participantCount: billPayload.participants?.length ?? 0,
    isOnline,
  };

  trackObservabilityEvent('CREATE_BILL_SUBMIT_STARTED', startedPayload);

  try {
    const writeResult =
      draft.isEditMode && draft.editBillId
        ? await billWrites.updateBill({
            billId: draft.editBillId,
            updates: billPayload,
          })
        : await billWrites.createBill({
            ...billPayload,
            createdByUserId,
          });

    if (writeResult.status === 'queued') {
      trackObservabilityEvent('CREATE_BILL_SUBMIT_SUCCEEDED', {
        source,
        isEditMode: draft.isEditMode,
        splitMode: draft.splitMode,
        queued: true,
      });

      return {
        destination: { name: 'Bills' },
        status: 'queued',
      };
    }

    trackObservabilityEvent('CREATE_BILL_SUBMIT_SUCCEEDED', {
      source,
      isEditMode: draft.isEditMode,
      splitMode: draft.splitMode,
      queued: false,
    });

    return {
      destination: {
        name: 'BillDetail',
        params: { billId: writeResult.result.id },
      },
      status: 'completed',
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : draft.isEditMode
          ? 'Could not save bill.'
          : 'Could not create bill.';

    trackObservabilityEvent('CREATE_BILL_SUBMIT_FAILED', {
      source,
      isEditMode: draft.isEditMode,
      splitMode: draft.splitMode,
      isOnline,
      error: errorMessage,
    });

    return {
      errorMessage,
      status: 'failed',
    };
  }
}
