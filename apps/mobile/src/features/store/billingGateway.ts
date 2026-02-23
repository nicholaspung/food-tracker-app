import { sendApiRequest } from './pocketbaseGateway';

export type BillingSyncSource = 'purchase' | 'restore';

export interface BillingPurchasePayload {
  platform: 'ios' | 'android';
  productId: string;
  purchaseState: string | null;
  purchaseToken: string | null;
  transactionId: string | null;
  transactionDate: number | null;
  store: string | null;
}

export interface BillingSyncRequest {
  source: BillingSyncSource;
  purchases: BillingPurchasePayload[];
}

export interface BillingVerifiedPurchase {
  platform: 'ios' | 'android';
  productId: string;
  purchaseToken: string | null;
  transactionId: string | null;
}

export interface BillingSyncResponse {
  isSubscriber: boolean;
  ignoredCount: number;
  message: string;
  verifiedPurchases: BillingVerifiedPurchase[];
}

interface BillingGatewayPurchase {
  platform: unknown;
  productId: string;
  purchaseState?: unknown;
  purchaseToken?: string | null;
  transactionId?: string | null;
  transactionDate?: number | null;
  store?: unknown;
}

function normalizeBillingPlatform(value: unknown): 'ios' | 'android' {
  if (typeof value === 'string' && value.toLowerCase() === 'android') {
    return 'android';
  }

  return 'ios';
}

export function mapIapPurchaseForBillingSync(purchase: BillingGatewayPurchase): BillingPurchasePayload {
  return {
    platform: normalizeBillingPlatform(purchase.platform),
    productId: purchase.productId,
    purchaseState: typeof purchase.purchaseState === 'string' ? purchase.purchaseState : null,
    purchaseToken: purchase.purchaseToken ?? null,
    transactionId: purchase.transactionId ?? null,
    transactionDate: typeof purchase.transactionDate === 'number' ? purchase.transactionDate : null,
    store: typeof purchase.store === 'string' ? purchase.store : null,
  };
}

export async function syncBillingPurchases(
  request: BillingSyncRequest,
): Promise<BillingSyncResponse> {
  return sendApiRequest<BillingSyncResponse>('/api/billing/sync', {
    method: 'POST',
    body: request,
  });
}
