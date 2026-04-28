import React from 'react';
import { act, create } from 'react-test-renderer';

import { SettingsScreen } from '../screens/SettingsScreen';

const mockReact = React;
const mockSetPreference = jest.fn();
const mockSaveSettings = jest.fn();

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
    data: {
      listVisibility: 'friends',
      restaurantVisibility: 'private',
      visitVisibility: 'friends',
    },
    isError: false,
    isLoading: false,
    refetch: jest.fn(),
  }),
  useQueryClient: () => ({
    setQueryData: jest.fn(),
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
  getCollectionRecord: jest.fn(),
  invalidateSettingsQueries: jest.fn(),
  saveAuthRecord: jest.fn(),
  settingsQueryKeys: {
    detail: (userId: string) => ['settings', userId],
  },
  updateCollectionRecord: jest.fn(),
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
    expect(sectionCards[0].props.description).toBe('Choose how Yummy Recs looks on this device.');

    const appearanceOptions = renderer.root.findAllByType('SegmentedOption');
    expect(appearanceOptions.map((option: any) => option.props.label)).toEqual(['System', 'Light', 'Dark']);

    await act(async () => {
      renderer.root.findByProps({ testID: 'settings-appearance-dark' }).props.onPress();
    });

    expect(mockSetPreference).toHaveBeenCalledWith('dark');
    expect(mockSaveSettings).not.toHaveBeenCalled();
  });
});
