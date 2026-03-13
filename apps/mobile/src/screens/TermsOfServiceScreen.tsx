import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { StaticContentSectionsScreen } from '../components/shared';
import type { RootStackParamList } from '../navigation/RootNavigator';

type TermsOfServiceScreenProps = NativeStackScreenProps<RootStackParamList, 'TermsOfService'>;

const TERMS_SECTIONS = [
  {
    title: 'Account Eligibility',
    body:
      'Describe who can use the app, what information they must provide, and the conditions for account suspension or removal.',
  },
  {
    title: 'Subscriber Access',
    body:
      'Outline what subscriber status unlocks, how access may change over time, and any eligibility or account-state rules tied to that access.',
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
      introDescription="This screen is wired and ready for final legal copy. Replace the sections below with approved language or fetch the content from your canonical source later."
      introTitle="Terms content has not been finalized yet."
      onBackPress={handleBackPress}
      sections={TERMS_SECTIONS}
      subtitle="Placeholder structure for future legal copy"
      title="Terms of Service"
    />
  );
}
