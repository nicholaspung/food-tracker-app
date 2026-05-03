import { getBottomTabRouteForScreen } from '../components/shared/BottomTabNavigation';

jest.mock('react-native', () => ({
  Pressable: 'Pressable',
  View: 'View',
}));

jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn(() => ({ data: undefined })),
  useQueryClient: jest.fn(() => ({})),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

jest.mock('../features', () => ({
  friendsQueryKeys: {
    summary: jest.fn((userId?: string | null) => ['friends', userId ?? 'anonymous', 'summary']),
  },
  getCachedFriendsSummary: jest.fn(() => undefined),
  getFriendsCountSummary: jest.fn(),
}));

jest.mock('../providers/AuthProvider', () => ({
  useAuth: jest.fn(() => ({
    user: {
      id: 'user-1',
    },
  })),
}));

jest.mock('../theme', () => ({
  createThemedStyles: () => () => ({}),
  useTheme: () => ({
    colors: {
      text: {
        brand: 'blue',
        muted: 'gray',
      },
    },
  }),
}));

jest.mock('../ui', () => ({
  Text: 'Text',
}));

describe('getBottomTabRouteForScreen', () => {
  it('maps Profile tutorials routes to the Profile tab', () => {
    expect(getBottomTabRouteForScreen('Tutorials')).toBe('Profile');
    expect(getBottomTabRouteForScreen('FeatureOnboarding', { mode: 'replay', source: 'profile' })).toBe(
      'Profile',
    );
    expect(
      getBottomTabRouteForScreen('AddFeatureOnboarding', {
        cardId: 'trackRestaurantVisit',
        mode: 'replay',
        source: 'profile',
      }),
    ).toBe('Profile');
    expect(
      getBottomTabRouteForScreen('MoreFeatureOnboarding', {
        cardId: 'tipCalculator',
        mode: 'replay',
        source: 'profile',
      }),
    ).toBe('Profile');
  });

  it('keeps non-profile feature tutorials on their owning tabs', () => {
    expect(
      getBottomTabRouteForScreen('AddFeatureOnboarding', {
        cardId: 'trackRestaurantVisit',
        mode: 'firstRun',
        source: 'add',
      }),
    ).toBe('AddVisit');
    expect(
      getBottomTabRouteForScreen('MoreFeatureOnboarding', {
        cardId: 'tipCalculator',
        mode: 'firstRun',
        source: 'more',
      }),
    ).toBe('Misc');
  });

  it('maps TipCalculator to the More tab', () => {
    expect(getBottomTabRouteForScreen('TipCalculator')).toBe('Misc');
  });

  it('maps note management routes to the Add tab', () => {
    expect(getBottomTabRouteForScreen('Notes')).toBe('AddVisit');
    expect(getBottomTabRouteForScreen('NoteEditor')).toBe('AddVisit');
  });
});
