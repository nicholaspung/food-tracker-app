import { useEffect, useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StyleSheet } from 'react-native';

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
import { useTheme } from '../theme';
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

export function AboutScreen({ navigation }: AboutScreenProps) {
  const theme = useTheme();
  const appVersionLabel = formatAppVersionLabel();
  const otaUpdateState = useOtaUpdateStatus('AboutScreen');
  const [isVersionExpanded, setIsVersionExpanded] = useState(otaUpdateState.shouldAutoExpand);

  useEffect(() => {
    if (otaUpdateState.shouldAutoExpand) {
      setIsVersionExpanded(true);
    }
  }, [otaUpdateState.shouldAutoExpand]);

  const styles = StyleSheet.create({
    body: {
      gap: theme.spacing.md,
    },
    metaValue: {
      color: theme.colors.text.secondary,
      ...theme.typography.meta,
    },
  });

  const handleBackPress = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    navigation.navigate('Profile');
  };

  const showVersionDetails = otaUpdateState.shouldAutoExpand && isVersionExpanded;

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
            chevron={otaUpdateState.shouldAutoExpand ? (showVersionDetails ? 'up' : 'down') : false}
            connected={showVersionDetails}
            iconName="phone-portrait-outline"
            isLast={!showVersionDetails}
            onPress={
              otaUpdateState.shouldAutoExpand
                ? () => {
                    setIsVersionExpanded((current) => !current);
                  }
                : undefined
            }
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
            title="Terms of Service"
          />
          <OptionListRow
            iconName="shield-checkmark-outline"
            isLast
            onPress={() => {
              navigation.navigate('PrivacyPolicy');
            }}
            subtitle="Current data collection, permissions, sharing, retention, and privacy rights summary"
            title="Privacy Policy"
          />
        </OptionList>
      </SectionCard>
    </BackHeaderScreenScaffold>
  );
}
