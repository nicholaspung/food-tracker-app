import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StyleSheet, View } from 'react-native';

import { BackHeaderScreenScaffold, OptionList, OptionListRow } from '../components/shared';
import { formatAppVersionLabel, getApplicationId, getApplicationName } from '../lib/appMetadata';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useTheme } from '../theme';
import { Card, Text } from '../ui';

type AboutScreenProps = NativeStackScreenProps<RootStackParamList, 'About'>;

export function AboutScreen({ navigation }: AboutScreenProps) {
  const theme = useTheme();
  const applicationName = getApplicationName();
  const appVersionLabel = formatAppVersionLabel();
  const applicationId = getApplicationId();

  const styles = StyleSheet.create({
    body: {
      gap: theme.spacing.md,
    },
    heroCard: {
      gap: theme.spacing.xs,
    },
    heroEyebrow: {
      color: theme.colors.text.brand,
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 0.6,
      lineHeight: 16,
      textTransform: 'uppercase',
    },
    heroTitle: {
      color: theme.colors.text.primary,
      fontSize: 22,
      fontWeight: '700',
      lineHeight: 28,
    },
    heroDescription: {
      color: theme.colors.text.secondary,
      lineHeight: 20,
    },
    sectionCard: {
      gap: theme.spacing.sm,
    },
    sectionTitle: {
      color: theme.colors.text.primary,
      fontSize: 18,
      fontWeight: '700',
      lineHeight: 24,
    },
    metaValue: {
      color: theme.colors.text.secondary,
      fontSize: 13,
      fontWeight: '600',
      lineHeight: 18,
    },
    footerCopy: {
      color: theme.colors.text.muted,
      lineHeight: 18,
      textAlign: 'center',
    },
  });

  const handleBackPress = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    navigation.navigate('Profile');
  };

  return (
    <BackHeaderScreenScaffold
      bodyStyle={styles.body}
      onBackPress={handleBackPress}
      subtitle="Version details, legal pages, and app information"
      title="About"
    >
      <Card style={styles.heroCard} tone="info">
        <Text style={styles.heroEyebrow}>Current Build</Text>
        <Text style={styles.heroTitle}>{applicationName}</Text>
        <Text style={styles.heroDescription}>
          Keep this page as the single place for app versioning, legal documents, and other
          reference details.
        </Text>
      </Card>

      <Card style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>App Information</Text>
        <OptionList>
          <OptionListRow
            iconName="phone-portrait-outline"
            rightAccessory={<Text style={styles.metaValue}>{appVersionLabel}</Text>}
            subtitle="Current app version and native build"
            title="Version"
          />
          <OptionListRow
            iconName="cube-outline"
            isLast
            rightAccessory={<Text style={styles.metaValue}>{applicationId}</Text>}
            subtitle="Installed app identifier"
            title="Application ID"
          />
        </OptionList>
      </Card>

      <Card style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Legal</Text>
        <OptionList>
          <OptionListRow
            iconName="document-text-outline"
            onPress={() => {
              navigation.navigate('TermsOfService');
            }}
            subtitle="Scaffold for user agreements, account rules, and billing terms"
            title="Terms of Service"
          />
          <OptionListRow
            iconName="shield-checkmark-outline"
            isLast
            onPress={() => {
              navigation.navigate('PrivacyPolicy');
            }}
            subtitle="Scaffold for data collection, storage, and sharing disclosures"
            title="Privacy Policy"
          />
        </OptionList>
      </Card>

      <View>
        <Text style={styles.footerCopy}>
          Replace the placeholder legal content with final copy or external links when those
          documents are ready.
        </Text>
      </View>
    </BackHeaderScreenScaffold>
  );
}
