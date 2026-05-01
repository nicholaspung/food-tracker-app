import React from 'react';
import { act, create } from 'react-test-renderer';

import { TutorialsScreen } from '../screens/TutorialsScreen';

const mockReact = React;
const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockCanGoBack = jest.fn();
const mockTrackObservabilityEvent = jest.fn();

jest.mock('@expo/vector-icons', () => ({
  Ionicons: (props: Record<string, unknown>) => mockReact.createElement('Ionicons', props),
}));

jest.mock('../components/shared', () => ({
  BackHeaderScreenScaffold: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('BackHeaderScreenScaffold', props, children),
  OptionList: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('OptionList', props, children),
  OptionListRow: (props: Record<string, unknown>) => mockReact.createElement('OptionListRow', props),
  SectionCard: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('SectionCard', props, children),
}));

jest.mock('../observability', () => ({
  trackObservabilityEvent: (...args: unknown[]) => mockTrackObservabilityEvent(...args),
}));

async function renderTutorialsScreen(): Promise<any> {
  let renderer: any;
  await act(async () => {
    renderer = create(
      <TutorialsScreen
        navigation={
          {
            canGoBack: mockCanGoBack,
            goBack: mockGoBack,
            navigate: mockNavigate,
          } as never
        }
        route={{ key: 'Tutorials-route', name: 'Tutorials' } as never}
      />,
    );
  });
  return renderer;
}

function findRow(renderer: any, testID: string): any {
  return renderer.root.findByProps({ testID });
}

describe('TutorialsScreen', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockGoBack.mockReset();
    mockCanGoBack.mockReset();
    mockTrackObservabilityEvent.mockReset();
    mockCanGoBack.mockReturnValue(false);
  });

  it('renders the tutorial options', async () => {
    const renderer = await renderTutorialsScreen();

    expect(renderer.root.findByType('BackHeaderScreenScaffold').props.title).toBe('Tutorials');
    expect(renderer.root.findAllByType('SectionCard').map((section: any) => section.props.title)).toEqual([
      'Getting Started',
      'Add Tutorials',
      'More Tutorials',
    ]);
    expect(renderer.root.findAllByType('OptionListRow')).toHaveLength(17);
    expect(findRow(renderer, 'tutorial-welcome-link').props.title).toBe('Welcome to Yummy Recs');
    expect(findRow(renderer, 'tutorial-month-privacy-link').props.title).toBe('Shared with Breathing Room');
    expect(findRow(renderer, 'tutorial-tutorials-link').props.title).toBe('Watch Feature Tutorials');
    expect(findRow(renderer, 'tutorial-friends-link').props.title).toBe('Add Friends Intentionally');
    expect(findRow(renderer, 'tutorial-more-tools-link').props.title).toBe('More Than Tracking');
    expect(findRow(renderer, 'tutorial-lists-intro-link').props.title).toBe('Use Lists for Ideas');
    expect(findRow(renderer, 'tutorial-bills-tips-link').props.title).toBe('Split Bills and Calculate Tips');
    expect(findRow(renderer, 'tutorial-settings-link').props.title).toBe('Personalize Your Experience');
    expect(findRow(renderer, 'tutorial-support-invites-link').props.title).toBe('Invite Friends and Get Help');
    expect(findRow(renderer, 'tutorial-track-restaurant-visit-link').props.title).toBe('Track Restaurant Visit');
    expect(findRow(renderer, 'tutorial-track-food-product-link').props.title).toBe('Track Food Product');
    expect(findRow(renderer, 'tutorial-log-note-link').props.title).toBe('Log a Note');
    expect(findRow(renderer, 'tutorial-process-saved-photos-link').props.title).toBe('Process Saved Photos');
    expect(findRow(renderer, 'tutorial-manage-notes-link').props.title).toBe('Manage Notes');
    expect(findRow(renderer, 'tutorial-lists-link').props.title).toBe('Restaurant Lists');
    expect(findRow(renderer, 'tutorial-split-bill-link').props.title).toBe('Split a Bill');
    expect(findRow(renderer, 'tutorial-tip-calculator-link').props.title).toBe('Tip Calculator');
    expect(findRow(renderer, 'tutorial-welcome-link').props.isLast).toBe(false);
    expect(findRow(renderer, 'tutorial-support-invites-link').props.isLast).toBe(true);
    expect(findRow(renderer, 'tutorial-manage-notes-link').props.isLast).toBe(true);
    expect(findRow(renderer, 'tutorial-tip-calculator-link').props.isLast).toBe(true);
  });

  it.each([
    [
      'tutorial-welcome-link',
      'welcome',
      ['FeatureOnboarding', { initialCardId: 'welcome', mode: 'replay', source: 'profile' }],
    ],
    [
      'tutorial-month-privacy-link',
      'month_privacy',
      ['FeatureOnboarding', { initialCardId: 'month_privacy', mode: 'replay', source: 'profile' }],
    ],
    [
      'tutorial-tutorials-link',
      'tutorials',
      ['FeatureOnboarding', { initialCardId: 'tutorials', mode: 'replay', source: 'profile' }],
    ],
    [
      'tutorial-friends-link',
      'friends',
      ['FeatureOnboarding', { initialCardId: 'friends', mode: 'replay', source: 'profile' }],
    ],
    [
      'tutorial-more-tools-link',
      'more_tools',
      ['FeatureOnboarding', { initialCardId: 'more_tools', mode: 'replay', source: 'profile' }],
    ],
    [
      'tutorial-lists-intro-link',
      'lists_intro',
      ['FeatureOnboarding', { initialCardId: 'lists_intro', mode: 'replay', source: 'profile' }],
    ],
    [
      'tutorial-bills-tips-link',
      'bills_tips',
      ['FeatureOnboarding', { initialCardId: 'bills_tips', mode: 'replay', source: 'profile' }],
    ],
    [
      'tutorial-settings-link',
      'settings',
      ['FeatureOnboarding', { initialCardId: 'settings', mode: 'replay', source: 'profile' }],
    ],
    [
      'tutorial-support-invites-link',
      'support_invites',
      ['FeatureOnboarding', { initialCardId: 'support_invites', mode: 'replay', source: 'profile' }],
    ],
    [
      'tutorial-track-restaurant-visit-link',
      'trackRestaurantVisit',
      ['AddFeatureOnboarding', { cardId: 'trackRestaurantVisit', mode: 'replay', source: 'profile' }],
    ],
    [
      'tutorial-track-food-product-link',
      'trackFoodProduct',
      ['AddFeatureOnboarding', { cardId: 'trackFoodProduct', mode: 'replay', source: 'profile' }],
    ],
    [
      'tutorial-log-note-link',
      'logNote',
      ['AddFeatureOnboarding', { cardId: 'logNote', mode: 'replay', source: 'profile' }],
    ],
    [
      'tutorial-process-saved-photos-link',
      'processSavedPhotos',
      ['AddFeatureOnboarding', { cardId: 'processSavedPhotos', mode: 'replay', source: 'profile' }],
    ],
    [
      'tutorial-manage-notes-link',
      'manageNotes',
      ['AddFeatureOnboarding', { cardId: 'manageNotes', mode: 'replay', source: 'profile' }],
    ],
    [
      'tutorial-lists-link',
      'lists',
      ['MoreFeatureOnboarding', { cardId: 'lists', mode: 'replay', source: 'profile' }],
    ],
    [
      'tutorial-split-bill-link',
      'splitBill',
      ['MoreFeatureOnboarding', { cardId: 'splitBill', mode: 'replay', source: 'profile' }],
    ],
    [
      'tutorial-tip-calculator-link',
      'tipCalculator',
      ['MoreFeatureOnboarding', { cardId: 'tipCalculator', mode: 'replay', source: 'profile' }],
    ],
  ] as const)('navigates from %s to the expected tutorial', async (testID, tutorialId, expectedNavigateArgs) => {
    const renderer = await renderTutorialsScreen();

    await act(async () => {
      findRow(renderer, testID).props.onPress();
    });

    expect(mockTrackObservabilityEvent).toHaveBeenCalledWith('PROFILE_TUTORIAL_OPENED', {
      source: 'TutorialsScreen',
      tutorialId,
    });
    expect(mockNavigate).toHaveBeenCalledWith(...expectedNavigateArgs);
  });

  it('falls back to Profile on back when no stack history exists', async () => {
    const renderer = await renderTutorialsScreen();

    await act(async () => {
      renderer.root.findByType('BackHeaderScreenScaffold').props.onBackPress();
    });

    expect(mockNavigate).toHaveBeenCalledWith('Profile');
  });

  it('uses stack back when possible', async () => {
    mockCanGoBack.mockReturnValue(true);
    const renderer = await renderTutorialsScreen();

    await act(async () => {
      renderer.root.findByType('BackHeaderScreenScaffold').props.onBackPress();
    });

    expect(mockGoBack).toHaveBeenCalledTimes(1);
    expect(mockNavigate).not.toHaveBeenCalledWith('Profile');
  });
});
