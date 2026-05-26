import { sendApiRequest } from './pocketbaseGateway';

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

function buildParseReceiptFormData(input: ParseReceiptImageInput): FormData {
  const formData = new FormData();
  formData.append('image', {
    uri: input.uri,
    name: input.name,
    type: input.mimeType,
  } as unknown as Blob);
  return formData;
}

export async function parseReceiptImage(
  input: ParseReceiptImageInput,
): Promise<ReceiptScanDraftResult> {
  const formData = buildParseReceiptFormData(input);
  const requestCorrelation = input.requestCorrelation?.trim();

  return sendApiRequestWithTimeout<ReceiptScanDraftResult>(
    '/api/parse-receipt',
    {
      method: 'POST',
      body: formData,
      headers: requestCorrelation ? { 'X-Request-ID': requestCorrelation } : undefined,
    },
    PARSE_RECEIPT_IMAGE_TIMEOUT_MS,
    'Receipt scanning took too long. Try again with a clearer or smaller photo.',
  );
}
