import { sendApiRequest } from './pocketbaseGateway';

export type BillingPlanId = 'monthly' | 'yearly';

export interface BillingCheckoutSessionRequest {
  planId: BillingPlanId;
  returnUrl: string;
}

export interface BillingPortalSessionRequest {
  returnUrl: string;
}

export interface BillingSessionResponse {
  url: string;
}

export async function createStripeCheckoutSession(
  request: BillingCheckoutSessionRequest,
): Promise<BillingSessionResponse> {
  return sendApiRequest<BillingSessionResponse>('/api/billing/checkout-session', {
    method: 'POST',
    body: request,
  });
}

export async function createStripePortalSession(
  request: BillingPortalSessionRequest,
): Promise<BillingSessionResponse> {
  return sendApiRequest<BillingSessionResponse>('/api/billing/portal-session', {
    method: 'POST',
    body: request,
  });
}
