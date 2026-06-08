import { localPersistence } from '../../localPersistence';
import type { RestaurantNameExtractionResponse } from './menuParsingGateway';

export interface StorefrontScanHistoryEntry {
  id: string;
  result: RestaurantNameExtractionResponse;
  scannedAt: string;
  source: 'camera' | 'gallery';
}

interface SaveStorefrontScanHistoryInput {
  result: RestaurantNameExtractionResponse;
  scannedAt?: string;
  source: StorefrontScanHistoryEntry['source'];
}

interface DeleteStorefrontScanHistoryOptionInput {
  entryId: string;
  optionIndex: number;
}

const STOREFRONT_SCAN_HISTORY_MAX_ENTRIES = 100;

export const STOREFRONT_SCAN_HISTORY_PAGE_SIZE = 20;

export function storefrontScanHistoryQueryKey(identityKey: string) {
  return ['feature', 'storefrontScanHistory', identityKey] as const;
}

export async function getStorefrontScanHistory(identityKey: string): Promise<StorefrontScanHistoryEntry[]> {
  const rawValue = await localPersistence.storefrontScanHistory.storage.getItem(
    localPersistence.storefrontScanHistory.buildStorageKey(identityKey),
  );
  if (!rawValue) {
    return [];
  }

  try {
    const parsedValue: unknown = JSON.parse(rawValue);
    if (!Array.isArray(parsedValue)) {
      return [];
    }

    return parsedValue
      .filter(isStorefrontScanHistoryEntry)
      .sort(compareStorefrontScanHistoryEntries)
      .slice(0, STOREFRONT_SCAN_HISTORY_MAX_ENTRIES);
  } catch {
    return [];
  }
}

export async function saveStorefrontScanHistoryEntry(
  identityKey: string,
  input: SaveStorefrontScanHistoryInput,
): Promise<StorefrontScanHistoryEntry[]> {
  const currentEntries = await getStorefrontScanHistory(identityKey);
  const scannedAt = input.scannedAt ?? new Date().toISOString();
  const nextEntry: StorefrontScanHistoryEntry = {
    id: buildStorefrontScanHistoryEntryId(scannedAt),
    result: input.result,
    scannedAt,
    source: input.source,
  };
  const nextEntries = [nextEntry, ...currentEntries]
    .sort(compareStorefrontScanHistoryEntries)
    .slice(0, STOREFRONT_SCAN_HISTORY_MAX_ENTRIES);

  await localPersistence.storefrontScanHistory.storage.setItem(
    localPersistence.storefrontScanHistory.buildStorageKey(identityKey),
    JSON.stringify(nextEntries),
  );

  return nextEntries;
}

export async function deleteStorefrontScanHistoryOption(
  identityKey: string,
  input: DeleteStorefrontScanHistoryOptionInput,
): Promise<StorefrontScanHistoryEntry[]> {
  const currentEntries = await getStorefrontScanHistory(identityKey);
  const nextEntries = removeStorefrontScanHistoryOption(currentEntries, input);

  await localPersistence.storefrontScanHistory.storage.setItem(
    localPersistence.storefrontScanHistory.buildStorageKey(identityKey),
    JSON.stringify(nextEntries),
  );

  return nextEntries;
}

export function removeStorefrontScanHistoryOption(
  entries: StorefrontScanHistoryEntry[],
  input: DeleteStorefrontScanHistoryOptionInput,
): StorefrontScanHistoryEntry[] {
  return entries.flatMap((entry) => {
    if (entry.id !== input.entryId || !('found' in entry.result) || !entry.result.found) {
      return [entry];
    }

    const nextOptions = entry.result.options.filter((_option, index) => index !== input.optionIndex);
    if (nextOptions.length === 0) {
      return [];
    }

    return [
      {
        ...entry,
        result: {
          ...entry.result,
          options: nextOptions,
        },
      },
    ];
  });
}

function buildStorefrontScanHistoryEntryId(scannedAt: string): string {
  return `storefront-scan-${scannedAt}-${Math.random().toString(36).slice(2, 10)}`;
}

function compareStorefrontScanHistoryEntries(
  left: StorefrontScanHistoryEntry,
  right: StorefrontScanHistoryEntry,
): number {
  return Date.parse(right.scannedAt) - Date.parse(left.scannedAt);
}

function isStorefrontScanHistoryEntry(value: unknown): value is StorefrontScanHistoryEntry {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<StorefrontScanHistoryEntry>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.scannedAt === 'string' &&
    (candidate.source === 'camera' || candidate.source === 'gallery') &&
    isRestaurantNameExtractionResponse(candidate.result)
  );
}

function isRestaurantNameExtractionResponse(value: unknown): value is RestaurantNameExtractionResponse {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<RestaurantNameExtractionResponse>;
  if ('error' in candidate) {
    return candidate.error === 'NOT_RESTAURANT';
  }

  if ('found' in candidate && candidate.found === true) {
    const options = (candidate as Extract<RestaurantNameExtractionResponse, { found: true }>).options;
    return Array.isArray(options);
  }

  return 'found' in candidate && candidate.found === false;
}
