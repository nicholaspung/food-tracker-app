import { useMemo } from 'react';
import { NativeModules } from 'react-native';

export interface IapProductSubscription {
  id: string;
  platform: string;
  displayPrice?: string;
  subscriptionOffers: { offerTokenAndroid?: string | null }[];
  subscriptionOfferDetailsAndroid: { offerToken?: string | null }[];
}

export interface IapPurchase {
  platform: unknown;
  productId: string;
  purchaseState?: unknown;
  purchaseToken?: string | null;
  transactionId?: string | null;
  transactionDate?: number | null;
  store?: unknown;
}

interface UseIAPOptions {
  onError?: (error: { message: string }) => void;
  onPurchaseError?: (error: { code?: string; message: string }) => void;
}

interface UseIAPResult {
  connected: boolean;
  subscriptions: IapProductSubscription[];
  requestPurchase: (request: unknown) => Promise<IapPurchase | IapPurchase[] | null | undefined>;
  restorePurchases: () => Promise<void>;
  finishTransaction: (request: unknown) => Promise<void>;
  fetchProducts: (request: unknown) => Promise<void>;
  getAvailablePurchases: () => Promise<IapPurchase[]>;
}

interface ExpoIapModule {
  useIAP: (options: UseIAPOptions) => UseIAPResult;
  getAvailablePurchases: (options?: GetAvailablePurchasesOptions) => Promise<IapPurchase[]>;
  deepLinkToSubscriptions: (options?: DeepLinkToSubscriptionsOptions) => Promise<void>;
}

let cachedExpoIapModule: ExpoIapModule | null | undefined;

const IAP_UNAVAILABLE_MESSAGE =
  'In-app purchases are unavailable in this build. Install a development build to manage subscriptions.';

function createIapUnavailableError(): Error {
  return new Error(IAP_UNAVAILABLE_MESSAGE);
}

function resolveExpoIapModule(): ExpoIapModule | null {
  if (cachedExpoIapModule !== undefined) {
    return cachedExpoIapModule;
  }

  if (!hasExpoIapNativeModule()) {
    cachedExpoIapModule = null;
    return cachedExpoIapModule;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const module = require('expo-iap') as ExpoIapModule;
    cachedExpoIapModule = module;
  } catch {
    cachedExpoIapModule = null;
  }

  return cachedExpoIapModule;
}

function hasExpoIapNativeModule(): boolean {
  const nativeModulesRecord = NativeModules as Record<string, unknown>;
  if (nativeModulesRecord.ExpoIap) {
    return true;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const expoModulesCore = require('expo-modules-core') as {
      requireOptionalNativeModule?: (name: string) => unknown;
    };
    return expoModulesCore.requireOptionalNativeModule?.('ExpoIap') != null;
  } catch {
    return false;
  }
}

export function isExpoIapAvailable(): boolean {
  return resolveExpoIapModule() !== null;
}

const emptySubscriptions: IapProductSubscription[] = [];

function useUnavailableIAP(_options: UseIAPOptions): UseIAPResult {
  return useMemo(
    () =>
      ({
        connected: false,
        subscriptions: emptySubscriptions,
        requestPurchase: async () => {
          throw createIapUnavailableError();
        },
        restorePurchases: async () => {
          throw createIapUnavailableError();
        },
        finishTransaction: async () => undefined,
        fetchProducts: async () => undefined,
        getAvailablePurchases: async () => [],
      }) as unknown as UseIAPResult,
    [],
  );
}

export function useIAPCompat(options: UseIAPOptions): UseIAPResult {
  const module = resolveExpoIapModule();
  const useIAPHook = module?.useIAP ?? useUnavailableIAP;
  return useIAPHook(options);
}

interface GetAvailablePurchasesOptions {
  alsoPublishToEventListenerIOS?: boolean;
  onlyIncludeActiveItemsIOS?: boolean;
}

export async function getAvailablePurchasesCompat(
  options?: GetAvailablePurchasesOptions,
): Promise<IapPurchase[]> {
  const module = resolveExpoIapModule();
  if (!module) {
    return [];
  }

  return module.getAvailablePurchases(options);
}

interface DeepLinkToSubscriptionsOptions {
  packageNameAndroid?: string;
  skuAndroid?: string;
}

export async function deepLinkToSubscriptionsCompat(
  options?: DeepLinkToSubscriptionsOptions,
): Promise<void> {
  const module = resolveExpoIapModule();
  if (!module) {
    throw createIapUnavailableError();
  }

  await module.deepLinkToSubscriptions(options ?? {});
}
