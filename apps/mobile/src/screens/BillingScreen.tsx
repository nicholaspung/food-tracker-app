import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, View } from 'react-native';

import {
  BackHeaderScreenScaffold,
  FormResultBanner,
  StatusPill,
} from '../components/shared';
import { env } from '../config/env';
import {
  mapIapPurchaseForBillingSync,
  refreshAuthenticatedUserRecord,
  syncBillingPurchases,
  type BillingSyncSource,
  type BillingVerifiedPurchase,
} from '../features';
import {
  deepLinkToSubscriptionsCompat,
  getAvailablePurchasesCompat as queryAvailablePurchases,
  type IapProductSubscription,
  type IapPurchase,
  isExpoIapAvailable,
  useIAPCompat,
} from '../lib/expoIapCompat';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { useTheme } from '../theme';
import { Button, Card, Text } from '../ui';

type BillingScreenProps = NativeStackScreenProps<RootStackParamList, 'Billing'>;
type BillingPlanId = 'monthly' | 'yearly';
type BannerTone = 'info' | 'warning' | 'danger' | 'success';

const IAP_UNAVAILABLE_MESSAGE =
  'In-app purchases are unavailable in this build. Install a development build to manage subscriptions.';
const PRICING_COMING_SOON_NOTICE =
  'Paid subscription pricing is coming soon. For now, everyone stays on the free plan limits.';
const IS_PRICING_COMING_SOON = true;

interface BillingPlanOption {
  id: BillingPlanId;
  title: string;
  fallbackPriceLabel: string;
  detailLabel: string;
  productId: string;
  savingsLabel?: string;
}

interface ResultBannerState {
  message: string;
  tone: BannerTone;
}

const PLAN_COMPARISON_ROWS: {
  feature: string;
  freePlan: string;
  subscriberPlan: string;
}[] = [
  {
    feature: 'Price',
    freePlan: '$0',
    subscriberPlan: '$5/month or $50/year',
  },
  {
    feature: 'Monthly photo uploads',
    freePlan: 'Up to 5',
    subscriberPlan: 'Higher monthly limit',
  },
  {
    feature: 'Photos per item',
    freePlan: '1',
    subscriberPlan: 'Up to 20',
  },
  {
    feature: 'Food place searches',
    freePlan: 'Limited',
    subscriberPlan: 'Higher monthly limit',
  },
  {
    feature: 'Menu photo scans',
    freePlan: 'Limited',
    subscriberPlan: 'Higher monthly limit',
  },
];

function resolveManageSubscriptionUrl(): string | null {
  if (Platform.OS === 'ios') {
    return 'https://apps.apple.com/account/subscriptions';
  }

  if (Platform.OS === 'android') {
    return 'https://play.google.com/store/account/subscriptions';
  }

  return null;
}

function resolveAndroidOfferToken(subscription: IapProductSubscription | undefined): string | null {
  if (!subscription || subscription.platform !== 'android') {
    return null;
  }

  const standardizedOfferToken = subscription.subscriptionOffers.find((offer) => {
    return typeof offer.offerTokenAndroid === 'string' && offer.offerTokenAndroid.trim().length > 0;
  })?.offerTokenAndroid;

  if (standardizedOfferToken) {
    return standardizedOfferToken;
  }

  const legacyOfferToken = subscription.subscriptionOfferDetailsAndroid.find((offer) => {
    return typeof offer.offerToken === 'string' && offer.offerToken.trim().length > 0;
  })?.offerToken;

  return legacyOfferToken ?? null;
}

function buildPurchaseKey(input: {
  platform: 'ios' | 'android';
  productId: string;
  purchaseToken: string | null;
  transactionId: string | null;
}): string {
  return `${input.platform}:${input.productId}:${input.transactionId ?? ''}:${input.purchaseToken ?? ''}`;
}

function createPlanOptions(): BillingPlanOption[] {
  return [
    {
      id: 'monthly',
      title: 'Monthly',
      fallbackPriceLabel: '$5',
      detailLabel: 'per month',
      productId: env.iapMonthlyProductId.trim(),
    },
    {
      id: 'yearly',
      title: 'Yearly',
      fallbackPriceLabel: '$50',
      detailLabel: 'per year',
      productId: env.iapYearlyProductId.trim(),
      savingsLabel: 'Save $10/year',
    },
  ];
}

export function BillingScreen({ navigation }: BillingScreenProps) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { isOnline } = useConnectivity();
  const isIapAvailable = isExpoIapAvailable();
  const [selectedPlanId, setSelectedPlanId] = useState<BillingPlanId>('yearly');
  const [bannerState, setBannerState] = useState<ResultBannerState | null>(null);
  const [isSyncingBilling, setIsSyncingBilling] = useState(false);
  const isSubscriber = user?.isSubscriber === true;
  const isSubscriberStatusActive = !IS_PRICING_COMING_SOON && isSubscriber;
  const planOptions = useMemo(createPlanOptions, []);
  const productIds = useMemo(
    () =>
      planOptions
        .map((plan) => plan.productId)
        .filter((productId): productId is string => productId.length > 0),
    [planOptions],
  );

  const selectedPlan = useMemo(
    () => planOptions.find((plan) => plan.id === selectedPlanId) ?? planOptions[0],
    [planOptions, selectedPlanId],
  );

  const {
    connected,
    subscriptions,
    requestPurchase,
    restorePurchases,
    finishTransaction,
    fetchProducts,
    getAvailablePurchases,
  } = useIAPCompat({
    onError: (error) => {
      setBannerState({
        message: error.message,
        tone: 'danger',
      });
    },
    onPurchaseError: (error) => {
      trackObservabilityEvent('BILLING_PURCHASE_FAILED', {
        code: error.code ?? 'unknown_code',
        message: error.message,
        source: 'BillingScreen',
      });
      setBannerState({
        message: error.message || 'Could not complete purchase.',
        tone: 'danger',
      });
    },
  });

  const subscriptionsById = useMemo(() => {
    return new Map(subscriptions.map((subscription) => [subscription.id, subscription]));
  }, [subscriptions]);

  const selectedStoreSubscription = subscriptionsById.get(selectedPlan.productId);
  const selectedAndroidOfferToken = resolveAndroidOfferToken(selectedStoreSubscription);

  const syncAuthAndInvalidate = useCallback(async () => {
    await refreshAuthenticatedUserRecord();
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['feature', 'profile'] }),
      queryClient.invalidateQueries({ queryKey: ['feature', 'usage', 'monthly'] }),
    ]);
  }, [queryClient]);

  const syncPurchasesWithBackend = useCallback(
    async (purchases: IapPurchase[], source: BillingSyncSource) => {
      const syncResult = await syncBillingPurchases({
        source,
        purchases: purchases.map((purchase) => mapIapPurchaseForBillingSync(purchase)),
      });

      const verifiedPurchaseKeys = new Set(
        syncResult.verifiedPurchases.map((purchase: BillingVerifiedPurchase) =>
          buildPurchaseKey({
            platform: purchase.platform,
            productId: purchase.productId,
            purchaseToken: purchase.purchaseToken,
            transactionId: purchase.transactionId,
          }),
        ),
      );

      await Promise.all(
        purchases.map(async (purchase) => {
          const mappedPurchase = mapIapPurchaseForBillingSync(purchase);
          const key = buildPurchaseKey({
            platform: mappedPurchase.platform,
            productId: mappedPurchase.productId,
            purchaseToken: mappedPurchase.purchaseToken,
            transactionId: mappedPurchase.transactionId,
          });

          if (!verifiedPurchaseKeys.has(key)) {
            return;
          }

          await finishTransaction({
            purchase,
            isConsumable: false,
          });
        }),
      );

      await syncAuthAndInvalidate();

      return syncResult;
    },
    [finishTransaction, syncAuthAndInvalidate],
  );

  useEffect(() => {
    if (!isIapAvailable || !connected || productIds.length === 0) {
      return;
    }

    let isMounted = true;

    const loadProductsAndPurchases = async () => {
      try {
        await fetchProducts({
          skus: productIds,
          type: 'subs',
        });
        await getAvailablePurchases();
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setBannerState({
          message: error instanceof Error ? error.message : 'Could not load subscription products.',
          tone: 'danger',
        });
      }
    };

    void loadProductsAndPurchases();

    return () => {
      isMounted = false;
    };
  }, [connected, fetchProducts, getAvailablePurchases, isIapAvailable, productIds]);

  const handleBackPress = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    navigation.navigate('Profile');
  };

  const handlePlanSelect = (planId: BillingPlanId) => {
    if (IS_PRICING_COMING_SOON || isSubscriber || !isIapAvailable) {
      return;
    }

    setSelectedPlanId(planId);
    setBannerState(null);
    trackObservabilityEvent('BILLING_PLAN_SELECTED', {
      planId,
      source: 'BillingScreen',
    });
  };

  const handleSubscribePress = async () => {
    if (IS_PRICING_COMING_SOON) {
      setBannerState({
        message: PRICING_COMING_SOON_NOTICE,
        tone: 'info',
      });
      return;
    }

    if (!isIapAvailable) {
      setBannerState({
        message: IAP_UNAVAILABLE_MESSAGE,
        tone: 'warning',
      });
      return;
    }

    if (!isOnline) {
      setBannerState({
        message: 'Subscription actions require internet connection.',
        tone: 'warning',
      });
      return;
    }

    if (!connected) {
      setBannerState({
        message: 'Store connection is still initializing. Please try again.',
        tone: 'warning',
      });
      return;
    }

    if (!selectedPlan.productId) {
      setBannerState({
        message: 'Subscription product IDs are not configured.',
        tone: 'danger',
      });
      return;
    }

    setIsSyncingBilling(true);
    setBannerState(null);

    try {
      trackObservabilityEvent('BILLING_SUBSCRIBE_TAPPED', {
        planId: selectedPlan.id,
        productId: selectedPlan.productId,
        source: 'BillingScreen',
      });

      const purchaseResult = await requestPurchase({
        type: 'subs',
        request: {
          apple: {
            sku: selectedPlan.productId,
          },
          google: {
            skus: [selectedPlan.productId],
            subscriptionOffers: selectedAndroidOfferToken
              ? [
                  {
                    offerToken: selectedAndroidOfferToken,
                    sku: selectedPlan.productId,
                  },
                ]
              : undefined,
          },
        },
      });

      const purchases = purchaseResult
        ? Array.isArray(purchaseResult)
          ? purchaseResult
          : [purchaseResult]
        : [];

      const purchasesToSync =
        purchases.length > 0
          ? purchases
          : await queryAvailablePurchases({
              alsoPublishToEventListenerIOS: false,
              onlyIncludeActiveItemsIOS: true,
            });

      const syncResult = await syncPurchasesWithBackend(purchasesToSync, 'purchase');

      if (syncResult.verifiedPurchases.length > 0) {
        setBannerState({
          message: 'Subscription activated successfully.',
          tone: 'success',
        });
      } else {
        setBannerState({
          message:
            syncResult.message ||
            'Purchase completed but no active subscription was verified. Try Restore Purchases.',
          tone: 'warning',
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not complete purchase.';
      setBannerState({
        message,
        tone: 'danger',
      });
      trackObservabilityEvent('BILLING_PURCHASE_FAILED', {
        message,
        source: 'BillingScreen',
      });
    } finally {
      setIsSyncingBilling(false);
    }
  };

  const handleManageSubscriptionPress = async () => {
    if (IS_PRICING_COMING_SOON) {
      setBannerState({
        message: PRICING_COMING_SOON_NOTICE,
        tone: 'info',
      });
      return;
    }

    if (!isIapAvailable) {
      setBannerState({
        message: IAP_UNAVAILABLE_MESSAGE,
        tone: 'warning',
      });
      return;
    }

    if (!isOnline) {
      setBannerState({
        message: 'Subscription actions require internet connection.',
        tone: 'warning',
      });
      return;
    }

    try {
      if (Platform.OS === 'android') {
        const packageName =
          env.androidPackageName ||
          Constants.expoConfig?.android?.package ||
          '';

        if (!packageName) {
          const fallbackUrl = resolveManageSubscriptionUrl();
          if (!fallbackUrl) {
            throw new Error('Subscription management is not available on this platform.');
          }

          await Linking.openURL(fallbackUrl);
        } else {
          await deepLinkToSubscriptionsCompat({
            packageNameAndroid: packageName,
            skuAndroid: selectedPlan.productId,
          });
        }
      } else {
        await deepLinkToSubscriptionsCompat({});
      }

      trackObservabilityEvent('BILLING_MANAGE_SUBSCRIPTION_OPENED', {
        platform: Platform.OS,
        source: 'BillingScreen',
      });
    } catch (error) {
      setBannerState({
        message: error instanceof Error ? error.message : 'Could not open subscription settings.',
        tone: 'danger',
      });
    }
  };

  const handleRestorePurchasesPress = async () => {
    if (IS_PRICING_COMING_SOON) {
      setBannerState({
        message: PRICING_COMING_SOON_NOTICE,
        tone: 'info',
      });
      return;
    }

    if (!isIapAvailable) {
      setBannerState({
        message: IAP_UNAVAILABLE_MESSAGE,
        tone: 'warning',
      });
      return;
    }

    if (!isOnline) {
      setBannerState({
        message: 'Subscription actions require internet connection.',
        tone: 'warning',
      });
      return;
    }

    setIsSyncingBilling(true);
    setBannerState(null);

    try {
      trackObservabilityEvent('BILLING_RESTORE_TAPPED', {
        source: 'BillingScreen',
      });

      await restorePurchases();
      const availablePurchases = await queryAvailablePurchases({
        alsoPublishToEventListenerIOS: false,
        onlyIncludeActiveItemsIOS: true,
      });
      const syncResult = await syncPurchasesWithBackend(availablePurchases, 'restore');

      if (syncResult.verifiedPurchases.length > 0) {
        setBannerState({
          message: 'Purchases restored successfully.',
          tone: 'success',
        });
      } else {
        setBannerState({
          message: syncResult.message || 'No active subscription purchases were found to restore.',
          tone: 'info',
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not restore purchases.';
      setBannerState({
        message,
        tone: 'danger',
      });
      trackObservabilityEvent('BILLING_RESTORE_FAILED', {
        message,
        source: 'BillingScreen',
      });
    } finally {
      setIsSyncingBilling(false);
    }
  };

  const styles = StyleSheet.create({
    body: {
      gap: theme.spacing.md,
      paddingTop: theme.spacing.sm,
    },
    statusCard: {
      gap: theme.spacing.sm,
    },
    statusRow: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '700',
      lineHeight: 24,
    },
    planList: {
      gap: theme.spacing.sm,
    },
    planOption: {
      borderColor: theme.colors.border.default,
      borderRadius: theme.radii.md,
      borderWidth: 1,
      gap: theme.spacing.xxs,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
    },
    planOptionSelected: {
      backgroundColor: theme.colors.status.infoBg,
      borderColor: theme.colors.border.info,
    },
    planOptionDisabled: {
      opacity: 0.6,
    },
    planHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    planPriceRow: {
      alignItems: 'baseline',
      flexDirection: 'row',
      gap: theme.spacing.xxs,
    },
    planMeta: {
      color: theme.colors.text.muted,
      fontSize: 12,
      lineHeight: 16,
    },
    actions: {
      gap: theme.spacing.xs,
    },
    tableCard: {
      gap: theme.spacing.xs,
    },
    tableHeaderRow: {
      borderBottomColor: theme.colors.border.subtle,
      borderBottomWidth: 1,
      flexDirection: 'row',
      gap: theme.spacing.xs,
      paddingBottom: theme.spacing.xs,
    },
    tableRow: {
      borderBottomColor: theme.colors.border.subtle,
      borderBottomWidth: 1,
      flexDirection: 'row',
      gap: theme.spacing.xs,
      paddingVertical: theme.spacing.xs,
    },
    tableRowLast: {
      borderBottomWidth: 0,
      paddingBottom: 0,
    },
    tableFeatureCell: {
      flex: 1.2,
    },
    tableCell: {
      flex: 1,
    },
  });

  return (
    <BackHeaderScreenScaffold
      bodyStyle={styles.body}
      onBackPress={handleBackPress}
      subtitle="Manage your plan, usage limits, and purchases."
      title="Subscription & Billing"
    >
      {!isOnline ? (
        <Card tone="warning">
          <Text tone="warning">Subscription actions require internet connection.</Text>
        </Card>
      ) : null}

      {!IS_PRICING_COMING_SOON && !connected ? (
        <Card tone="muted">
          <Text tone="secondary">Connecting to the app store...</Text>
        </Card>
      ) : null}

      {!IS_PRICING_COMING_SOON && !isIapAvailable ? (
        <Card tone="warning">
          <Text tone="warning">{IAP_UNAVAILABLE_MESSAGE}</Text>
        </Card>
      ) : null}

      {bannerState ? <FormResultBanner message={bannerState.message} tone={bannerState.tone} /> : null}

      <Card style={styles.statusCard}>
        <View style={styles.statusRow}>
          <Text style={styles.sectionTitle}>
            {isSubscriberStatusActive ? 'You are a Subscriber' : 'You are on Free'}
          </Text>
          <StatusPill
            label={isSubscriberStatusActive ? 'Subscriber' : 'Free'}
            tone={isSubscriberStatusActive ? 'info' : 'muted'}
            variant={isSubscriberStatusActive ? 'solid' : 'soft'}
          />
        </View>
        <Text tone="secondary">
          {IS_PRICING_COMING_SOON
            ? 'Paid plans are not live yet, so your account currently uses free limits.'
            : isSubscriberStatusActive
              ? 'Your premium limits are active.'
              : 'Upgrade to unlock higher limits and fewer interruptions.'}
        </Text>
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Choose a Plan</Text>
        <View style={styles.planList}>
          {planOptions.map((plan) => {
            const isSelected = selectedPlan.id === plan.id;
            const storeSubscription = subscriptionsById.get(plan.productId);
            const displayedPrice = storeSubscription?.displayPrice || plan.fallbackPriceLabel;
            const isPlanSelectionDisabled = IS_PRICING_COMING_SOON || isSubscriber || !isIapAvailable;

            return (
              <Pressable
                accessibilityState={{
                  disabled: isPlanSelectionDisabled,
                  selected: isSelected,
                }}
                accessibilityRole="button"
                disabled={isPlanSelectionDisabled}
                key={plan.id}
                onPress={() => {
                  handlePlanSelect(plan.id);
                }}
                style={[
                  styles.planOption,
                  isSelected ? styles.planOptionSelected : null,
                  isPlanSelectionDisabled ? styles.planOptionDisabled : null,
                ]}
              >
                <View style={styles.planHeader}>
                  <Text variant="label">{plan.title}</Text>
                  {isSelected ? (
                    <Ionicons
                      color={theme.colors.text.info}
                      name="checkmark-circle"
                      size={18}
                    />
                  ) : null}
                </View>
                <View style={styles.planPriceRow}>
                  <Text variant="titleMd">{displayedPrice}</Text>
                  {!storeSubscription?.displayPrice ? <Text tone="secondary">{plan.detailLabel}</Text> : null}
                </View>
                {plan.savingsLabel ? <Text tone="success">{plan.savingsLabel}</Text> : null}
              </Pressable>
            );
          })}
        </View>

        <View style={styles.actions}>
          <Button
            disabled={
              IS_PRICING_COMING_SOON || !isIapAvailable || !isOnline || !connected || isSyncingBilling || isSubscriber
            }
            label={
              IS_PRICING_COMING_SOON ? 'Pricing coming soon' : isSubscriber ? 'Already Subscribed' : 'Subscribe now'
            }
            loading={isSyncingBilling}
            onPress={() => {
              void handleSubscribePress();
            }}
          />
          {!IS_PRICING_COMING_SOON ? (
            <Button
              disabled={!isIapAvailable || !isOnline || !connected || isSyncingBilling}
              label="Manage subscription"
              onPress={() => {
                void handleManageSubscriptionPress();
              }}
              variant="secondary"
            />
          ) : null}
          {!IS_PRICING_COMING_SOON ? (
            <Button
              disabled={!isIapAvailable || !isOnline || !connected || isSyncingBilling}
              label="Restore purchases"
              onPress={() => {
                void handleRestorePurchasesPress();
              }}
              variant="secondary"
            />
          ) : null}
        </View>
      </Card>

      <Card style={styles.tableCard}>
        <Text style={styles.sectionTitle}>Free vs Subscriber</Text>
        <View style={styles.tableHeaderRow}>
          <View style={styles.tableFeatureCell}>
            <Text variant="label">Feature</Text>
          </View>
          <View style={styles.tableCell}>
            <Text variant="label">Free</Text>
          </View>
          <View style={styles.tableCell}>
            <Text variant="label">Subscriber</Text>
          </View>
        </View>

        {PLAN_COMPARISON_ROWS.map((row, index) => (
          <View
            key={row.feature}
            style={[
              styles.tableRow,
              index === PLAN_COMPARISON_ROWS.length - 1 ? styles.tableRowLast : null,
            ]}
          >
            <View style={styles.tableFeatureCell}>
              <Text>{row.feature}</Text>
            </View>
            <View style={styles.tableCell}>
              <Text tone="secondary">{row.freePlan}</Text>
            </View>
            <View style={styles.tableCell}>
              <Text tone="secondary">{row.subscriberPlan}</Text>
            </View>
          </View>
        ))}
      </Card>

    </BackHeaderScreenScaffold>
  );
}
