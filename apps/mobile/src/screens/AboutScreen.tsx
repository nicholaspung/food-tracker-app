import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StyleSheet, View } from 'react-native';

import {
  BackHeaderScreenScaffold,
  OptionList,
  OptionListRow,
  OtaUpdateCard,
  SectionCard,
} from '../components/shared';
import { shouldShowAppUpdateStatus } from '../lib/appUpdateVisibility';
import { formatAppVersionLabel } from '../lib/appMetadata';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useTheme } from '../theme';
import { Text } from '../ui';

type AboutScreenProps = NativeStackScreenProps<RootStackParamList, 'About'>;

export function AboutScreen({ navigation }: AboutScreenProps) {
  const theme = useTheme();
  const appVersionLabel = formatAppVersionLabel();
  const showAppUpdateStatus = shouldShowAppUpdateStatus();

  const styles = StyleSheet.create({
    body: {
      gap: theme.spacing.md,
    },
    metaValue: {
      color: theme.colors.text.secondary,
      ...theme.typography.meta,
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
      <SectionCard title="App Information">
        <OptionList>
          <OptionListRow
            iconName="phone-portrait-outline"
            isLast
            rightAccessory={<Text style={styles.metaValue}>{appVersionLabel}</Text>}
            subtitle="Current app version and native build"
            title="Version"
          />
        </OptionList>
      </SectionCard>

      {showAppUpdateStatus ? <OtaUpdateCard source="AboutScreen" /> : null}

      <SectionCard title="Legal">
        <OptionList>
          <OptionListRow
            iconName="document-text-outline"
            onPress={() => {
              navigation.navigate('TermsOfService');
            }}
            subtitle="Scaffold for user agreements, account rules, and subscriber access terms"
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
      </SectionCard>

      <View>
        <Text style={styles.footerCopy}>
          Replace the placeholder legal content with final copy or external links when those
          documents are ready.
        </Text>
      </View>
    </BackHeaderScreenScaffold>
  );
}
