import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { StaticContentSectionsScreen } from '../components/shared';
import type { RootStackParamList } from '../navigation/RootNavigator';

type TermsOfServiceScreenProps = NativeStackScreenProps<RootStackParamList, 'TermsOfService'>;

const TERMS_SECTIONS = [
  {
    title: 'Accounts',
    body:
      'You are responsible for account activity performed under your credentials and for maintaining the security of your login information.',
  },
  {
    title: 'Your Content and Sharing',
    body:
      'You are responsible for the ratings, notes, photos, lists, bills, feedback, invitations, and other content you add to Yummy Recs. Only add content you have the right to use, and choose visibility settings, friend sharing, and shared list links carefully.',
  },
  {
    title: 'Notifications',
    body:
      'Yummy Recs may send reminders and activity alerts when you allow notifications and enable supported categories. You can manage notification categories in the app and device-level notification access in your system settings.',
  },
  {
    title: 'Acceptable Use',
    body:
      'Do not use Yummy Recs for fraudulent, abusive, infringing, or unlawful conduct, and do not interfere with the operation or security of the service.',
  },
  {
    title: 'Contact',
    body:
      'Questions about these terms can be sent to legal@yummyrecs.com.',
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
      introCaption="Effective June 3, 2026"
      introDescription="These summary terms cover account responsibilities, acceptable use, sharing, notifications, and legal contact for the Yummy Recs service."
      introTitle="Rules for using Yummy Recs"
      onBackPress={handleBackPress}
      sections={TERMS_SECTIONS}
      subtitle="Account responsibilities, acceptable use, sharing, notifications, and legal contact"
      testID="terms-of-service-screen"
      title="Terms of Service"
    />
  );
}
