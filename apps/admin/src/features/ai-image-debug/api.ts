import { pb } from '@/lib/pocketbase';

export type AiImageDebugMode = 'storefront' | 'menu-scan' | 'receipt-scan';

export interface AiImageDebugRunMetadata {
  requestId: string;
  endpoint: '/api/find-restaurant-name' | '/api/parse-menu' | '/api/parse-receipt';
  status: number | null;
  durationMs: number;
  fileName: string;
  fileType: string;
  fileSize: number;
}

export type StorefrontDebugResponse =
  | {
      found: true;
      options: {
        name: string;
        confidence: 'high' | 'medium' | 'low';
        reason?: string;
      }[];
      language?: string;
      debug?: unknown;
    }
  | {
      found: false;
      allText?: string;
      debug?: unknown;
    }
  | {
      error: 'NOT_RESTAURANT';
      reason?: string;
      debug?: unknown;
    };

export interface MenuScanDebugResponse {
  csv: string;
  verification?: {
    checked: boolean;
    matched: boolean | null;
    confidence: 'high' | 'medium' | 'low' | 'unknown';
    selectedRestaurantName?: string;
    observedRestaurantNames: string[];
    reason?: string;
  };
  debug?: unknown;
}

export interface ReceiptScanDebugResponse {
  requestCorrelation: string;
  restaurantName?: string;
  title?: string;
  items: {
    name: string;
    price: number;
    quantityText?: string;
    confidence: 'high' | 'medium' | 'low' | 'unknown';
    warning?: string;
  }[];
  subtotal?: number;
  tax?: number;
  tip?: number;
  fees?: number;
  discount?: number;
  finalTotal?: number;
  confidence: 'high' | 'medium' | 'low' | 'unknown';
  warnings: string[];
  debug?: unknown;
}

export interface AiImageDebugApiError extends Error {
  status: number | null;
  responseData: unknown;
}

interface StorefrontDebugInput {
  file: File;
  requestId: string;
}

interface MenuScanDebugInput extends StorefrontDebugInput {
  restaurantId?: string;
  restaurantName?: string;
}

function buildImageFormData(file: File) {
  const formData = new FormData();
  formData.append('image', file, file.name);
  return formData;
}

function readErrorStatus(error: unknown) {
  if (typeof error !== 'object' || error === null) {
    return null;
  }

  const status = (error as { status?: unknown }).status;
  if (typeof status === 'number') {
    return status;
  }

  const responseStatus = (error as { response?: { status?: unknown } }).response?.status;
  return typeof responseStatus === 'number' ? responseStatus : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isFetchResponse(value: Record<string, unknown>) {
  return (
    typeof value.status === 'number' &&
    typeof value.statusText === 'string' &&
    typeof value.ok === 'boolean'
  );
}

function readErrorResponseData(error: unknown) {
  if (!isRecord(error)) {
    return null;
  }

  const directData = error.data;
  if (directData !== undefined) {
    return directData;
  }

  const response = error.response;
  if (isRecord(response)) {
    if (isFetchResponse(response)) {
      return {
        status: response.status,
        statusText: response.statusText,
      };
    }

    const data = response.data;
    if (data !== undefined) {
      if (isRecord(data) && Object.keys(data).length > 0) {
        return data;
      }

      const hasEnvelopeMessage =
        typeof response.message === 'string' && response.message.trim().length > 0;
      if (!hasEnvelopeMessage) {
        return data;
      }
    }

    return response;
  }

  return null;
}

function readErrorMessage(error: unknown, fallbackMessage: string) {
  const responseData = readErrorResponseData(error);
  if (responseData && typeof responseData === 'object') {
    const message = (responseData as { message?: unknown; error?: unknown }).message;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }

    const errorMessage = (responseData as { error?: unknown }).error;
    if (typeof errorMessage === 'string' && errorMessage.trim()) {
      return errorMessage;
    }
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallbackMessage;
}

function toAiImageDebugApiError(error: unknown, fallbackMessage: string): AiImageDebugApiError {
  const wrappedError = new Error(readErrorMessage(error, fallbackMessage)) as AiImageDebugApiError;
  wrappedError.status = readErrorStatus(error);
  wrappedError.responseData = readErrorResponseData(error);
  return wrappedError;
}

export async function runStorefrontDebug(input: StorefrontDebugInput) {
  const formData = buildImageFormData(input.file);

  try {
    return await pb.send<StorefrontDebugResponse>('/api/find-restaurant-name', {
      method: 'POST',
      body: formData,
      headers: {
        'X-Request-ID': input.requestId,
      },
    });
  } catch (error) {
    throw toAiImageDebugApiError(error, 'Could not read storefront image.');
  }
}

export async function runMenuScanDebug(input: MenuScanDebugInput) {
  const formData = buildImageFormData(input.file);

  if (input.restaurantId?.trim()) {
    formData.append('restaurantId', input.restaurantId.trim());
  }
  if (input.restaurantName?.trim()) {
    formData.append('restaurantName', input.restaurantName.trim());
  }

  try {
    return await pb.send<MenuScanDebugResponse>('/api/parse-menu', {
      method: 'POST',
      body: formData,
      headers: {
        'X-Request-ID': input.requestId,
      },
    });
  } catch (error) {
    throw toAiImageDebugApiError(error, 'Could not scan menu image.');
  }
}

export async function runReceiptScanDebug(input: StorefrontDebugInput) {
  const formData = buildImageFormData(input.file);

  try {
    return await pb.send<ReceiptScanDebugResponse>('/api/parse-receipt', {
      method: 'POST',
      body: formData,
      headers: {
        'X-Request-ID': input.requestId,
      },
    });
  } catch (error) {
    throw toAiImageDebugApiError(error, 'Could not scan receipt image.');
  }
}
