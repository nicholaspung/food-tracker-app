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
import type { AddOnboardingCardId, MoreOnboardingCardId } from '../types/auth';
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

type TutorialSectionItem =
  | {
      id: AddOnboardingCardId;
      iconName: NonNullable<OptionListRowProps['iconName']>;
      routeName: 'AddFeatureOnboarding';
      routeParams: { cardId: AddOnboardingCardId; mode: 'replay'; source: 'profile' };
      subtitle: string;
      testID: string;
      title: string;
    }
  | {
      id: MoreOnboardingCardId;
      iconName: NonNullable<OptionListRowProps['iconName']>;
      routeName: 'MoreFeatureOnboarding';
      routeParams: { cardId: MoreOnboardingCardId; mode: 'replay'; source: 'profile' };
      subtitle: string;
      testID: string;
      title: string;
    };

const ADD_TUTORIALS: TutorialSectionItem[] = [
  {
    id: 'trackRestaurantVisit',
    iconName: 'restaurant-outline',
    routeName: 'AddFeatureOnboarding',
    routeParams: { cardId: 'trackRestaurantVisit', mode: 'replay', source: 'profile' },
    subtitle: 'Add restaurants, menu items, ratings, and photos',
    testID: 'tutorial-track-restaurant-visit-link',
    title: 'Track Restaurant Visit',
  },
  {
    id: 'trackFoodProduct',
    iconName: 'bag-outline',
    routeName: 'AddFeatureOnboarding',
    routeParams: { cardId: 'trackFoodProduct', mode: 'replay', source: 'profile' },
    subtitle: 'Save groceries, snacks, drinks, and market finds',
    testID: 'tutorial-track-food-product-link',
    title: 'Track Food Product',
  },
  {
    id: 'logNote',
    iconName: 'create-outline',
    routeName: 'AddFeatureOnboarding',
    routeParams: { cardId: 'logNote', mode: 'replay', source: 'profile' },
    subtitle: 'Capture food ideas before turning them into entries',
    testID: 'tutorial-log-note-link',
    title: 'Log a Note',
  },
  {
    id: 'processSavedPhotos',
    iconName: 'images-outline',
    routeName: 'AddFeatureOnboarding',
    routeParams: { cardId: 'processSavedPhotos', mode: 'replay', source: 'profile' },
    subtitle: 'Turn saved food photos into tracked entries',
    testID: 'tutorial-process-saved-photos-link',
    title: 'Process Saved Photos',
  },
  {
    id: 'manageNotes',
    iconName: 'document-text-outline',
    routeName: 'AddFeatureOnboarding',
    routeParams: { cardId: 'manageNotes', mode: 'replay', source: 'profile' },
    subtitle: 'Search, edit, delete, and convert notes',
    testID: 'tutorial-manage-notes-link',
    title: 'Manage Notes',
  },
];

const MORE_TUTORIALS: TutorialSectionItem[] = [
  {
    id: 'lists',
    iconName: 'list-outline',
    routeName: 'MoreFeatureOnboarding',
    routeParams: { cardId: 'lists', mode: 'replay', source: 'profile' },
    subtitle: 'Save, organize, and revisit restaurants',
    testID: 'tutorial-lists-link',
    title: 'Restaurant Lists',
  },
  {
    id: 'splitBill',
    iconName: 'cash-outline',
    routeName: 'MoreFeatureOnboarding',
    routeParams: { cardId: 'splitBill', mode: 'replay', source: 'profile' },
    subtitle: 'Create a bill, assign items, and track payment',
    testID: 'tutorial-split-bill-link',
    title: 'Split a Bill',
  },
  {
    id: 'tipCalculator',
    iconName: 'calculator-outline',
    routeName: 'MoreFeatureOnboarding',
    routeParams: { cardId: 'tipCalculator', mode: 'replay', source: 'profile' },
    subtitle: 'Estimate tips and totals before paying',
    testID: 'tutorial-tip-calculator-link',
    title: 'Tip Calculator',
  },
];

function TutorialSection({
  items,
  onOpenTutorial,
  title,
}: {
  items: TutorialSectionItem[];
  onOpenTutorial: (item: TutorialSectionItem) => void;
  title: string;
}) {
  return (
    <SectionCard title={title}>
      <OptionList>
        {items.map((item, index) => (
          <OptionListRow
            iconName={item.iconName}
            isLast={index === items.length - 1}
            key={item.id}
            onPress={() => {
              onOpenTutorial(item);
            }}
            subtitle={item.subtitle}
            testID={item.testID}
            title={item.title}
          />
        ))}
      </OptionList>
    </SectionCard>
  );
}

export function TutorialsScreen({ navigation }: TutorialsScreenProps) {
  const trackTutorialOpened = (tutorialId: TutorialId) => {
    trackObservabilityEvent('PROFILE_TUTORIAL_OPENED', {
      source: TUTORIAL_ANALYTICS_SOURCE,
      tutorialId,
    });
  };

  const openFeatureTutorial = (tutorial: TutorialSectionItem) => {
    trackTutorialOpened(tutorial.id);

    if (tutorial.routeName === 'AddFeatureOnboarding') {
      navigation.navigate('AddFeatureOnboarding', tutorial.routeParams);
      return;
    }

    navigation.navigate('MoreFeatureOnboarding', tutorial.routeParams);
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
            iconName="restaurant-outline"
            isLast
            onPress={() => {
              trackTutorialOpened('welcome');
              navigation.navigate('FeatureOnboarding', {
                mode: 'replay',
                source: 'profile',
              });
            }}
            subtitle="Review the main onboarding cards"
            testID="tutorial-welcome-link"
            title="Welcome to Yummy Recs"
          />
        </OptionList>
      </SectionCard>

      <TutorialSection items={ADD_TUTORIALS} onOpenTutorial={openFeatureTutorial} title="Add Tutorials" />

      <TutorialSection items={MORE_TUTORIALS} onOpenTutorial={openFeatureTutorial} title="More Tutorials" />
    </BackHeaderScreenScaffold>
  );
}
