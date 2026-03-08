import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { StaticContentSectionsScreen } from '../components/shared';
import type { RootStackParamList } from '../navigation/RootNavigator';

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
  const handleBackPress = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    navigation.navigate('About');
  };

  return (
    <StaticContentSectionsScreen
      introCaption="Scaffold"
      introDescription="This page is a placeholder for approved privacy language. Swap these sections for final copy or a remote document source once your policy is ready."
      introTitle="Privacy content has not been finalized yet."
      onBackPress={handleBackPress}
      sections={PRIVACY_SECTIONS}
      subtitle="Placeholder structure for future privacy disclosures"
      title="Privacy Policy"
    />
  );
}
