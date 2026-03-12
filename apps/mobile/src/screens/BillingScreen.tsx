import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import {
  BackHeaderScreenScaffold,
  FormResultBanner,
  SectionCard,
  StatusPill,
} from '../components/shared';
import {
  createStripeCheckoutSession,
  createStripePortalSession,
  refreshAuthenticatedUserRecord,
  type BillingPlanId,
} from '../features';
import { formatDisplayDate } from '../lib/dateFormatting';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { useTheme } from '../theme';
import { Button, Text } from '../ui';

type BillingScreenProps = NativeStackScreenProps<RootStackParamList, 'Billing'>;
type BannerTone = 'info' | 'warning' | 'danger' | 'success';

interface BillingPlanOption {
  id: BillingPlanId;
  label: string;
  priceLabel: string;
  cadenceLabel: string;
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

function createPlanOptions(): BillingPlanOption[] {
  return [
    {
      id: 'monthly',
      label: 'Monthly',
      priceLabel: '$5',
      cadenceLabel: 'per month',
    },
    {
      id: 'yearly',
      label: 'Yearly',
      priceLabel: '$50',
      cadenceLabel: 'per year',
      savingsLabel: 'Save $10/year',
    },
  ];
}

function getCurrentBillingPageUrl(): string {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return '';
  }

  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.delete('billing');
  nextUrl.searchParams.delete('session_id');
  return nextUrl.toString();
}

function redirectToExternalUrl(url: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.location.assign(url);
    return;
  }

  throw new Error('Stripe billing is only available on web.');
}

function readBillingQueryParam(): string | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return null;
  }

  return new URL(window.location.href).searchParams.get('billing');
}

function clearBillingQueryParam() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return;
  }

  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.delete('billing');
  nextUrl.searchParams.delete('session_id');
  window.history.replaceState({}, '', nextUrl.toString());
}

export function BillingScreen({ navigation }: BillingScreenProps) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { isOnline } = useConnectivity();
  const [selectedPlanId, setSelectedPlanId] = useState<BillingPlanId>('yearly');
  const [bannerState, setBannerState] = useState<ResultBannerState | null>(null);
  const isSubscriber = user?.isSubscriber === true;
  const planOptions = useMemo(createPlanOptions, []);
  const selectedPlan = useMemo(
    () => planOptions.find((plan) => plan.id === selectedPlanId) ?? planOptions[0],
    [planOptions, selectedPlanId],
  );

  useEffect(() => {
    if (Platform.OS !== 'web') {
      return;
    }

    const billingState = readBillingQueryParam();
    if (!billingState) {
      return;
    }

    let isMounted = true;

    const syncSubscriptionState = async () => {
      try {
        if (billingState === 'success') {
          await refreshAuthenticatedUserRecord();
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['feature', 'profile'] }),
            queryClient.invalidateQueries({ queryKey: ['feature', 'usage', 'monthly'] }),
          ]);
        }

        if (!isMounted) {
          return;
        }

        setBannerState({
          message:
            billingState === 'success'
              ? 'Stripe checkout completed. Your subscription status has been refreshed.'
              : 'Stripe checkout was canceled.',
          tone: billingState === 'success' ? 'success' : 'info',
        });
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setBannerState({
          message:
            error instanceof Error
              ? error.message
              : 'Stripe checkout completed, but the account status could not be refreshed yet.',
          tone: 'warning',
        });
      } finally {
        clearBillingQueryParam();
      }
    };

    void syncSubscriptionState();

    return () => {
      isMounted = false;
    };
  }, [queryClient]);

  const checkoutMutation = useMutation({
    mutationFn: async (planId: BillingPlanId) => {
      return createStripeCheckoutSession({
        planId,
        returnUrl: getCurrentBillingPageUrl(),
      });
    },
    onSuccess: (result, planId) => {
      trackObservabilityEvent('BILLING_CHECKOUT_STARTED', {
        planId,
        provider: 'stripe',
        source: 'BillingScreen',
      });
      redirectToExternalUrl(result.url);
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Could not start Stripe checkout.';
      setBannerState({
        message,
        tone: 'danger',
      });
      trackObservabilityEvent('BILLING_CHECKOUT_FAILED', {
        message,
        provider: 'stripe',
        source: 'BillingScreen',
      });
    },
  });

  const portalMutation = useMutation({
    mutationFn: async () => {
      return createStripePortalSession({
        returnUrl: getCurrentBillingPageUrl(),
      });
    },
    onSuccess: (result) => {
      trackObservabilityEvent('BILLING_PORTAL_OPENED', {
        provider: 'stripe',
        source: 'BillingScreen',
      });
      redirectToExternalUrl(result.url);
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Could not open the Stripe billing portal.';
      setBannerState({
        message,
        tone: 'danger',
      });
      trackObservabilityEvent('BILLING_PORTAL_FAILED', {
        message,
        provider: 'stripe',
        source: 'BillingScreen',
      });
    },
  });

  const handleBackPress = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    navigation.navigate('Profile');
  };

  const handlePlanSelect = (planId: BillingPlanId) => {
    if (isSubscriber) {
      return;
    }

    setSelectedPlanId(planId);
    setBannerState(null);
    trackObservabilityEvent('BILLING_PLAN_SELECTED', {
      planId,
      provider: 'stripe',
      source: 'BillingScreen',
    });
  };

  const handleSubscribePress = async () => {
    if (!isOnline) {
      setBannerState({
        message: 'Subscription actions require internet connection.',
        tone: 'warning',
      });
      return;
    }

    setBannerState(null);
    await checkoutMutation.mutateAsync(selectedPlan.id);
  };

  const handleManageSubscriptionPress = async () => {
    if (!isOnline) {
      setBannerState({
        message: 'Subscription actions require internet connection.',
        tone: 'warning',
      });
      return;
    }

    setBannerState(null);
    await portalMutation.mutateAsync();
  };

  const styles = StyleSheet.create({
    body: {
      gap: theme.spacing.md,
      paddingTop: theme.spacing.sm,
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
    actions: {
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
    providerMeta: {
      color: theme.colors.text.secondary,
      lineHeight: 20,
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
        <SectionCard title="Connection required">
          <Text tone="warning">Subscription actions require internet connection.</Text>
        </SectionCard>
      ) : null}

      {bannerState ? <FormResultBanner message={bannerState.message} tone={bannerState.tone} /> : null}

      <SectionCard
        description={
          isSubscriber
            ? 'Your premium limits are active and billed through Stripe on web.'
            : 'Upgrade on web to unlock higher limits and fewer interruptions.'
        }
        title="Current Plan"
      >
        <View style={styles.statusRow}>
          <Text style={styles.sectionTitle}>
            {isSubscriber ? 'You are a Subscriber' : 'You are on Free'}
          </Text>
          <StatusPill
            label={isSubscriber ? 'Subscriber' : 'Free'}
            tone={isSubscriber ? 'info' : 'muted'}
            variant={isSubscriber ? 'solid' : 'soft'}
          />
        </View>
        <Text style={styles.providerMeta}>
          Billing provider: {user?.subscriptionProvider === 'stripe' ? 'Stripe' : 'Stripe (web only)'}
        </Text>
        {user?.subscriptionCurrentPeriodEnd ? (
          <Text style={styles.providerMeta}>
            Renews on {formatDisplayDate(user.subscriptionCurrentPeriodEnd)}.
          </Text>
        ) : null}
      </SectionCard>

      <SectionCard
        description="Checkout and subscription management are only available on the web app."
        title="Choose a Plan"
      >
        <Text style={styles.sectionTitle}>Choose a Plan</Text>
        <View style={styles.planList}>
          {planOptions.map((plan) => {
            const isSelected = selectedPlan.id === plan.id;
            const isPlanSelectionDisabled = isSubscriber;

            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{
                  disabled: isPlanSelectionDisabled,
                  selected: isSelected,
                }}
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
                  <Text variant="label">{plan.label}</Text>
                  {isSelected ? (
                    <Ionicons color={theme.colors.text.info} name="checkmark-circle" size={18} />
                  ) : null}
                </View>
                <View style={styles.planPriceRow}>
                  <Text variant="titleMd">{plan.priceLabel}</Text>
                  <Text tone="secondary">{plan.cadenceLabel}</Text>
                </View>
                {plan.savingsLabel ? <Text tone="success">{plan.savingsLabel}</Text> : null}
              </Pressable>
            );
          })}
        </View>

        <View style={styles.actions}>
          <Button
            disabled={!isOnline || checkoutMutation.isPending || portalMutation.isPending || isSubscriber}
            label={isSubscriber ? 'Already subscribed' : 'Subscribe with Stripe'}
            loading={checkoutMutation.isPending}
            onPress={() => {
              void handleSubscribePress();
            }}
          />
          <Button
            disabled={!isOnline || portalMutation.isPending || checkoutMutation.isPending || !user?.stripeCustomerId}
            label="Manage subscription"
            loading={portalMutation.isPending}
            onPress={() => {
              void handleManageSubscriptionPress();
            }}
            variant="secondary"
          />
        </View>
      </SectionCard>

      <SectionCard title="Free vs Subscriber">
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
      </SectionCard>
    </BackHeaderScreenScaffold>
  );
}
