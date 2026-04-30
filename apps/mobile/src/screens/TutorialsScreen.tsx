import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { BackHeaderScreenScaffold, OptionList, OptionListRow, SectionCard } from '../components/shared';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';

type TutorialsScreenProps = NativeStackScreenProps<RootStackParamList, 'Tutorials'>;
type TutorialId =
  | 'welcome'
  | 'trackRestaurantVisit'
  | 'trackFoodProduct'
  | 'logNote'
  | 'processSavedPhotos'
  | 'manageNotes'
  | 'lists'
  | 'splitBill'
  | 'tipCalculator';

const TUTORIAL_ANALYTICS_SOURCE = 'TutorialsScreen';

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
          <OptionListRow
            iconName="sparkles-outline"
            isLast
            onPress={() => {
              trackTutorialOpened('welcome');
              navigation.navigate('FeatureOnboarding', { mode: 'replay' });
            }}
            subtitle="The app goals, privacy rhythm, invites, and support"
            testID="tutorial-main-onboarding-link"
            title="Welcome to Yummy Recs"
          />
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
