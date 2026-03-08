import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StyleSheet, View } from 'react-native';

import { BackHeaderScreenScaffold } from '../components/shared';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useTheme } from '../theme';
import { Card, Text } from '../ui';

type TermsOfServiceScreenProps = NativeStackScreenProps<RootStackParamList, 'TermsOfService'>;

const TERMS_SECTIONS = [
  {
    title: 'Account Eligibility',
    body:
      'Describe who can use the app, what information they must provide, and the conditions for account suspension or removal.',
  },
  {
    title: 'Subscriptions and Billing',
    body:
      'Outline purchase terms, renewals, refunds, cancellation rules, and what happens when subscription status changes.',
  },
  {
    title: 'User Content and Conduct',
    body:
      'Define expectations for restaurant notes, ratings, lists, photos, invite sharing, and prohibited misuse of the service.',
  },
  {
    title: 'Service Availability',
    body:
      'Reserve room for uptime expectations, maintenance windows, beta features, and limits of liability for outages or data loss.',
  },
] as const;

export function TermsOfServiceScreen({ navigation }: TermsOfServiceScreenProps) {
  const theme = useTheme();

  const styles = StyleSheet.create({
    body: {
      gap: theme.spacing.md,
    },
    introCard: {
      gap: theme.spacing.xs,
    },
    introTitle: {
      color: theme.colors.text.primary,
      fontSize: 18,
      fontWeight: '700',
      lineHeight: 24,
    },
    introCopy: {
      color: theme.colors.text.secondary,
      lineHeight: 20,
    },
    sectionCard: {
      gap: theme.spacing.xs,
    },
    sectionTitle: {
      color: theme.colors.text.primary,
      fontSize: 16,
      fontWeight: '700',
      lineHeight: 22,
    },
    sectionBody: {
      color: theme.colors.text.secondary,
      lineHeight: 20,
    },
    caption: {
      color: theme.colors.text.muted,
      fontSize: 12,
      fontWeight: '600',
      lineHeight: 16,
      textTransform: 'uppercase',
    },
  });

  const handleBackPress = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    navigation.navigate('About');
  };

  return (
    <BackHeaderScreenScaffold
      bodyStyle={styles.body}
      onBackPress={handleBackPress}
      subtitle="Placeholder structure for future legal copy"
      title="Terms of Service"
    >
      <Card style={styles.introCard} tone="muted">
        <Text style={styles.caption}>Scaffold</Text>
        <Text style={styles.introTitle}>Terms content has not been finalized yet.</Text>
        <Text style={styles.introCopy}>
          This screen is wired and ready for final legal copy. Replace the sections below with
          approved language or fetch the content from your canonical source later.
        </Text>
      </Card>

      {TERMS_SECTIONS.map((section) => (
        <Card key={section.title} style={styles.sectionCard}>
          <View>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text style={styles.sectionBody}>{section.body}</Text>
          </View>
        </Card>
      ))}
    </BackHeaderScreenScaffold>
  );
}
