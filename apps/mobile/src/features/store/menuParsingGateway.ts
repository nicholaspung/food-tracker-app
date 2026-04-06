import type { MenuItemRecord } from './featureStore';
import { sendApiRequest } from './pocketbaseGateway';

interface ParseMenuImageInput {
  uri: string;
  name: string;
  mimeType: string;
}

interface ParseMenuImageResponse {
  csv: string;
}

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
  return formData;
}

export async function parseMenuImage(input: ParseMenuImageInput): Promise<ParseMenuImageResponse> {
  const formData = buildParseMenuFormData(input);
  return sendApiRequest<ParseMenuImageResponse>('/api/parse-menu', {
    method: 'POST',
    body: formData,
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
