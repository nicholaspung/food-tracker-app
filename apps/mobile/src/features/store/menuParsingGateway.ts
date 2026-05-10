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
}

interface CreateMenuItemsFromScanResponse {
  createdItems: MenuItemRecord[];
  existingItems: MenuItemRecord[];
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
  return sendApiRequest<ParseMenuImageResponse>('/api/parse-menu', {
    method: 'POST',
    body: formData,
    headers: requestCorrelation ? { 'X-Request-ID': requestCorrelation } : undefined,
  });
}

export async function extractRestaurantNamesFromImage(
  input: ParseMenuImageInput,
): Promise<RestaurantNameExtractionResponse> {
  const formData = buildParseMenuFormData(input);
  const requestCorrelation = input.requestCorrelation?.trim();
  return sendApiRequest<RestaurantNameExtractionResponse>('/api/find-restaurant-name', {
    method: 'POST',
    body: formData,
    headers: requestCorrelation ? { 'X-Request-ID': requestCorrelation } : undefined,
  });
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
  return sendApiRequest<CreateMenuItemsFromScanResponse>('/api/menu-items/from-scan', {
    method: 'POST',
    body: input,
  });
}
