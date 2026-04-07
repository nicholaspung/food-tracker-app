import { pb } from '../../lib/pocketbase';
import type { InviteCodeRecord } from '../models';
import type {
  ReportContentInput,
  ReportContentResult,
} from './featureStore';
import {
  getAuthenticatedUserId,
  trackFeatureMutation,
} from './featureStoreShared';
import { sendApiRequest } from './pocketbaseGateway';

export type {
  ReportContentInput,
  ReportContentResult,
} from './featureStore';

interface InviteCodeListResponse {
  codes?: {
    id: string;
    code: string;
    locked?: boolean;
    lockedUntil?: string;
  }[];
}

export async function deleteAccount(currentPassword: string): Promise<void> {
  return trackFeatureMutation('account.delete', async () => {
    getAuthenticatedUserId();

    if (!currentPassword.trim()) {
      throw new Error('Current password is required.');
    }

    await sendApiRequest('/api/account/delete', {
      method: 'POST',
      body: JSON.stringify({
        currentPassword,
      }),
    });
  });
}

export async function listInviteCodes(): Promise<InviteCodeRecord[]> {
  if (!pb.authStore.record?.id) {
    return [];
  }

  const response = await sendApiRequest<InviteCodeListResponse>('/api/invite-codes', {
    method: 'GET',
  });

  return (response.codes ?? []).map((code) => ({
    id: code.id,
    code: code.code,
    locked: code.locked === true,
    lockedUntil: code.lockedUntil?.trim() || undefined,
  }));
}

export async function generateInviteCodes(): Promise<void> {
  return trackFeatureMutation('invite_code.generate', async () => {
    getAuthenticatedUserId();
    await sendApiRequest('/api/invite-codes/generate', {
      method: 'POST',
    });
  });
}

export async function lockInviteCode(codeId: string): Promise<void> {
  return trackFeatureMutation('invite_code.lock', async () => {
    getAuthenticatedUserId();

    const trimmedCodeId = codeId.trim();
    if (!trimmedCodeId) {
      throw new Error('Invite code is required.');
    }

    await sendApiRequest('/api/invite-codes/lock', {
      method: 'POST',
      body: { codeId: trimmedCodeId },
    });
  });
}

export async function reportContent(input: ReportContentInput): Promise<ReportContentResult> {
  return trackFeatureMutation(
    'content.report',
    async () => {
      const recordId = input.recordId.trim();
      if (!recordId) {
        throw new Error('Record ID is required.');
      }

      return sendApiRequest<ReportContentResult>('/api/content-reports', {
        method: 'POST',
        body: {
          contentType: input.contentType,
          recordId,
          reasonCode: input.reasonCode,
          notes: input.notes?.trim() || undefined,
        },
      });
    },
    {
      contentType: input.contentType,
      hasNotes: Boolean(input.notes?.trim()),
      reasonCode: input.reasonCode,
    },
  );
}
