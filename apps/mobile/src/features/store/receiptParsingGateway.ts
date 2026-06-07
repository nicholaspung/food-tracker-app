import { File, UploadType, type UploadResult } from 'expo-file-system';
import { ClientResponseError } from 'pocketbase';

import { env } from '../../config/env';
import { pb } from '../../lib/pocketbase';

export type ReceiptScanConfidence = 'high' | 'medium' | 'low' | 'unknown';

export interface ReceiptScanItem {
  name: string;
  price: number;
  quantityText?: string;
  confidence: ReceiptScanConfidence;
  warning?: string;
}

export interface ReceiptScanDraftResult {
  requestCorrelation: string;
  restaurantName?: string;
  title?: string;
  items: ReceiptScanItem[];
  subtotal?: number;
  tax?: number;
  tip?: number;
  fees?: number;
  discount?: number;
  finalTotal?: number;
  confidence: ReceiptScanConfidence;
  warnings: string[];
}

interface ParseReceiptImageInput {
  uri: string;
  name: string;
  mimeType: string;
  requestCorrelation?: string;
}

const PARSE_RECEIPT_IMAGE_TIMEOUT_MS = 120_000;

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

async function uploadReceiptImage(input: ParseReceiptImageInput): Promise<UploadResult> {
  const file = new File(input.uri);
  return file.upload(buildParseReceiptUrl(), {
    fieldName: 'image',
    headers: resolveReceiptUploadHeaders(input),
    httpMethod: 'POST',
    mimeType: input.mimeType,
    sessionType: 'foreground',
    uploadType: UploadType.MULTIPART,
  });
}

export async function parseReceiptImage(
  input: ParseReceiptImageInput,
): Promise<ReceiptScanDraftResult> {
  const uploadResult = await runWithTimeout(
    () => uploadReceiptImage(input),
    PARSE_RECEIPT_IMAGE_TIMEOUT_MS,
    'Receipt scanning took too long. Try again with a clearer or smaller photo.',
  );

  assertReceiptUploadSucceeded(uploadResult);
  return parseReceiptUploadResponse(uploadResult.body);
}

function resolveReceiptUploadHeaders(input: ParseReceiptImageInput): Record<string, string> | undefined {
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

function assertReceiptUploadSucceeded(uploadResult: UploadResult): void {
  if (uploadResult.status >= 200 && uploadResult.status < 300) {
    return;
  }

  throw new ClientResponseError({
    response: parsePocketBaseUploadErrorResponse(uploadResult.body),
    status: uploadResult.status,
    url: buildParseReceiptUrl(),
  });
}

function parseReceiptUploadResponse(body: string): ReceiptScanDraftResult {
  const parsedBody = parseJsonObject(body);
  if (!parsedBody) {
    throw new Error('Receipt scan returned an invalid response.');
  }

  return parsedBody as unknown as ReceiptScanDraftResult;
}

function parsePocketBaseUploadErrorResponse(body: string): Record<string, unknown> {
  return parseJsonObject(body) ?? {
    data: {},
    message: body.trim() || 'Receipt scan failed.',
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

function buildParseReceiptUrl(): string {
  return `${env.pocketbaseUrl.replace(/\/+$/, '')}/api/parse-receipt`;
}
