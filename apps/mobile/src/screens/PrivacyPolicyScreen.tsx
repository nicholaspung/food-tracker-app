import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { StaticContentSectionsScreen } from '../components/shared';
import type { RootStackParamList } from '../navigation/RootNavigator';

type PrivacyPolicyScreenProps = NativeStackScreenProps<RootStackParamList, 'PrivacyPolicy'>;

const PRIVACY_SECTIONS = [
  {
    title: 'Information We Collect',
    body:
      'We collect information you provide directly, including account details like your email address, display name, login credentials, and profile preferences, plus the content you create in the service such as ratings, notes, visit history, quick tracks, restaurant lists, feedback messages, friend connections, invitations, photos you choose to upload, and restaurant search text or location details you submit while using restaurant search features.',
  },
  {
    title: 'Device Data and Permissions',
    body:
      'Some features request device access only when needed. This can include camera access for food photos and QR codes, photo library access for selecting or saving images, location access for nearby restaurant search, and technical diagnostics such as app version, platform details, crash details, and usage events. If you choose menu scanning or restaurant identification from a photo, the selected image is also sent for server-side processing.',
  },
  {
    title: 'How We Use Data',
    body:
      'We use collected information to create and manage your account, store, sync, and display your food records and friend activity, support offline-safe write replay across sessions and devices, provide support, enforce product rules, protect the service against misuse, respond to legal obligations, and improve reliability through analytics and observability tools.',
  },
  {
    title: 'Sharing and Visibility',
    body:
      'Your information is shared only as needed to run the service or according to the visibility controls you choose. Private content stays limited to your account except for support, security, and legal compliance needs; content shared with friends may be visible to approved connections; and data may be disclosed when required by law or to protect users and the service.',
  },
  {
    title: 'Analytics and Service Providers',
    body:
      'Yummy Recs uses providers for analytics, diagnostics, infrastructure, search, mapping, and AI-assisted processing. Those providers may process app usage events, app version, platform details, crash and error reports, and operational metrics needed to deliver sync, account, search, and support features. When you search for restaurants, Google Places and Google Maps may process search text, typed location text, and nearby-search coordinates to return results. When you use menu scanning or restaurant-name detection from a photo, Google Gemini may process the selected image to determine whether it is restaurant-related, extract restaurant names, or convert menu items into structured text. We configure mobile analytics to understand flows and reliability without linking those analytics events to your signed-in account.',
  },
  {
    title: 'Retention and Security',
    body:
      'We retain information for as long as needed to provide the service, maintain account history, resolve disputes, meet legal obligations, and protect the platform. Cached or offline copies may remain on your device until refreshed, deleted, or overwritten, and backups, logs, and support records may remain for a limited period after account changes or deletion requests.',
  },
  {
    title: 'Your Choices and Rights',
    body:
      'You can review and edit supported profile details and content in the app, update visibility settings for supported content types, and control camera, photo, and location access through device settings. You can also request access, correction, export, or deletion by contacting privacy@yummyrecs.com.',
  },
  {
    title: "Children's Privacy",
    body:
      'Yummy Recs is not intended for children under 13, and we do not knowingly collect personal information from children under 13. If you believe a child has provided personal information, contact us so we can review and take appropriate action.',
  },
  {
    title: 'Contact',
    body:
      'For privacy questions or rights requests, contact privacy@yummyrecs.com. Support questions can be sent to support@yummyrecs.com. If this policy changes materially, the effective date at the top of the page will be updated.',
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
      introCaption="Effective April 4, 2026"
      introDescription="This policy explains what information Yummy Recs collects, how it is used, when it may be shared, and what choices you have when using the website, mobile app, and related services."
      introTitle="How Yummy Recs handles your information"
      onBackPress={handleBackPress}
      sections={PRIVACY_SECTIONS}
      subtitle="Data collection, permissions, sharing, retention, and user rights"
      testID="privacy-policy-screen"
      title="Privacy Policy"
    />
  );
}
