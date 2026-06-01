import React from 'react';
import { act, create } from 'react-test-renderer';

import { RestaurantMenuItemPicker } from '../components/shared/RestaurantMenuItemPicker';

const mockReact = React;
const mockTheme = {
  colors: {
    background: {
      inverse: 'inverse-background',
      surface: 'surface-background',
    },
    border: {
      default: 'default-border',
      strong: 'strong-border',
      subtle: 'subtle-border',
    },
    button: {
      secondaryBg: 'secondary-button-background',
      secondaryBorder: 'secondary-button-border',
    },
    status: {
      successBg: 'success-background',
      successBorder: 'success-border',
      warningBorder: 'warning-border',
    },
    text: {
      primary: 'primary-text',
      secondary: 'secondary-text',
      success: 'success-text',
      warning: 'warning-text',
    },
  },
  radii: {
    md: 12,
    pill: 999,
  },
  sizes: {
    secondaryButtonHeight: 48,
  },
  spacing: {
    xxs: 4,
    xs: 8,
    sm: 12,
    md: 16,
  },
} as const;

jest.mock('react-native', () => ({
  Pressable: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Pressable', props, children),
  View: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('View', props, children),
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

jest.mock('../components/shared/RatingPill', () => ({
  RatingPill: (props: Record<string, unknown>) => mockReact.createElement('RatingPill', props),
}));

jest.mock('../components/shared/VisitMenuItemOptionRow', () => ({
  VisitMenuItemOptionRow: (props: Record<string, unknown>) =>
    mockReact.createElement('VisitMenuItemOptionRow', props),
}));

jest.mock('../theme', () => ({
  createThemedStyles:
    (factory: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) =>
      factory(mockTheme, ...args),
  useTheme: () => mockTheme,
}));

jest.mock('../ui', () => ({
  Card: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Card', props, children),
  Input: (props: Record<string, unknown>) => mockReact.createElement('Input', props),
  Text: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Text', props, children),
}));

const currentMenuItem = {
  id: 'menu-item-1',
  restaurant: 'restaurant-1',
  name: 'Burger',
};

const crossLocationItem = {
  id: 'coconut yogurt',
  name: 'Coconut Yogurt',
  latestRating: 5,
  latestRestaurantName: 'Fire',
  latestRestaurantLocation: 'Venice, CA',
  orderCount: 1,
};

function renderPicker(overrides: Partial<React.ComponentProps<typeof RestaurantMenuItemPicker>> = {}) {
  let renderer: any = null;
  act(() => {
    renderer = create(
      <RestaurantMenuItemPicker
        currentUserId="user-1"
        hasError={false}
        isItemSelected={() => false}
        isLoading={false}
        isOnline
        isTipVisible={false}
        items={[currentMenuItem]}
        label="All menu items (1)"
        onAddManual={jest.fn()}
        onRequestMenuReview={jest.fn()}
        onRetry={jest.fn()}
        onScanMenuPhoto={jest.fn()}
        onSearchQueryChange={jest.fn()}
        onTipVisibilityChange={jest.fn()}
        onToggleItem={jest.fn()}
        searchQuery=""
        selectedCount={0}
        testIDPrefix="create-visit"
        {...overrides}
      />,
    );
  });
  return renderer;
}

describe('RestaurantMenuItemPicker', () => {
  it('renders current restaurant menu items and cross-location suggestions together', () => {
    const renderer = renderPicker({
      crossLocationItems: [crossLocationItem],
    });

    expect(renderer.root.findByType('VisitMenuItemOptionRow').props.name).toBe('Burger');
    expect(renderer.root.findByProps({ testID: 'create-visit-cross-location-item-option-0' })).toBeTruthy();
    expect(renderer.root.findByType('RatingPill').props.rating).toBe(5);
  });

  it('does not show the empty state when only cross-location suggestions exist', () => {
    const renderer = renderPicker({
      crossLocationItems: [crossLocationItem],
      items: [],
    });

    expect(renderer.root.findAllByType('EmptyState')).toHaveLength(0);
    expect(renderer.root.findByProps({ testID: 'create-visit-cross-location-item-option-0' })).toBeTruthy();
  });

  it('calls the cross-location toggle handler when a suggestion is pressed', () => {
    const onToggleCrossLocationItem = jest.fn();
    const renderer = renderPicker({
      crossLocationItems: [crossLocationItem],
      onToggleCrossLocationItem,
    });

    act(() => {
      renderer.root.findByProps({ testID: 'create-visit-cross-location-item-option-0' }).props.onPress();
    });

    expect(onToggleCrossLocationItem).toHaveBeenCalledWith(crossLocationItem);
  });

  it('marks selected cross-location suggestions with the selected row style', () => {
    const renderer = renderPicker({
      crossLocationItems: [crossLocationItem],
      isCrossLocationItemSelected: () => true,
    });

    expect(renderer.root.findByProps({ testID: 'create-visit-cross-location-item-option-0' }).props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          backgroundColor: 'success-background',
          borderColor: 'success-border',
        }),
      ]),
    );
  });

  it('disables cross-location rows when cross-location selection is disabled', () => {
    const renderer = renderPicker({
      crossLocationDisabled: true,
      crossLocationItems: [crossLocationItem],
    });

    expect(renderer.root.findByProps({ testID: 'create-visit-cross-location-item-option-0' }).props.disabled).toBe(true);
  });
});
