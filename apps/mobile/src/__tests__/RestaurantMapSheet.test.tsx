import React from 'react';
import { act, create } from 'react-test-renderer';

import { RestaurantMapSheet } from '../components/maps/RestaurantMapSheet';
import type { RestaurantMapGroup } from '../components/maps/restaurantMapTypes';

const mockReact = React;
const mockSnapToIndex = jest.fn();

jest.mock('@gorhom/bottom-sheet', () => {
  const react = jest.requireActual<typeof import('react')>('react');

  const BottomSheet = react.forwardRef(function MockBottomSheet(
    { children, ...props }: Record<string, unknown> & { children?: React.ReactNode },
    ref: React.ForwardedRef<{ snapToIndex: jest.Mock }>,
  ) {
    react.useImperativeHandle(ref, () => ({
      snapToIndex: mockSnapToIndex,
    }));

    return react.createElement('BottomSheet', props, children);
  });

  return {
    __esModule: true,
    default: BottomSheet,
    BottomSheetFlatList: (props: Record<string, unknown>) =>
      react.createElement('BottomSheetFlatList', props),
    BottomSheetScrollView: (
      { children, ...props }: Record<string, unknown> & { children?: React.ReactNode },
    ) => react.createElement('BottomSheetScrollView', props, children),
    BottomSheetView: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
      react.createElement('BottomSheetView', props, children),
  };
});

jest.mock('react-native', () => {
  const react = jest.requireActual<typeof import('react')>('react');

  return {
    Pressable: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
      react.createElement('Pressable', props, children),
    View: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
      react.createElement('View', props, children),
  };
});

jest.mock('../components/shared', () => ({
  CachedRemoteImage: (props: Record<string, unknown>) => mockReact.createElement('CachedRemoteImage', props),
  LoadingState: (props: Record<string, unknown>) => mockReact.createElement('LoadingState', props),
  RatingPill: (props: Record<string, unknown>) => mockReact.createElement('RatingPill', props),
  SegmentedControl: (props: Record<string, unknown>) => mockReact.createElement('SegmentedControl', props),
}));

jest.mock('../theme', () => ({
  createThemedStyles: (factory: (theme: Record<string, any>) => Record<string, unknown>) => () =>
    factory({
      colors: {
        background: {
          app: 'app-background',
          muted: 'muted-background',
          surface: 'surface-background',
        },
        border: {
          default: 'default-border',
          strong: 'strong-border',
        },
        text: {
          info: 'info-text',
          muted: 'muted-text',
          primary: 'primary-text',
          secondary: 'secondary-text',
          warning: 'warning-text',
        },
      },
      radii: {
        md: 10,
        pill: 999,
        sm: 6,
      },
      spacing: {
        md: 16,
        sm: 12,
        xs: 8,
        xxs: 4,
      },
    }),
  useTheme: () => ({
    colors: {
      background: {
        muted: 'muted-background',
      },
    },
  }),
}));

jest.mock('../ui', () => ({
  Button: (props: Record<string, unknown>) => mockReact.createElement('Button', props),
  Text: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Text', props, children),
}));

function buildGroup(): RestaurantMapGroup {
  return {
    id: 'restaurant-1',
    items: [
      {
        id: 'item-1',
        meta: [{ dateLabel: 'May 1, 2026', rating: 5 }],
        name: 'First drink',
      },
      {
        id: 'item-2',
        meta: [{ dateLabel: 'May 2, 2026', rating: 4 }],
        name: 'Second drink',
      },
      {
        id: 'item-3',
        meta: [{ dateLabel: 'May 3, 2026', rating: 3 }],
        name: 'Third drink',
      },
    ],
    latitude: 27.17,
    longitude: -80.27,
    restaurantLocation: 'Palm City, FL',
    restaurantName: 'Test Restaurant',
    summary: '3 ratings - 2 visits',
  };
}

function renderSheet({
  mapOpenErrorMessage = null,
  mapOpenLoading = false,
  group = buildGroup(),
  onOpenSelectedGroup,
  onOpenInMaps = jest.fn().mockResolvedValue(undefined),
  selectedGroupActionLabel,
  tabs,
}: {
  mapOpenErrorMessage?: string | null;
  mapOpenLoading?: boolean;
  group?: RestaurantMapGroup;
  onOpenSelectedGroup?: jest.Mock;
  onOpenInMaps?: jest.Mock;
  selectedGroupActionLabel?: string;
  tabs?: React.ComponentProps<typeof RestaurantMapSheet>['tabs'];
} = {}) {
  let renderer: any = null;

  act(() => {
    renderer = create(
      <RestaurantMapSheet
        mapOpenErrorMessage={mapOpenErrorMessage}
        mapOpenLoading={mapOpenLoading}
        group={group}
        onClose={jest.fn()}
        onOpenSelectedGroup={onOpenSelectedGroup}
        onOpenInMaps={onOpenInMaps}
        selectedGroupActionLabel={selectedGroupActionLabel}
        tabs={tabs}
      />,
    );
  });

  if (!renderer) {
    throw new Error('RestaurantMapSheet did not render.');
  }

  return {
    group,
    onOpenSelectedGroup,
    onOpenInMaps,
    renderer,
  };
}

function findTextNodes(renderer: any, text: string) {
  return renderer.root.findAll(
    (node: { children: unknown[]; type: unknown }) =>
      node.type === 'Text' && node.children.join('') === text,
  );
}

describe('RestaurantMapSheet', () => {
  beforeEach(() => {
    mockSnapToIndex.mockClear();
  });

  it('renders only the first two items and a show-more action while collapsed', () => {
    const { renderer } = renderSheet();

    expect(findTextNodes(renderer, 'First drink')).toHaveLength(1);
    expect(findTextNodes(renderer, 'Second drink')).toHaveLength(1);
    expect(findTextNodes(renderer, 'Third drink')).toHaveLength(0);
    expect(findTextNodes(renderer, 'Show 1 more')).toHaveLength(1);
  });

  it('snaps to the middle point when show-more is pressed', () => {
    const { renderer } = renderSheet();

    act(() => {
      renderer.root.findByProps({
        accessibilityLabel: 'Show all 3 items for Test Restaurant',
      }).props.onPress();
    });

    expect(mockSnapToIndex).toHaveBeenCalledWith(1);
  });

  it('renders all items and hides show-more when expanded', () => {
    const { renderer } = renderSheet();

    act(() => {
      renderer.root.findByType('BottomSheet').props.onChange(1);
    });

    expect(findTextNodes(renderer, 'First drink')).toHaveLength(1);
    expect(findTextNodes(renderer, 'Second drink')).toHaveLength(1);
    expect(findTextNodes(renderer, 'Third drink')).toHaveLength(1);
    expect(findTextNodes(renderer, 'Show 1 more')).toHaveLength(0);
  });

  it('uses a single scrollable content child inside the bottom sheet', () => {
    const { renderer } = renderSheet();
    const bottomSheet = renderer.root.findByType('BottomSheet');

    expect(bottomSheet.findAllByType('BottomSheetScrollView')).toHaveLength(1);
    expect(bottomSheet.findAllByType('BottomSheetFlatList')).toHaveLength(0);
    expect(bottomSheet.findAllByType('BottomSheetView')).toHaveLength(0);
  });

  it('renders an open-in-maps button for the selected restaurant', () => {
    const { renderer } = renderSheet();

    const button = renderer.root.findByProps({
      testID: 'restaurant-map-open-in-maps-button',
    });

    expect(button.props.accessibilityLabel).toBe('Open Test Restaurant in Maps');
    expect(button.props.label).toBe('Open in Maps');
    expect(button.props.variant).toBe('secondary');
  });

  it('does not render an open selected restaurant action by default', () => {
    const { renderer } = renderSheet();

    expect(renderer.root.findAllByProps({
      testID: 'restaurant-map-open-selected-group-button',
    })).toHaveLength(0);
  });

  it('renders and invokes the optional open selected restaurant action', () => {
    const onOpenSelectedGroup = jest.fn();
    const { group, renderer } = renderSheet({
      onOpenSelectedGroup,
      selectedGroupActionLabel: 'Open Restaurant',
    });

    const button = renderer.root.findByProps({
      testID: 'restaurant-map-open-selected-group-button',
    });

    expect(button.props.accessibilityLabel).toBe('Open Restaurant Test Restaurant');
    expect(button.props.label).toBe('Open Restaurant');
    expect(button.props.style).toEqual(expect.objectContaining({ flex: 1 }));
    expect(renderer.root.findByProps({
      testID: 'restaurant-map-open-in-maps-button',
    }).props.style).toEqual(expect.objectContaining({ flex: 1 }));

    act(() => {
      button.props.onPress();
    });

    expect(onOpenSelectedGroup).toHaveBeenCalledWith(group);
  });

  it('opens the selected restaurant in Maps when the map button is pressed', () => {
    const { group, onOpenInMaps, renderer } = renderSheet();

    act(() => {
      renderer.root.findByProps({
        testID: 'restaurant-map-open-in-maps-button',
      }).props.onPress();
    });

    expect(onOpenInMaps).toHaveBeenCalledWith(group);
  });

  it('shows a map open error message', () => {
    const { renderer } = renderSheet({
      mapOpenErrorMessage: 'Could not open this location. Try again from your maps app.',
    });

    expect(findTextNodes(renderer, 'Could not open this location. Try again from your maps app.')).toHaveLength(1);
  });

  it('passes the map open loading state to the button', () => {
    const { renderer } = renderSheet({
      mapOpenLoading: true,
    });

    expect(renderer.root.findByProps({
      testID: 'restaurant-map-open-in-maps-button',
    }).props.loading).toBe(true);
  });

  it('replaces the shared item list with Food Discovery sheet tabs when provided', () => {
    const { renderer } = renderSheet({
      tabs: {
        activeTab: 'location',
        allLocations: {
          emptyTitle: 'No orders across locations yet',
          errorMessage: null,
          items: [{ id: 'double-double', meta: [{ label: '2 orders', rating: 5 }], name: 'Double Double' }],
          loading: false,
          title: 'All Locations',
        },
        location: {
          emptyTitle: 'No menu items yet',
          errorMessage: null,
          items: [{ id: 'menu-1', meta: [], name: 'Aguachile' }],
          loading: false,
          title: 'This Location',
        },
        onTabChange: jest.fn(),
      },
    });

    const segmented = renderer.root.findByType('SegmentedControl');
    expect(segmented.props.options.map((option: { label: string }) => option.label)).toEqual([
      'This Location',
      'All Locations',
    ]);
    expect(findTextNodes(renderer, 'Aguachile')).toHaveLength(1);
    expect(findTextNodes(renderer, 'First drink')).toHaveLength(0);
    expect(findTextNodes(renderer, 'Show 1 more')).toHaveLength(0);
  });

  it('invokes tab changes through the sheet tab control', () => {
    const onTabChange = jest.fn();
    const { renderer } = renderSheet({
      tabs: {
        activeTab: 'location',
        allLocations: {
          emptyTitle: 'No orders across locations yet',
          errorMessage: null,
          items: [],
          loading: false,
          title: 'All Locations',
        },
        location: {
          emptyTitle: 'No menu items yet',
          errorMessage: null,
          items: [],
          loading: false,
          title: 'This Location',
        },
        onTabChange,
      },
    });

    act(() => {
      renderer.root.findByType('SegmentedControl').props.onChange('allLocations');
    });

    expect(onTabChange).toHaveBeenCalledWith('allLocations');
  });

  it('renders This Location empty state without a tab-local action', () => {
    const { renderer } = renderSheet({
      tabs: {
        activeTab: 'location',
        allLocations: {
          emptyDescription: 'Track a visit at this restaurant name to build your history.',
          emptyTitle: 'No orders across locations yet',
          errorMessage: null,
          items: [],
          loading: false,
          title: 'All Locations',
        },
        location: {
          emptyDescription: 'Open this restaurant to scan a menu or add items.',
          emptyTitle: 'No menu items yet',
          errorMessage: null,
          items: [],
          loading: false,
          title: 'This Location',
        },
        onTabChange: jest.fn(),
      },
    });

    expect(findTextNodes(renderer, 'No menu items yet')).toHaveLength(1);
    expect(findTextNodes(renderer, 'Open this restaurant to scan a menu or add items.')).toHaveLength(1);
    expect(renderer.root.findAllByProps({ testID: 'restaurant-map-sheet-tab-empty-action' })).toHaveLength(0);
  });

  it('does not render an empty action for All Locations', () => {
    const { renderer } = renderSheet({
      tabs: {
        activeTab: 'allLocations',
        allLocations: {
          emptyDescription: 'Track a visit at this restaurant name to build your history.',
          emptyTitle: 'No orders across locations yet',
          errorMessage: null,
          items: [],
          loading: false,
          title: 'All Locations',
        },
        location: {
          actionLabel: 'Open Restaurant',
          emptyTitle: 'No menu items yet',
          errorMessage: null,
          items: [],
          loading: false,
          onActionPress: jest.fn(),
          title: 'This Location',
        },
        onTabChange: jest.fn(),
      },
    });

    expect(findTextNodes(renderer, 'No orders across locations yet')).toHaveLength(1);
    expect(findTextNodes(renderer, 'Track a visit at this restaurant name to build your history.')).toHaveLength(1);
    expect(renderer.root.findAllByProps({ testID: 'restaurant-map-sheet-tab-empty-action' })).toHaveLength(0);
  });
});
