import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StyleSheet, View } from 'react-native';

import { BackHeaderScreenScaffold } from '../components/shared';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useTheme } from '../theme';
import { Card, Text } from '../ui';

type PrivacyPolicyScreenProps = NativeStackScreenProps<RootStackParamList, 'PrivacyPolicy'>;

const PRIVACY_SECTIONS = [
  {
    title: 'What Data You Collect',
    body:
      'List account profile fields, restaurant activity, ratings, uploaded media, billing metadata, and device diagnostics collected by the app.',
  },
  {
    title: 'How Data Is Used',
    body:
      'Explain how app data supports recommendations, syncing, support workflows, analytics, abuse prevention, and subscription management.',
  },
  {
    title: 'Sharing and Disclosure',
    body:
      'Document when information is visible to friends, shared publicly, processed by vendors, or disclosed for legal or safety reasons.',
  },
  {
    title: 'Retention and User Controls',
    body:
      'Describe deletion windows, cache or backup retention, export rights, and the settings users can use to manage their account data.',
  },
] as const;

export function PrivacyPolicyScreen({ navigation }: PrivacyPolicyScreenProps) {
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
      subtitle="Placeholder structure for future privacy disclosures"
      title="Privacy Policy"
    >
      <Card style={styles.introCard} tone="muted">
        <Text style={styles.caption}>Scaffold</Text>
        <Text style={styles.introTitle}>Privacy content has not been finalized yet.</Text>
        <Text style={styles.introCopy}>
          This page is a placeholder for approved privacy language. Swap these sections for final
          copy or a remote document source once your policy is ready.
        </Text>
      </Card>

      {PRIVACY_SECTIONS.map((section) => (
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
