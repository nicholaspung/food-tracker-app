import { sendApiRequest } from './pocketbaseGateway';

export type UserTier = 'admin' | 'subscriber' | 'free';
export type LimitValue = number | null;
export type UsagePreviewTier = UserTier;
export {
  FREE_MONTHLY_PHOTO_UPLOAD_LIMIT,
  formatFreeMonthlyPhotoLimitStatus,
} from './usageLimitCopy';

export interface MonthlyUsageSnapshot {
  monthKey: string;
  userTier: UserTier;
  limits: {
    photoUploadsPerRecord: LimitValue;
    photoUploadsMonthly: LimitValue;
    placesQueriesMonthly: LimitValue;
    menuScansMonthly: LimitValue;
    receiptScansMonthly: LimitValue;
    storefrontReadsMonthly: LimitValue;
  };
  usage: {
    photoUploads: number;
    placesQueries: number;
    menuScans: number;
    receiptScans: number;
    storefrontReads: number;
  };
  remaining: {
    photoUploadsMonthly: LimitValue;
    placesQueriesMonthly: LimitValue;
    menuScansMonthly: LimitValue;
    receiptScansMonthly: LimitValue;
    storefrontReadsMonthly: LimitValue;
  };
}

export interface MonthlyUsageRequestOptions {
  signal?: AbortSignal;
  viewAsTier?: UsagePreviewTier;
}

export interface LimitExceededPayload {
  success: false;
  code: 'LIMIT_EXCEEDED';
  message: string;
  metric: string;
  limit: number;
  used: number;
  remaining: number;
  monthKey: string;
  userTier?: UserTier;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseLimitPayload(value: unknown): LimitExceededPayload | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    value.code !== 'LIMIT_EXCEEDED' ||
    typeof value.message !== 'string' ||
    typeof value.metric !== 'string' ||
    typeof value.limit !== 'number' ||
    typeof value.used !== 'number' ||
    typeof value.remaining !== 'number' ||
    typeof value.monthKey !== 'string'
  ) {
    return null;
  }

  return {
    success: false,
    code: 'LIMIT_EXCEEDED',
    message: value.message,
    metric: value.metric,
    limit: value.limit,
    used: value.used,
    remaining: value.remaining,
    monthKey: value.monthKey,
    userTier:
      value.userTier === 'admin' || value.userTier === 'subscriber' || value.userTier === 'free'
        ? value.userTier
        : undefined,
  };
}

export function parseLimitExceededError(error: unknown): LimitExceededPayload | null {
  if (isRecord(error)) {
    const direct = parseLimitPayload(error);
    if (direct) {
      return direct;
    }

    if ('data' in error) {
      const nested = parseLimitPayload(error.data);
      if (nested) {
        return nested;
      }
    }

    if ('response' in error && isRecord(error.response)) {
      const responsePayload = parseLimitPayload(error.response);
      if (responsePayload) {
        return responsePayload;
      }
      if ('data' in error.response) {
        const responseNested = parseLimitPayload(error.response.data);
        if (responseNested) {
          return responseNested;
        }
      }
    }
  }

  if (error instanceof Error) {
    try {
      const parsed = JSON.parse(error.message) as unknown;
      return parseLimitPayload(parsed);
    } catch {
      return null;
    }
  }

  return null;
}

export function formatLimitExceededMessage(payload: LimitExceededPayload): string {
  if (payload.metric === 'places_queries') {
    return `Search limit reached for this month (${payload.limit}).`;
  }

  if (payload.metric === 'menu_scans') {
    return `Menu scan limit reached for this month (${payload.limit}).`;
  }

  if (payload.metric === 'receipt_scans') {
    return `Receipt scan limit reached for this month (${payload.limit}).`;
  }

  if (payload.metric === 'storefront_reads') {
    return `Storefront read limit reached for this month (${payload.limit}).`;
  }

  if (payload.metric === 'photo_uploads') {
    return payload.message === 'Monthly photo upload limit reached.'
      ? `Photo upload limit reached (${payload.limit}).`
      : payload.message;
  }

  return payload.message;
}

export async function getMonthlyUsage(
  options?: MonthlyUsageRequestOptions,
): Promise<MonthlyUsageSnapshot> {
  const viewAsTier = options?.viewAsTier;
  const path = viewAsTier
    ? `/api/usage/monthly?view_as_tier=${encodeURIComponent(viewAsTier)}`
    : '/api/usage/monthly';

  return sendApiRequest<MonthlyUsageSnapshot>(path, {
    method: 'GET',
    signal: options?.signal,
  });
}
