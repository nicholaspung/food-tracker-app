import React from 'react';
import { act, create } from 'react-test-renderer';

import { SettingsScreen } from '../screens/SettingsScreen';

const mockReact = React;
const mockSetPreference = jest.fn();
const mockSaveSettings = jest.fn();
const mockSetQueryData = jest.fn();
const buildMockSettingsData = () => ({
  homeFeedMode: 'mine',
  homeFeedSort: 'created',
  homeFeedTypeFilter: 'visits',
  listVisibility: 'friends',
  notificationPreferences: {
    notificationBillsEnabled: true,
    notificationMonthlyFriendsActivityEnabled: true,
    notificationTastingInvitesEnabled: true,
  },
  restaurantVisibility: 'private',
  visitVisibility: 'friends',
});
let mockSettingsData = buildMockSettingsData();

const mockTheme = {
  colors: {
    background: {
      app: 'app-background',
      muted: 'muted-background',
      surface: 'surface-background',
    },
    border: {
      default: 'default-border',
      subtle: 'subtle-border',
    },
    text: {
      muted: 'muted-text',
      primary: 'primary-text',
    },
  },
  preference: 'system',
  radii: {
    md: 12,
  },
  setPreference: mockSetPreference,
  spacing: {
    md: 16,
    sm: 12,
    xs: 8,
  },
} as const;

jest.mock('react-native', () => ({
  Pressable: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Pressable', props, children),
  View: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('View', props, children),
}));

jest.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: mockSettingsData,
    isError: false,
    isLoading: false,
    refetch: jest.fn(),
  }),
  useQueryClient: () => ({
    setQueryData: mockSetQueryData,
  }),
}));

jest.mock('../providers/AuthProvider', () => ({
  useAuth: () => ({
    user: {
      id: 'user-1',
    },
  }),
}));

jest.mock('../providers/ConnectivityProvider', () => ({
  useConnectivity: () => ({
    isOnline: true,
  }),
}));

jest.mock('../features/store/useOfflineAwareFeatureWrite', () => ({
  useOfflineAwareFeatureWrite: () => mockSaveSettings,
}));

jest.mock('../features', () => ({
  buildHomeFeedDefaultsUpdate: ({
    homeFeedMode,
    homeFeedSort,
    homeFeedTypeFilter,
  }: {
    homeFeedMode: string;
    homeFeedSort: string;
    homeFeedTypeFilter: string;
  }) => ({
    defaultHomeFeedMode: homeFeedMode === 'friends' ? 'friends' : 'mine',
    defaultHomeFeedSort: homeFeedSort === 'tracked' ? 'tracked' : 'created',
    defaultHomeFeedTypeFilter:
      homeFeedTypeFilter === 'all' || homeFeedTypeFilter === 'food-products'
        ? homeFeedTypeFilter
        : 'visits',
  }),
  getCollectionRecord: jest.fn(),
  getNotificationPreferences: jest.fn(),
  invalidateSettingsQueries: jest.fn(),
  mapHomeFeedDefaultsFromRecord: (record: Record<string, unknown> | null | undefined) => ({
    homeFeedMode: record?.defaultHomeFeedMode === 'friends' ? 'friends' : 'mine',
    homeFeedSort: record?.defaultHomeFeedSort === 'tracked' ? 'tracked' : 'created',
    homeFeedTypeFilter:
      record?.defaultHomeFeedTypeFilter === 'all' || record?.defaultHomeFeedTypeFilter === 'food-products'
        ? record.defaultHomeFeedTypeFilter
        : 'visits',
  }),
  saveAuthRecord: jest.fn(),
  updateCollectionRecord: jest.fn(),
  useSettingsDetailRead: () => ({
    data: mockSettingsData,
    isError: false,
    isLoading: false,
    refetch: jest.fn(),
  }),
  useSettingsPreferencesWrites: () => ({
    saveSettingsPreferences: mockSaveSettings,
  }),
}));

jest.mock('../features/store/pocketbaseGateway', () => ({
  getAuthRecord: jest.fn(),
}));

jest.mock('../observability', () => ({
  trackObservabilityEvent: jest.fn(),
}));

jest.mock('../theme', () => ({
  createThemedStyles:
    <Args extends unknown[], Styles>(
      factory: (theme: typeof mockTheme, ...args: Args) => Styles,
    ) =>
    (...args: Args) =>
      factory(mockTheme, ...args),
  useTheme: () => mockTheme,
}));

jest.mock('../components/shared', () => ({
  BackHeaderScreenScaffold: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('BackHeaderScreenScaffold', props, children),
  EmptyState: (props: Record<string, unknown>) => mockReact.createElement('EmptyState', props),
  PageInfoToast: (props: Record<string, unknown>) => mockReact.createElement('PageInfoToast', props),
  SectionCard: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('SectionCard', props, children),
  SegmentedControl: ({
    getOptionTestID,
    onChange,
    options,
    value,
  }: {
    getOptionTestID?: (value: string, index: number) => string | undefined;
    onChange: (value: string) => void;
    options: readonly { label: string; value: string }[];
    value: string;
  }) =>
    mockReact.createElement(
      'SegmentedControl',
      { value },
      options.map((option, index) =>
        mockReact.createElement('SegmentedOption', {
          key: option.value,
          label: option.label,
          onPress: () => {
            onChange(option.value);
          },
          testID: getOptionTestID?.(option.value, index),
          value: option.value,
        }),
      ),
    ),
  Skeleton: (props: Record<string, unknown>) => mockReact.createElement('Skeleton', props),
  VisibilityOptionSelector: (props: Record<string, unknown>) =>
    mockReact.createElement('VisibilityOptionSelector', props),
}));

jest.mock('../screens/settings/FoodJournalExportSection', () => ({
  FoodJournalExportSection: () => mockReact.createElement('FoodJournalExportSection'),
}));

jest.mock('../components/shared/PageErrorToast', () => ({
  PageErrorToast: (props: Record<string, unknown>) => mockReact.createElement('PageErrorToast', props),
}));

jest.mock('../ui', () => ({
  Button: (props: Record<string, unknown>) => mockReact.createElement('Button', props),
  Card: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Card', props, children),
  Text: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Text', props, children),
}));

describe('SettingsScreen', () => {
	  beforeEach(() => {
	    mockSetPreference.mockClear();
	    mockSaveSettings.mockClear();
	    mockSetQueryData.mockClear();
	    mockSettingsData = buildMockSettingsData();
    mockSaveSettings.mockResolvedValue({
      result: {
        defaultHomeFeedMode: 'friends',
        defaultHomeFeedSort: 'tracked',
        defaultHomeFeedTypeFilter: 'all',
        defaultListVisibility: 'friends',
        defaultRestaurantVisibility: 'private',
        defaultVisitVisibility: 'friends',
      },
      status: 'executed',
    });
  });

  it('renders local appearance options and applies dark mode without saving server settings', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <SettingsScreen
          navigation={{ navigate: jest.fn() } as never}
          route={{ key: 'Settings-route', name: 'Settings' } as never}
        />,
      );
    });

    const sectionCards = renderer.root.findAllByType('SectionCard');
    expect(sectionCards[0].props.title).toBe('Appearance');
    expect(sectionCards[0].props.description).toBe('Applies immediately on this device.');

    const appearanceOptions = renderer.root.findAllByType('SegmentedOption');
    expect(appearanceOptions.slice(0, 3).map((option: any) => option.props.label)).toEqual(['System', 'Light', 'Dark']);

    await act(async () => {
      renderer.root.findByProps({ testID: 'settings-appearance-dark' }).props.onPress();
    });

    expect(mockSetPreference).toHaveBeenCalledWith('dark');
    expect(mockSaveSettings).not.toHaveBeenCalled();
  });

	  it('renders home feed default controls and saves changed defaults', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <SettingsScreen
          navigation={{ navigate: jest.fn() } as never}
          route={{ key: 'Settings-route', name: 'Settings' } as never}
        />,
      );
    });

    const sectionCards = renderer.root.findAllByType('SectionCard');
    expect(sectionCards.map((section: any) => section.props.title)).toContain('Default Home Feed');

    const findSaveAction = () => renderer.root.findByType('BackHeaderScreenScaffold').props.primaryAction;

    expect(findSaveAction()).toEqual(
      expect.objectContaining({
        disabled: true,
        label: 'Save Settings',
        testID: 'settings-save-button',
      }),
    );

    await act(async () => {
      renderer.root.findByProps({ testID: 'settings-home-feed-mode-friends' }).props.onPress();
      renderer.root.findByProps({ testID: 'settings-home-feed-type-all' }).props.onPress();
      renderer.root.findByProps({ testID: 'settings-home-feed-sort-tracked' }).props.onPress();
    });

    expect(findSaveAction().disabled).toBe(false);

    await act(async () => {
      findSaveAction().onPress();
      await Promise.resolve();
    });

    expect(mockSaveSettings).toHaveBeenCalledWith({
      homeFeedMode: 'friends',
      homeFeedSort: 'tracked',
      homeFeedTypeFilter: 'all',
      listVisibility: 'friends',
      notificationPreferences: {
        notificationBillsEnabled: true,
        notificationMonthlyFriendsActivityEnabled: true,
        notificationTastingInvitesEnabled: true,
      },
      restaurantVisibility: 'private',
      userId: 'user-1',
      visitVisibility: 'friends',
    });
	  });

	  it('does not overwrite unsaved defaults when settings refetch', async () => {
	    let renderer: any = null;
	    const renderScreen = () => (
	      <SettingsScreen
	        navigation={{ navigate: jest.fn() } as never}
	        route={{ key: 'Settings-route', name: 'Settings' } as never}
	      />
	    );

	    await act(async () => {
	      renderer = create(renderScreen());
	    });

	    await act(async () => {
	      renderer.root.findByProps({ testID: 'settings-home-feed-mode-friends' }).props.onPress();
	    });

	    mockSettingsData = {
	      ...buildMockSettingsData(),
	      homeFeedMode: 'mine',
	      homeFeedSort: 'tracked',
	    };

	    await act(async () => {
	      renderer.update(renderScreen());
	    });

	    const segmentedControls = renderer.root.findAllByType('SegmentedControl');
	    expect(segmentedControls[1].props.value).toBe('friends');
	    expect(segmentedControls[3].props.value).toBe('created');
	  });

	  it('hydrates refetched defaults after reverted edits match the current settings', async () => {
	    let renderer: any = null;
	    const renderScreen = () => (
	      <SettingsScreen
	        navigation={{ navigate: jest.fn() } as never}
	        route={{ key: 'Settings-route', name: 'Settings' } as never}
	      />
	    );

	    await act(async () => {
	      renderer = create(renderScreen());
	    });

	    await act(async () => {
	      renderer.root.findByProps({ testID: 'settings-home-feed-mode-friends' }).props.onPress();
	      renderer.root.findByProps({ testID: 'settings-home-feed-mode-mine' }).props.onPress();
	    });

	    mockSettingsData = {
	      ...buildMockSettingsData(),
	      homeFeedMode: 'friends',
	    };

	    await act(async () => {
	      renderer.update(renderScreen());
	    });

	    const segmentedControls = renderer.root.findAllByType('SegmentedControl');
	    expect(segmentedControls[1].props.value).toBe('friends');
	  });

	});
