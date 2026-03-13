import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { StaticContentSectionsScreen } from '../components/shared';
import type { RootStackParamList } from '../navigation/RootNavigator';

type PrivacyPolicyScreenProps = NativeStackScreenProps<RootStackParamList, 'PrivacyPolicy'>;

const PRIVACY_SECTIONS = [
  {
    title: 'Information We Collect',
    body:
      'Yummy Recs collects account details, profile settings, food activity such as notes, ratings, visits, quick tracks, lists, bills, feedback, friend connections, and photos you choose to upload.',
  },
  {
    title: 'Permissions and Device Access',
    body:
      'The app may request camera, photo library, and location access when you use features that need them, such as scanning QR codes, uploading food photos, saving processed images, or attaching your current location.',
  },
  {
    title: 'How We Use Data',
    body:
      'We use information to operate and sync your account, display your food records, support offline replay, respond to support requests, improve the product, and protect the service against misuse.',
  },
  {
    title: 'Sharing and Visibility',
    body:
      'Your content is shared according to the visibility settings you choose and may also be processed by service providers that help with hosting, analytics, and diagnostics, or disclosed when required by law.',
  },
  {
    title: 'Analytics and Service Providers',
    body:
      'Yummy Recs may collect app version, platform details, usage events, and error reports to improve reliability through internal tooling and third-party analytics or infrastructure providers.',
  },
  {
    title: 'Retention and Security',
    body:
      'We keep information for as long as needed to provide the service, maintain account history, meet legal obligations, and protect the platform. Cached or offline copies may remain on your device until refreshed or deleted.',
  },
  {
    title: 'Your Choices',
    body:
      'You can update supported profile and content settings in the app, change device permissions through system settings, and request access, correction, export, or deletion by contacting the privacy inbox.',
  },
  {
    title: 'Contact',
    body:
      'For privacy questions or rights requests, email privacy@yummyrecs.com. Support questions can be sent to support@yummyrecs.com.',
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
      introCaption="Effective March 12, 2026"
      introDescription="This summary explains how Yummy Recs collects, uses, shares, and retains information across the mobile app, web experiences, and related support workflows."
      introTitle="How Yummy Recs handles your information"
      onBackPress={handleBackPress}
      sections={PRIVACY_SECTIONS}
      subtitle="Summary of data handling, permissions, sharing, and user controls"
      title="Privacy Policy"
    />
  );
}
