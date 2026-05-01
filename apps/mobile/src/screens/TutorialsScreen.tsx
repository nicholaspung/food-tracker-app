import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import {
  BackHeaderScreenScaffold,
  OptionList,
  OptionListRow,
  type OptionListRowProps,
  SectionCard,
} from '../components/shared';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import type { MainOnboardingCardId } from '../types/onboarding';

type TutorialsScreenProps = NativeStackScreenProps<RootStackParamList, 'Tutorials'>;
type TutorialId =
  | MainOnboardingCardId
  | 'trackRestaurantVisit'
  | 'trackFoodProduct'
  | 'logNote'
  | 'processSavedPhotos'
  | 'manageNotes'
  | 'lists'
  | 'splitBill'
  | 'tipCalculator';

const TUTORIAL_ANALYTICS_SOURCE = 'TutorialsScreen';

const MAIN_TUTORIALS: {
  id: MainOnboardingCardId;
  iconName: NonNullable<OptionListRowProps['iconName']>;
  subtitle: string;
  testID: string;
  title: string;
}[] = [
  {
    id: 'welcome',
    iconName: 'restaurant-outline',
    subtitle: 'The app goals and what you can track',
    testID: 'tutorial-welcome-link',
    title: 'Welcome to Yummy Recs',
  },
  {
    id: 'month_privacy',
    iconName: 'calendar-outline',
    subtitle: 'How shared tracking keeps timing private',
    testID: 'tutorial-month-privacy-link',
    title: 'Shared with Breathing Room',
  },
  {
    id: 'tutorials',
    iconName: 'play-circle-outline',
    subtitle: 'Where to find tutorial GIFs before using features',
    testID: 'tutorial-tutorials-link',
    title: 'Watch Feature Tutorials',
  },
  {
    id: 'friends',
    iconName: 'people-outline',
    subtitle: 'Add friends with codes when you are together',
    testID: 'tutorial-friends-link',
    title: 'Add Friends Intentionally',
  },
  {
    id: 'more_tools',
    iconName: 'apps-outline',
    subtitle: 'Lists, bill splitting, and tip calculation',
    testID: 'tutorial-more-tools-link',
    title: 'More Than Tracking',
  },
  {
    id: 'lists_intro',
    iconName: 'list-outline',
    subtitle: 'Use lists for ideas and saved recommendations',
    testID: 'tutorial-lists-intro-link',
    title: 'Use Lists for Ideas',
  },
  {
    id: 'bills_tips',
    iconName: 'cash-outline',
    subtitle: 'Split bills and estimate tips',
    testID: 'tutorial-bills-tips-link',
    title: 'Split Bills and Calculate Tips',
  },
  {
    id: 'settings',
    iconName: 'settings-outline',
    subtitle: 'Appearance, visibility, and Home feed defaults',
    testID: 'tutorial-settings-link',
    title: 'Personalize Your Experience',
  },
  {
    id: 'support_invites',
    iconName: 'ticket-outline',
    subtitle: 'Invite friends and find support options',
    testID: 'tutorial-support-invites-link',
    title: 'Invite Friends and Get Help',
  },
];

export function TutorialsScreen({ navigation }: TutorialsScreenProps) {
  const trackTutorialOpened = (tutorialId: TutorialId) => {
    trackObservabilityEvent('PROFILE_TUTORIAL_OPENED', {
      source: TUTORIAL_ANALYTICS_SOURCE,
      tutorialId,
    });
  };

  return (
    <BackHeaderScreenScaffold
      headerScrollMode="fixed"
      onBackPress={() => {
        if (navigation.canGoBack()) {
          navigation.goBack();
          return;
        }

        navigation.navigate('Profile');
      }}
      subtitle="Review how to use Yummy Recs features"
      testID="tutorials-screen"
      title="Tutorials"
    >
      <SectionCard title="Getting Started">
        <OptionList>
          {MAIN_TUTORIALS.map((tutorial, index) => (
            <OptionListRow
              iconName={tutorial.iconName}
              isLast={index === MAIN_TUTORIALS.length - 1}
              key={tutorial.id}
              onPress={() => {
                trackTutorialOpened(tutorial.id);
                navigation.navigate('FeatureOnboarding', {
                  initialCardId: tutorial.id,
                  mode: 'replay',
                });
              }}
              subtitle={tutorial.subtitle}
              testID={tutorial.testID}
              title={tutorial.title}
            />
          ))}
        </OptionList>
      </SectionCard>

      <SectionCard title="Add Tutorials">
        <OptionList>
          <OptionListRow
            iconName="restaurant-outline"
            onPress={() => {
              trackTutorialOpened('trackRestaurantVisit');
              navigation.navigate('AddFeatureOnboarding', {
                cardId: 'trackRestaurantVisit',
                mode: 'replay',
                source: 'profile',
              });
            }}
            subtitle="Add restaurants, menu items, ratings, and photos"
            testID="tutorial-track-restaurant-visit-link"
            title="Track Restaurant Visit"
          />
          <OptionListRow
            iconName="bag-outline"
            onPress={() => {
              trackTutorialOpened('trackFoodProduct');
              navigation.navigate('AddFeatureOnboarding', {
                cardId: 'trackFoodProduct',
                mode: 'replay',
                source: 'profile',
              });
            }}
            subtitle="Save groceries, snacks, drinks, and market finds"
            testID="tutorial-track-food-product-link"
            title="Track Food Product"
          />
          <OptionListRow
            iconName="create-outline"
            onPress={() => {
              trackTutorialOpened('logNote');
              navigation.navigate('AddFeatureOnboarding', {
                cardId: 'logNote',
                mode: 'replay',
                source: 'profile',
              });
            }}
            subtitle="Capture food ideas before turning them into entries"
            testID="tutorial-log-note-link"
            title="Log a Note"
          />
          <OptionListRow
            iconName="images-outline"
            onPress={() => {
              trackTutorialOpened('processSavedPhotos');
              navigation.navigate('AddFeatureOnboarding', {
                cardId: 'processSavedPhotos',
                mode: 'replay',
                source: 'profile',
              });
            }}
            subtitle="Turn saved food photos into tracked entries"
            testID="tutorial-process-saved-photos-link"
            title="Process Saved Photos"
          />
          <OptionListRow
            iconName="document-text-outline"
            isLast
            onPress={() => {
              trackTutorialOpened('manageNotes');
              navigation.navigate('AddFeatureOnboarding', {
                cardId: 'manageNotes',
                mode: 'replay',
                source: 'profile',
              });
            }}
            subtitle="Search, edit, delete, and convert notes"
            testID="tutorial-manage-notes-link"
            title="Manage Notes"
          />
        </OptionList>
      </SectionCard>

      <SectionCard title="More Tutorials">
        <OptionList>
          <OptionListRow
            iconName="list-outline"
            onPress={() => {
              trackTutorialOpened('lists');
              navigation.navigate('MoreFeatureOnboarding', {
                cardId: 'lists',
                mode: 'replay',
                source: 'profile',
              });
            }}
            subtitle="Save, organize, and revisit restaurants"
            testID="tutorial-lists-link"
            title="Restaurant Lists"
          />
          <OptionListRow
            iconName="cash-outline"
            onPress={() => {
              trackTutorialOpened('splitBill');
              navigation.navigate('MoreFeatureOnboarding', {
                cardId: 'splitBill',
                mode: 'replay',
                source: 'profile',
              });
            }}
            subtitle="Create a bill, assign items, and track payment"
            testID="tutorial-split-bill-link"
            title="Split a Bill"
          />
          <OptionListRow
            iconName="calculator-outline"
            isLast
            onPress={() => {
              trackTutorialOpened('tipCalculator');
              navigation.navigate('MoreFeatureOnboarding', {
                cardId: 'tipCalculator',
                mode: 'replay',
                source: 'profile',
              });
            }}
            subtitle="Estimate tips and totals before paying"
            testID="tutorial-tip-calculator-link"
            title="Tip Calculator"
          />
        </OptionList>
      </SectionCard>
    </BackHeaderScreenScaffold>
  );
}
