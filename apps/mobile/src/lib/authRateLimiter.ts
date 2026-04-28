import AsyncStorage from '@react-native-async-storage/async-storage';

import { getEnvironmentStorageKey } from '../config/persistence';
import { logger } from './logger';

export type AuthRateLimitFlow =
  | 'login'
  | 'signup'
  | 'waitlist'
  | 'password_reset_request'
  | 'password_reset_resend'
  | 'password_reset_confirm'
  | 'email_verification_resend';

export interface AuthRateLimitState {
  flow: AuthRateLimitFlow;
  key: string;
  failedAttempts: number;
  blockedUntil: number;
  lastAttemptAt: number;
}

export interface AuthRateLimitDecision {
  allowed: boolean;
  remainingMs: number;
  message: string | null;
  failedAttempts: number;
}

const AUTH_RATE_LIMIT_STORAGE_KEY = getEnvironmentStorageKey('food_tracker_auth_rate_limiter_v1');
const SERVER_RATE_LIMIT_COOLDOWN_MS = 15 * 60_000;

type AuthRateLimitStore = Record<string, AuthRateLimitState>;
interface AuthRateLimitStoreReadResult {
  store: AuthRateLimitStore;
  storageAvailable: boolean;
}

function normalizeIdentifier(identifier?: string): string {
  return identifier?.trim().toLowerCase() || 'anonymous';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isAuthRateLimitFlow(value: unknown): value is AuthRateLimitFlow {
  return (
    value === 'login' ||
    value === 'signup' ||
    value === 'waitlist' ||
    value === 'password_reset_request' ||
    value === 'password_reset_resend' ||
    value === 'password_reset_confirm' ||
    value === 'email_verification_resend'
  );
}

function normalizeState(value: unknown): AuthRateLimitState | null {
  if (!isRecord(value) || !isAuthRateLimitFlow(value.flow) || typeof value.key !== 'string') {
    return null;
  }

  const failedAttempts = typeof value.failedAttempts === 'number' ? value.failedAttempts : 0;
  const blockedUntil = typeof value.blockedUntil === 'number' ? value.blockedUntil : 0;
  const lastAttemptAt = typeof value.lastAttemptAt === 'number' ? value.lastAttemptAt : 0;

  if (
    !Number.isFinite(failedAttempts) ||
    !Number.isFinite(blockedUntil) ||
    !Number.isFinite(lastAttemptAt)
  ) {
    return null;
  }

  return {
    flow: value.flow,
    key: value.key,
    failedAttempts: Math.max(0, Math.floor(failedAttempts)),
    blockedUntil: Math.max(0, blockedUntil),
    lastAttemptAt: Math.max(0, lastAttemptAt),
  };
}

function resolveCooldownMs(failedAttempts: number): number {
  if (failedAttempts <= 2) {
    return 0;
  }

  if (failedAttempts === 3) {
    return 30_000;
  }

  if (failedAttempts === 4) {
    return 60_000;
  }

  if (failedAttempts === 5) {
    return 5 * 60_000;
  }

  return SERVER_RATE_LIMIT_COOLDOWN_MS;
}

function buildDecision(state: AuthRateLimitState | null, now = Date.now()): AuthRateLimitDecision {
  if (!state) {
    return {
      allowed: true,
      failedAttempts: 0,
      message: null,
      remainingMs: 0,
    };
  }

  const remainingMs = Math.max(0, state.blockedUntil - now);

  return {
    allowed: remainingMs === 0,
    failedAttempts: state.failedAttempts,
    message: remainingMs > 0 ? `Too many attempts. Try again in ${formatAuthRateLimitCountdown(remainingMs)}.` : null,
    remainingMs,
  };
}

async function readStore(): Promise<AuthRateLimitStoreReadResult> {
  try {
    const raw = await AsyncStorage.getItem(AUTH_RATE_LIMIT_STORAGE_KEY);
    if (!raw) {
      return {
        storageAvailable: true,
        store: {},
      };
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) {
      return {
        storageAvailable: true,
        store: {},
      };
    }

    const now = Date.now();
    const store: AuthRateLimitStore = {};

    for (const [key, value] of Object.entries(parsed)) {
      const state = normalizeState(value);
      if (!state) {
        continue;
      }

      store[key] = {
        ...state,
        blockedUntil: state.blockedUntil <= now ? 0 : state.blockedUntil,
      };
    }

    return {
      storageAvailable: true,
      store,
    };
  } catch (error) {
    logger.warn('[AuthRateLimiter] Failed to read persisted state:', error);
    return {
      storageAvailable: false,
      store: {},
    };
  }
}

async function writeStore(store: AuthRateLimitStore): Promise<boolean> {
  try {
    const entries = Object.entries(store).filter(
      ([, state]) => state.failedAttempts > 0 || state.blockedUntil > Date.now(),
    );

    if (entries.length === 0) {
      await AsyncStorage.removeItem(AUTH_RATE_LIMIT_STORAGE_KEY);
      return true;
    }

    await AsyncStorage.setItem(AUTH_RATE_LIMIT_STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)));
    return true;
  } catch (error) {
    logger.warn('[AuthRateLimiter] Failed to persist state:', error);
    return false;
  }
}

export function buildAuthRateLimitKey(flow: AuthRateLimitFlow, identifier?: string): string {
  return `${flow}:${normalizeIdentifier(identifier)}`;
}

export async function checkAuthRateLimit(
  flow: AuthRateLimitFlow,
  identifier?: string,
): Promise<AuthRateLimitDecision> {
  const { storageAvailable, store } = await readStore();
  if (!storageAvailable) {
    return buildDecision(null);
  }

  const key = buildAuthRateLimitKey(flow, identifier);
  const state = store[key] ?? null;
  const decision = buildDecision(state);

  if (state && state.blockedUntil > 0 && decision.allowed) {
    store[key] = {
      ...state,
      blockedUntil: 0,
    };
    await writeStore(store);
  }

  return decision;
}

export async function recordAuthRateLimitFailure(
  flow: AuthRateLimitFlow,
  identifier?: string,
): Promise<AuthRateLimitDecision> {
  const now = Date.now();
  const { storageAvailable, store } = await readStore();
  if (!storageAvailable) {
    return buildDecision(null, now);
  }

  const key = buildAuthRateLimitKey(flow, identifier);
  const current = store[key];
  const failedAttempts = (current?.failedAttempts ?? 0) + 1;
  const cooldownMs = resolveCooldownMs(failedAttempts);
  const blockedUntil = cooldownMs > 0 ? now + cooldownMs : 0;
  const nextState: AuthRateLimitState = {
    flow,
    key,
    failedAttempts,
    blockedUntil,
    lastAttemptAt: now,
  };

  store[key] = nextState;
  const didWrite = await writeStore(store);
  if (!didWrite) {
    return buildDecision(null, now);
  }

  return buildDecision(nextState, now);
}

export async function recordAuthRateLimitSuccess(
  flow: AuthRateLimitFlow,
  identifier?: string,
): Promise<void> {
  const { storageAvailable, store } = await readStore();
  if (!storageAvailable) {
    return;
  }

  const key = buildAuthRateLimitKey(flow, identifier);

  if (!store[key]) {
    return;
  }

  delete store[key];
  await writeStore(store);
}

export async function recordServerAuthRateLimit(
  flow: AuthRateLimitFlow,
  identifier?: string,
): Promise<AuthRateLimitDecision> {
  const now = Date.now();
  const { storageAvailable, store } = await readStore();
  if (!storageAvailable) {
    return buildDecision(null, now);
  }

  const key = buildAuthRateLimitKey(flow, identifier);
  const current = store[key];
  const nextBlockedUntil = Math.max(current?.blockedUntil ?? 0, now + SERVER_RATE_LIMIT_COOLDOWN_MS);
  const nextState: AuthRateLimitState = {
    flow,
    key,
    failedAttempts: Math.max(current?.failedAttempts ?? 0, 6),
    blockedUntil: nextBlockedUntil,
    lastAttemptAt: now,
  };

  store[key] = nextState;
  const didWrite = await writeStore(store);
  if (!didWrite) {
    return buildDecision(null, now);
  }

  return buildDecision(nextState, now);
}

export async function recordAuthRateLimitCooldown(
  flow: AuthRateLimitFlow,
  identifier: string | undefined,
  cooldownMs: number,
): Promise<AuthRateLimitDecision> {
  const now = Date.now();
  const { storageAvailable, store } = await readStore();
  if (!storageAvailable) {
    return buildDecision(null, now);
  }

  const key = buildAuthRateLimitKey(flow, identifier);
  const current = store[key];
  const nextState: AuthRateLimitState = {
    flow,
    key,
    failedAttempts: current?.failedAttempts ?? 0,
    blockedUntil: Math.max(current?.blockedUntil ?? 0, now + Math.max(0, cooldownMs)),
    lastAttemptAt: current?.lastAttemptAt ?? now,
  };

  store[key] = nextState;
  const didWrite = await writeStore(store);
  if (!didWrite) {
    return buildDecision(null, now);
  }

  return buildDecision(nextState, now);
}

export function formatAuthRateLimitCountdown(remainingMs: number): string {
  const remainingSeconds = Math.max(1, Math.ceil(remainingMs / 1000));

  if (remainingSeconds < 60) {
    return `${remainingSeconds} second${remainingSeconds === 1 ? '' : 's'}`;
  }

  const remainingMinutes = Math.ceil(remainingSeconds / 60);
  return `${remainingMinutes} minute${remainingMinutes === 1 ? '' : 's'}`;
}

function extractErrorText(error: unknown): string {
  const parts: string[] = [];

  if (error instanceof Error) {
    parts.push(error.message);
  }

  if (isRecord(error)) {
    if (typeof error.message === 'string') {
      parts.push(error.message);
    }

    if (isRecord(error.response)) {
      if (typeof error.response.message === 'string') {
        parts.push(error.response.message);
      }

      if (isRecord(error.response.data)) {
        for (const value of Object.values(error.response.data)) {
          if (isRecord(value) && typeof value.message === 'string') {
            parts.push(value.message);
          }
        }
      }
    }
  }

  return parts.join(' ');
}

export function isAuthRateLimitError(error: unknown): boolean {
  if (isRecord(error) && error.status === 429) {
    return true;
  }

  return /rate|too many|try again later|already requested/i.test(extractErrorText(error));
}
