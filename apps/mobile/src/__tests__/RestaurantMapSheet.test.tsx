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
  RatingPill: (props: Record<string, unknown>) => mockReact.createElement('RatingPill', props),
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
        },
      },
      radii: {
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

function renderSheet() {
  let renderer: any = null;

  act(() => {
    renderer = create(
      <RestaurantMapSheet
        group={buildGroup()}
        onClose={jest.fn()}
      />,
    );
  });

  if (!renderer) {
    throw new Error('RestaurantMapSheet did not render.');
  }

  return renderer;
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
    const renderer = renderSheet();

    expect(findTextNodes(renderer, 'First drink')).toHaveLength(1);
    expect(findTextNodes(renderer, 'Second drink')).toHaveLength(1);
    expect(findTextNodes(renderer, 'Third drink')).toHaveLength(0);
    expect(findTextNodes(renderer, 'Show 1 more')).toHaveLength(1);
  });

  it('snaps to the middle point when show-more is pressed', () => {
    const renderer = renderSheet();

    act(() => {
      renderer.root.findByProps({
        accessibilityLabel: 'Show all 3 items for Test Restaurant',
      }).props.onPress();
    });

    expect(mockSnapToIndex).toHaveBeenCalledWith(1);
  });

  it('renders all items and hides show-more when expanded', () => {
    const renderer = renderSheet();

    act(() => {
      renderer.root.findByType('BottomSheet').props.onChange(1);
    });

    expect(findTextNodes(renderer, 'First drink')).toHaveLength(1);
    expect(findTextNodes(renderer, 'Second drink')).toHaveLength(1);
    expect(findTextNodes(renderer, 'Third drink')).toHaveLength(1);
    expect(findTextNodes(renderer, 'Show 1 more')).toHaveLength(0);
  });

  it('uses a single scrollable content child inside the bottom sheet', () => {
    const renderer = renderSheet();
    const bottomSheet = renderer.root.findByType('BottomSheet');

    expect(bottomSheet.findAllByType('BottomSheetScrollView')).toHaveLength(1);
    expect(bottomSheet.findAllByType('BottomSheetFlatList')).toHaveLength(0);
    expect(bottomSheet.findAllByType('BottomSheetView')).toHaveLength(0);
  });
});
