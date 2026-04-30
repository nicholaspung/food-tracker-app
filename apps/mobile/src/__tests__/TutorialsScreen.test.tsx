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
    expect(findRow(renderer, 'tutorial-main-onboarding-link').props.title).toBe('Welcome to Yummy Recs');
    expect(findRow(renderer, 'tutorial-track-restaurant-visit-link').props.title).toBe('Track Restaurant Visit');
    expect(findRow(renderer, 'tutorial-track-food-product-link').props.title).toBe('Track Food Product');
    expect(findRow(renderer, 'tutorial-log-note-link').props.title).toBe('Log a Note');
    expect(findRow(renderer, 'tutorial-process-saved-photos-link').props.title).toBe('Process Saved Photos');
    expect(findRow(renderer, 'tutorial-manage-notes-link').props.title).toBe('Manage Notes');
    expect(findRow(renderer, 'tutorial-lists-link').props.title).toBe('Restaurant Lists');
    expect(findRow(renderer, 'tutorial-split-bill-link').props.title).toBe('Split a Bill');
    expect(findRow(renderer, 'tutorial-tip-calculator-link').props.title).toBe('Tip Calculator');
  });

  it.each([
    ['tutorial-main-onboarding-link', 'welcome', ['FeatureOnboarding', { mode: 'replay' }]],
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
