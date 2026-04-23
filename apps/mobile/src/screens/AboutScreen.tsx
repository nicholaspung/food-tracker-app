import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import {
  BackHeaderScreenScaffold,
  OptionList,
  OptionListRow,
  SectionCard,
} from '../components/shared';
import { formatAppVersionLabel } from '../lib/appMetadata';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { createThemedStyles } from '../theme';
import { Text } from '../ui';

type AboutScreenProps = NativeStackScreenProps<RootStackParamList, 'About'>;

const useStyles = createThemedStyles((theme) => ({
  body: {
    gap: theme.spacing.md,
  },
  metaValue: {
    color: theme.colors.text.secondary,
    ...theme.typography.meta,
  },
}));

export function AboutScreen({ navigation }: AboutScreenProps) {
  const appVersionLabel = formatAppVersionLabel();
  const styles = useStyles();

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
      headerScrollMode="fixed"
      onBackPress={handleBackPress}
      subtitle="Version details, legal pages, and app information"
      testID="about-screen"
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

      <SectionCard title="Legal">
        <OptionList>
          <OptionListRow
            iconName="document-text-outline"
            onPress={() => {
              navigation.navigate('TermsOfService');
            }}
            subtitle="Current account responsibilities, acceptable use rules, and legal contact details"
            testID="about-terms-link"
            title="Terms of Service"
          />
          <OptionListRow
            iconName="shield-checkmark-outline"
            isLast
            onPress={() => {
              navigation.navigate('PrivacyPolicy');
            }}
            subtitle="Current data collection, permissions, sharing, retention, and privacy rights summary"
            testID="about-privacy-link"
            title="Privacy Policy"
          />
        </OptionList>
      </SectionCard>
    </BackHeaderScreenScaffold>
  );
}
