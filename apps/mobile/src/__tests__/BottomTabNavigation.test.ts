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
    summary: ['friends', 'summary'],
  },
  getCachedFriendsSummary: jest.fn(() => undefined),
  getFriendsCountSummary: jest.fn(),
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
  it('maps TipCalculator to the More tab', () => {
    expect(getBottomTabRouteForScreen('TipCalculator')).toBe('Misc');
  });
});
