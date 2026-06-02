import React from 'react';
import { act, create } from 'react-test-renderer';

import { VisitRestaurantSearchSection } from '../components/shared/VisitRestaurantSearchSection';

const mockReact = React;
const theme = {
  colors: {
    status: {
      successBg: 'success-background',
      successBorder: 'success-border',
    },
    text: {
      info: 'info-text',
    },
  },
  sizes: {
    inputMinHeight: 48,
  },
  spacing: {
    sm: 12,
    xs: 8,
  },
} as const;

jest.mock('react-native', () => ({
  StyleSheet: {
    create: <T,>(styles: T) => styles,
  },
  View: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('View', props, children),
}));

jest.mock('../theme', () => ({
  createThemedStyles:
    (factory: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) =>
      factory(theme, ...args),
  useTheme: () => theme,
}));

jest.mock('../ui/AppIcon', () => ({
  Ionicons: (props: Record<string, unknown>) => mockReact.createElement('Ionicons', props),
}));

jest.mock('../ui', () => ({
  Button: (props: Record<string, unknown>) => mockReact.createElement('Button', props),
  Card: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Card', props, children),
  Input: (props: Record<string, unknown>) => mockReact.createElement('Input', props),
  ListItem: ({ trailing, ...props }: Record<string, unknown>) =>
    mockReact.createElement('ListItem', props, trailing as React.ReactNode),
  Text: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Text', props, children),
}));

jest.mock('../components/shared/CurrentLocationButton', () => ({
  CurrentLocationButton: (props: Record<string, unknown>) =>
    mockReact.createElement('CurrentLocationButton', props),
}));

jest.mock('../components/shared/EmptyState', () => ({
  EmptyState: (props: Record<string, unknown>) => mockReact.createElement('EmptyState', props),
}));

jest.mock('../components/shared/LoadingState', () => ({
  LoadingState: (props: Record<string, unknown>) => mockReact.createElement('LoadingState', props),
}));

jest.mock('../components/shared/PageErrorToast', () => ({
  PageErrorToast: (props: Record<string, unknown>) => mockReact.createElement('PageErrorToast', props),
}));

jest.mock('../components/shared/UpgradePromptCard', () => ({
  UpgradePromptCard: (props: Record<string, unknown>) => mockReact.createElement('UpgradePromptCard', props),
}));

describe('VisitRestaurantSearchSection', () => {
  it('separates trailing actions from restaurant row press targets', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <VisitRestaurantSearchSection
          manualLocation=""
          onClearSearchResults={jest.fn()}
          onManualLocationChange={jest.fn()}
          onSearchPress={jest.fn()}
          onSearchQueryChange={jest.fn()}
          onUseCurrentLocationPress={jest.fn()}
          savedOptions={[
            {
              key: 'restaurant-1',
              onPress: jest.fn(),
              testID: 'saved-restaurant-row',
              title: 'Restaurant',
              trailing: mockReact.createElement('BookmarkButton'),
            },
          ]}
          searchButtonLabel="Search"
          searchQuery=""
          searchResultsOptions={[]}
          showSearchResults={false}
        />,
      );
    });

    const savedRestaurantRow = renderer.root.findByProps({ testID: 'saved-restaurant-row' });

    expect(savedRestaurantRow.props.separateTrailingAction).toBe(true);
  });
});
