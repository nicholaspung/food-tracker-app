import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { BackHeaderScreenScaffold, OptionList, OptionListRow } from '../components/shared';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';

type TutorialsScreenProps = NativeStackScreenProps<RootStackParamList, 'Tutorials'>;
type TutorialId = 'main' | 'lists' | 'splitBill' | 'tipCalculator';

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
      <OptionList>
        <OptionListRow
          iconName="sparkles-outline"
          onPress={() => {
            trackTutorialOpened('main');
            navigation.navigate('FeatureOnboarding', { mode: 'replay' });
          }}
          subtitle="Visits, food products, notes, photos, and note management"
          testID="tutorial-main-onboarding-link"
          title="Core Food Tracking"
        />
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
    </BackHeaderScreenScaffold>
  );
}
