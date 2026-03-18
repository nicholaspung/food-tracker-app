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
      introCaption="Effective March 12, 2026"
      introDescription="These summary terms cover account responsibilities and acceptable use for the Yummy Recs service."
      introTitle="Rules for using Yummy Recs"
      onBackPress={handleBackPress}
      sections={TERMS_SECTIONS}
      subtitle="Account responsibilities, acceptable use, and legal contact"
      testID="terms-of-service-screen"
      title="Terms of Service"
    />
  );
}
