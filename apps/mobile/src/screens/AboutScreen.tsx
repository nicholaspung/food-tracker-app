import { useEffect, useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import {
  BackHeaderScreenScaffold,
  OptionList,
  OptionListInlineBody,
  OptionListRow,
  OtaUpdateStatusDetails,
  SectionCard,
  useOtaUpdateStatus,
} from '../components/shared';
import { formatAppVersionLabel } from '../lib/appMetadata';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { createThemedStyles } from '../theme';
import { Text } from '../ui';

type AboutScreenProps = NativeStackScreenProps<RootStackParamList, 'About'>;

function getVersionSubtitle(options: {
  hasAvailableUpdate: boolean;
  isChecking: boolean;
  isUpdatePending: boolean;
}): string {
  if (options.isUpdatePending) {
    return 'A downloaded OTA update is ready to apply';
  }

  if (options.hasAvailableUpdate) {
    return 'A newer OTA update is available for this app version';
  }

  if (options.isChecking) {
    return 'Checking whether a newer OTA update is available';
  }

  return 'Current app version and native build';
}

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
  const otaUpdateState = useOtaUpdateStatus('AboutScreen');
  const [isVersionExpanded, setIsVersionExpanded] = useState(otaUpdateState.shouldAutoExpand);

  useEffect(() => {
    if (otaUpdateState.shouldAutoExpand) {
      setIsVersionExpanded(true);
    }
  }, [otaUpdateState.shouldAutoExpand]);
  const styles = useStyles();

  const handleBackPress = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    navigation.navigate('Profile');
  };

  const showVersionDetails = isVersionExpanded;

  return (
    <BackHeaderScreenScaffold
      bodyStyle={styles.body}
      onBackPress={handleBackPress}
      subtitle="Version details, legal pages, and app information"
      testID="about-screen"
      title="About"
    >
      <SectionCard title="App Information">
        <OptionList>
          <OptionListRow
            chevron={showVersionDetails ? 'up' : 'down'}
            connected={showVersionDetails}
            iconName="phone-portrait-outline"
            isLast={!showVersionDetails}
            onPress={() => {
              setIsVersionExpanded((current) => !current);
            }}
            rightAccessory={<Text style={styles.metaValue}>{appVersionLabel}</Text>}
            subtitle={getVersionSubtitle({
              hasAvailableUpdate: otaUpdateState.hasAvailableUpdate,
              isChecking: otaUpdateState.isChecking,
              isUpdatePending: otaUpdateState.isUpdatePending,
            })}
            title="Version"
          />
          {showVersionDetails ? (
            <OptionListInlineBody>
              <OtaUpdateStatusDetails state={otaUpdateState} />
            </OptionListInlineBody>
          ) : null}
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
