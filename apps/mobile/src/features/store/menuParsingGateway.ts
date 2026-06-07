import { File, UploadType, type UploadResult } from 'expo-file-system';
import { ClientResponseError } from 'pocketbase';

import { env } from '../../config/env';
import { pb } from '../../lib/pocketbase';
import type { MenuItemRecord } from './featureStore';
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

function buildParseMenuFormData(input: ParseMenuImageInput): FormData {
  const formData = new FormData();
  formData.append('image', {
    uri: input.uri,
    name: input.name,
    type: input.mimeType,
  } as unknown as Blob);
  if (input.restaurantId?.trim()) {
    formData.append('restaurantId', input.restaurantId.trim());
  }
  if (input.restaurantName?.trim()) {
    formData.append('restaurantName', input.restaurantName.trim());
  }
  return formData;
}

export async function parseMenuImage(input: ParseMenuImageInput): Promise<ParseMenuImageResponse> {
  const formData = buildParseMenuFormData(input);
  const requestCorrelation = input.requestCorrelation?.trim();
  return sendApiRequestWithTimeout<ParseMenuImageResponse>(
    '/api/parse-menu',
    {
      method: 'POST',
      body: formData,
      headers: requestCorrelation ? { 'X-Request-ID': requestCorrelation } : undefined,
    },
    PARSE_MENU_IMAGE_TIMEOUT_MS,
    'Menu scanning took too long. Try again with a clearer or smaller photo.',
  );
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
  return parseNativeImageUploadResponse<RestaurantNameExtractionResponse>(uploadResult.body);
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
    response: parsePocketBaseUploadErrorResponse(uploadResult.body, fallbackMessage),
    status: uploadResult.status,
    url,
  });
}

function parseNativeImageUploadResponse<T>(body: string): T {
  const parsedBody = parseJsonObject(body);
  if (!parsedBody) {
    throw new Error('AI image parsing returned an invalid response.');
  }

  return parsedBody as unknown as T;
}

function parsePocketBaseUploadErrorResponse(body: string, fallbackMessage: string): Record<string, unknown> {
  return parseJsonObject(body) ?? {
    data: {},
    message: body.trim() || fallbackMessage,
  };
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
