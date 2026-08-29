import { File, UploadType, type UploadResult } from 'expo-file-system';
import { ClientResponseError } from 'pocketbase';

import { env } from '../../config/env';
import { pb } from '../../lib/pocketbase';
import type { MenuItemRecord } from './featureStore';
import { parseNativeUploadErrorResponse } from './nativeUploadResponse';
import { sendApiRequest } from './pocketbaseGateway';

interface ParseMenuImageInput {
  uri: string;
  name: string;
  mimeType: string;
  restaurantId?: string;
  restaurantName?: string;
  requestCorrelation?: string;
}

interface ParseMenuImageResponse {
  csv: string;
  sourceImageId?: string;
  verification?: {
    checked: boolean;
    matched: boolean | null;
    confidence: 'high' | 'medium' | 'low' | 'unknown';
    selectedRestaurantName?: string;
    observedRestaurantNames: string[];
    reason?: string;
  };
}

export type RestaurantNameExtractionResponse =
  | {
      found: true;
      options: {
        name: string;
        confidence: 'high' | 'medium' | 'low';
        reason?: string;
      }[];
      language?: string;
    }
  | {
      found: false;
      allText?: string;
    }
  | {
      error: 'NOT_RESTAURANT';
      reason?: string;
    };

interface CreateMenuReviewRequestInput {
  restaurantId: string;
  reason?: string;
}

interface CreateMenuReviewRequestResponse {
  id: string;
  restaurantId: string;
  status: 'pending' | 'reviewed' | 'dismissed';
  reason?: string;
  deduped: boolean;
  created?: string;
  updated?: string;
}

interface CreateMenuItemsFromScanInput {
  restaurantId: string;
  itemNames: string[];
  fallbackLabel?: string;
  sourceImageId?: string;
}

interface CreateMenuItemsFromScanResponse {
  createdItems: MenuItemRecord[];
  existingItems: MenuItemRecord[];
}

const PARSE_MENU_IMAGE_TIMEOUT_MS = 120_000;
const FIND_RESTAURANT_NAME_TIMEOUT_MS = 120_000;
const CREATE_MENU_ITEMS_FROM_SCAN_TIMEOUT_MS = 30_000;

async function runWithTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<T> {
  let didTimeout = false;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      operation(),
      new Promise<never>((_resolve, reject) => {
        timeoutId = setTimeout(() => {
          didTimeout = true;
          reject(new Error(timeoutMessage));
        }, timeoutMs);
      }),
    ]);
  } catch (error) {
    if (didTimeout) {
      throw new Error(timeoutMessage);
    }
    throw error;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

async function sendApiRequestWithTimeout<T>(
  path: string,
  init: Parameters<typeof sendApiRequest>[1],
  timeoutMs: number,
  timeoutMessage: string,
): Promise<T> {
  const controller = new AbortController();
  let didTimeout = false;
  const timeoutId = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, timeoutMs);

  try {
    return await sendApiRequest<T>(path, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (didTimeout) {
      throw new Error(timeoutMessage);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function parseMenuImage(input: ParseMenuImageInput): Promise<ParseMenuImageResponse> {
  const uploadResult = await runNativeUploadWithTimeout(
    (signal) => uploadMenuImage(input, signal),
    PARSE_MENU_IMAGE_TIMEOUT_MS,
    'Menu scanning took too long. Try again with a clearer or smaller photo.',
  );

  assertNativeImageUploadSucceeded(uploadResult, buildParseMenuUrl(), 'Menu scan failed.');
  return parseMenuImageUploadResponse(uploadResult.body);
}

export async function extractRestaurantNamesFromImage(
  input: ParseMenuImageInput,
): Promise<RestaurantNameExtractionResponse> {
  const uploadResult = await runWithTimeout(
    () => uploadRestaurantNameImage(input),
    FIND_RESTAURANT_NAME_TIMEOUT_MS,
    'Restaurant name extraction took too long. Try again with a clearer or smaller photo.',
  );

  assertNativeImageUploadSucceeded(uploadResult, buildFindRestaurantNameUrl(), 'Restaurant name extraction failed.');
  return parseRestaurantNameExtractionUploadResponse(uploadResult.body);
}

export async function createMenuReviewRequest(
  input: CreateMenuReviewRequestInput,
): Promise<CreateMenuReviewRequestResponse> {
  return sendApiRequest<CreateMenuReviewRequestResponse>('/api/menu-review-requests', {
    method: 'POST',
    body: input,
  });
}

export async function createMenuItemsFromScan(
  input: CreateMenuItemsFromScanInput,
): Promise<CreateMenuItemsFromScanResponse> {
  return sendApiRequestWithTimeout<CreateMenuItemsFromScanResponse>(
    '/api/menu-items/from-scan',
    {
      method: 'POST',
      body: input,
    },
    CREATE_MENU_ITEMS_FROM_SCAN_TIMEOUT_MS,
    'Menu items could not be saved before the request timed out. Try scanning again.',
  );
}

async function runNativeUploadWithTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<T> {
  const controller = new AbortController();
  let didTimeout = false;
  const timeoutId = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, timeoutMs);

  try {
    return await operation(controller.signal);
  } catch (error) {
    if (didTimeout) {
      throw new Error(timeoutMessage);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function uploadMenuImage(input: ParseMenuImageInput, signal: AbortSignal): Promise<UploadResult> {
  const file = new File(input.uri);
  return file.upload(buildParseMenuUrl(), {
    fieldName: 'image',
    headers: resolveNativeImageUploadHeaders(input),
    httpMethod: 'POST',
    mimeType: input.mimeType,
    parameters: buildParseMenuUploadParameters(input),
    sessionType: 'foreground',
    signal,
    uploadType: UploadType.MULTIPART,
  });
}

async function uploadRestaurantNameImage(input: ParseMenuImageInput): Promise<UploadResult> {
  const file = new File(input.uri);
  return file.upload(buildFindRestaurantNameUrl(), {
    fieldName: 'image',
    headers: resolveNativeImageUploadHeaders(input),
    httpMethod: 'POST',
    mimeType: input.mimeType,
    sessionType: 'foreground',
    uploadType: UploadType.MULTIPART,
  });
}

function buildParseMenuUploadParameters(
  input: Pick<ParseMenuImageInput, 'restaurantId' | 'restaurantName'>,
): Record<string, string> | undefined {
  const parameters: Record<string, string> = {};
  const restaurantId = input.restaurantId?.trim();
  const restaurantName = input.restaurantName?.trim();

  if (restaurantId) {
    parameters.restaurantId = restaurantId;
  }
  if (restaurantName) {
    parameters.restaurantName = restaurantName;
  }

  return Object.keys(parameters).length > 0 ? parameters : undefined;
}

function resolveNativeImageUploadHeaders(input: Pick<ParseMenuImageInput, 'requestCorrelation'>): Record<string, string> | undefined {
  const headers: Record<string, string> = {};
  const requestCorrelation = input.requestCorrelation?.trim();
  const authToken = pb.authStore.token?.trim();

  if (requestCorrelation) {
    headers['X-Request-ID'] = requestCorrelation;
  }
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  return Object.keys(headers).length > 0 ? headers : undefined;
}

function assertNativeImageUploadSucceeded(
  uploadResult: UploadResult,
  url: string,
  fallbackMessage: string,
): void {
  if (uploadResult.status >= 200 && uploadResult.status < 300) {
    return;
  }

  throw new ClientResponseError({
    response: parseNativeUploadErrorResponse(uploadResult.body, fallbackMessage),
    status: uploadResult.status,
    url,
  });
}

function parseMenuImageUploadResponse(body: string): ParseMenuImageResponse {
  const parsedBody = parseJsonObject(body);
  if (!parsedBody || !isParseMenuImageResponse(parsedBody)) {
    throw new Error('AI image parsing returned an invalid response.');
  }

  return parsedBody;
}

function parseRestaurantNameExtractionUploadResponse(
  body: string,
): RestaurantNameExtractionResponse {
  const parsedBody = parseJsonObject(body);
  if (!parsedBody || !isRestaurantNameExtractionResponse(parsedBody)) {
    throw new Error('AI image parsing returned an invalid response.');
  }

  return parsedBody;
}

function isParseMenuImageResponse(value: unknown): value is ParseMenuImageResponse {
  return (
    isRecord(value) &&
    typeof value.csv === 'string' &&
    isOptionalString(value.sourceImageId) &&
    (value.verification === undefined || isMenuVerification(value.verification))
  );
}

function isMenuVerification(
  value: unknown,
): value is NonNullable<ParseMenuImageResponse['verification']> {
  return (
    isRecord(value) &&
    typeof value.checked === 'boolean' &&
    (typeof value.matched === 'boolean' || value.matched === null) &&
    isMenuScanConfidence(value.confidence) &&
    isOptionalString(value.selectedRestaurantName) &&
    Array.isArray(value.observedRestaurantNames) &&
    value.observedRestaurantNames.every(isString) &&
    isOptionalString(value.reason)
  );
}

function isRestaurantNameExtractionResponse(
  value: unknown,
): value is RestaurantNameExtractionResponse {
  if (!isRecord(value)) {
    return false;
  }

  if (value.error !== undefined) {
    return (
      value.error === 'NOT_RESTAURANT' &&
      value.found === undefined &&
      isOptionalString(value.reason)
    );
  }

  if (value.found === true) {
    return (
      Array.isArray(value.options) &&
      value.options.every(isRestaurantNameOption) &&
      isOptionalString(value.language)
    );
  }

  return value.found === false && isOptionalString(value.allText);
}

function isRestaurantNameOption(
  value: unknown,
): value is Extract<RestaurantNameExtractionResponse, { found: true }>['options'][number] {
  return (
    isRecord(value) &&
    typeof value.name === 'string' &&
    isStorefrontConfidence(value.confidence) &&
    isOptionalString(value.reason)
  );
}

function isMenuScanConfidence(
  value: unknown,
): value is NonNullable<ParseMenuImageResponse['verification']>['confidence'] {
  return isStorefrontConfidence(value) || value === 'unknown';
}

function isStorefrontConfidence(
  value: unknown,
): value is Extract<
  RestaurantNameExtractionResponse,
  { found: true }
>['options'][number]['confidence'] {
  return value === 'high' || value === 'medium' || value === 'low';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function parseJsonObject(body: string): Record<string, unknown> | null {
  try {
    const parsedBody = JSON.parse(body) as unknown;
    if (parsedBody && typeof parsedBody === 'object' && !Array.isArray(parsedBody)) {
      return parsedBody as Record<string, unknown>;
    }
  } catch {
    // PocketBase normally returns JSON, but native uploads can surface plain text errors.
  }

  return null;
}

function buildFindRestaurantNameUrl(): string {
  return `${env.pocketbaseUrl.replace(/\/+$/, '')}/api/find-restaurant-name`;
}

function buildParseMenuUrl(): string {
  return `${env.pocketbaseUrl.replace(/\/+$/, '')}/api/parse-menu`;
}
