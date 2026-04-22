import { resolveDateValue } from './dateFormatting';

export type EmailVerificationStatus = 'verified' | 'grace_period' | 'grace_expired';

export const EMAIL_VERIFICATION_GRACE_PERIOD_MS = 72 * 60 * 60 * 1000;

interface ResolveEmailVerificationAccessInput {
  verified: boolean;
  createdAt?: unknown;
  now?: number | Date;
}

export interface EmailVerificationAccess {
  status: EmailVerificationStatus;
  graceEndsAt: string | null;
}

function resolveTimestamp(now: number | Date): number {
  if (now instanceof Date) {
    return now.getTime();
  }

  return now;
}

export function resolveEmailVerificationAccess({
  verified,
  createdAt,
  now = Date.now(),
}: ResolveEmailVerificationAccessInput): EmailVerificationAccess {
  if (verified) {
    return {
      status: 'verified',
      graceEndsAt: null,
    };
  }

  const createdDate = resolveDateValue(createdAt);
  if (!createdDate) {
    return {
      status: 'grace_expired',
      graceEndsAt: null,
    };
  }

  const graceEndsAtDate = new Date(createdDate.getTime() + EMAIL_VERIFICATION_GRACE_PERIOD_MS);
  const graceEndsAtTimestamp = graceEndsAtDate.getTime();
  const currentTimestamp = resolveTimestamp(now);

  return {
    status: currentTimestamp < graceEndsAtTimestamp ? 'grace_period' : 'grace_expired',
    graceEndsAt: graceEndsAtDate.toISOString(),
  };
}

export function formatEmailVerificationRemainingTime(
  graceEndsAt: string | null,
  now: number | Date = Date.now(),
): string {
  const graceEndsAtDate = resolveDateValue(graceEndsAt);
  if (!graceEndsAtDate) {
    return 'Verification expires soon.';
  }

  const remainingMs = graceEndsAtDate.getTime() - resolveTimestamp(now);
  if (remainingMs <= 0) {
    return 'Verification deadline reached.';
  }

  const remainingDays = Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
  if (remainingDays >= 2) {
    return `${remainingDays} days left to verify.`;
  }

  const remainingHours = Math.ceil(remainingMs / (60 * 60 * 1000));
  if (remainingHours >= 2) {
    return `${remainingHours} hours left to verify.`;
  }

  const remainingMinutes = Math.ceil(remainingMs / (60 * 1000));
  if (remainingMinutes >= 2) {
    return `${remainingMinutes} minutes left to verify.`;
  }

  return 'Less than 1 minute left to verify.';
}
