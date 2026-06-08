import React from 'react';
import { act, create } from 'react-test-renderer';

import { HomeFeedVisitEntryCard } from '../components/shared/HomeFeedVisitEntryCard';
import { getRatingColor, getRatingLabel } from '../lib/ratingConstants';

const mockReact = React;
const theme = {
  colors: {
    background: {
      inverse: 'inverse-background',
      muted: 'muted-background',
      surface: 'surface-background',
    },
    border: {
      brand: 'brand-border',
      danger: 'danger-border',
      default: 'default-border',
      subtle: 'subtle-border',
    },
    status: {
      infoBg: 'info-background',
    },
    text: {
      brand: 'brand',
      danger: 'danger',
      inverse: 'inverse',
      muted: 'muted',
      primary: 'primary',
      secondary: 'secondary',
    },
  },
  radii: {
    pill: 999,
  },
  spacing: {
    sm: 12,
    xs: 8,
    xxs: 4,
  },
  typography: {
    bodySmTightBold: {},
    bodySmTightMedium: {},
    captionStrong: {},
  },
} as const;

jest.mock('react-native', () => ({
  Image: (props: Record<string, unknown>) =>
    mockReact.createElement('Image', props),
  Pressable: ({
    children,
    ...props
  }: Record<string, unknown> & {
    children?:
      | React.ReactNode
      | ((state: { pressed: boolean }) => React.ReactNode);
  }) =>
    mockReact.createElement(
      'Pressable',
      props,
      typeof children === 'function' ? children({ pressed: false }) : children,
    ),
  StyleSheet: {
    create: <T,>(styles: T) => styles,
  },
  View: ({
    children,
    ...props
  }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('View', props, children),
}));

jest.mock('../features', () => ({
  buildPocketBaseFileUrl: jest.fn(() => 'pb://photo-thumb'),
}));

jest.mock('../features/store/pocketbaseGateway', () => ({
  buildPocketBaseFileUrl: jest.fn(() => 'pb://photo-thumb'),
}));

jest.mock('../lib/ratingConstants', () => ({
  getRatingColor: jest.fn(() => 'rating-color'),
  getRatingLabel: jest.fn(() => 'Great'),
}));

jest.mock('../theme', () => ({
  createThemedStyles:
    (factory: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) =>
      factory(theme, ...args),
  useTheme: () => theme,
}));

jest.mock('../ui', () => ({
  Text: ({
    children,
    ...props
  }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Text', props, children),
}));

jest.mock('../components/shared/ExpandableText', () => ({
  ExpandableText: ({
    children,
    ...props
  }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('ExpandableText', props, children),
}));

jest.mock('../components/shared/StatusPill', () => ({
  StatusPill: (props: Record<string, unknown>) =>
    mockReact.createElement('StatusPill', props),
}));

function flattenStyle(style: unknown) {
  const entries = Array.isArray(style) ? style : [style];

  return entries.reduce<Record<string, unknown>>((accumulator, entry) => {
    if (!entry || typeof entry !== 'object') {
      return accumulator;
    }

    return {
      ...accumulator,
      ...entry,
    };
  }, {});
}

function createVisitRecord() {
  return {
    createdAt: '2026-04-18T08:00:00.000Z',
    id: 'visit-1',
    items: [
      {
        id: 'item-1',
        name: 'Spicy Wontons',
        notes: 'Shareable',
        rating: 4,
      },
    ],
    restaurantName: 'Noodle House',
    source: 'visit' as const,
    updatedAt: '2026-04-18T08:05:00.000Z',
    visitedAt: '2026-04-18T08:00:00.000Z',
  };
}

describe('HomeFeedVisitEntryCard', () => {
  it('wires long press handlers for visit items when move is enabled', async () => {
    const onItemLongPress = jest.fn();
    let renderer: any = null;
    const visit = createVisitRecord();

    await act(async () => {
      renderer = create(
        <HomeFeedVisitEntryCard
          getPhotosForItem={() => []}
          onItemLongPress={onItemLongPress}
          visit={visit}
        />,
      );
    });

    const itemPressable = renderer.root.findByProps({
      testID: 'home-feed-visit-item-item-1',
    });

    await act(async () => {
      itemPressable.props.onLongPress();
    });

    expect(onItemLongPress).toHaveBeenCalledWith(visit.items[0]);
  });

  it('does not expose item move pressables when move is disabled', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <HomeFeedVisitEntryCard
          getPhotosForItem={() => []}
          visit={createVisitRecord()}
        />,
      );
    });

    expect(
      renderer.root.findAllByProps({
        testID: 'home-feed-visit-item-item-1',
      }),
    ).toHaveLength(0);
  });

  it('marks private visits and their menu item ratings with lock icons', async () => {
    let renderer: any = null;
    const visit = {
      ...createVisitRecord(),
      visibility: 'private' as const,
    };

    await act(async () => {
      renderer = create(
        <HomeFeedVisitEntryCard
          getPhotosForItem={() => []}
          visit={visit}
        />,
      );
    });

    expect(
      renderer.root.findAll(
        (node: { type: unknown; props: { testID?: string } }) =>
          node.type === 'Ionicons' && node.props.testID === 'home-feed-visit-private-lock',
      ),
    ).toHaveLength(1);
    expect(
      renderer.root.findAll(
        (node: { type: unknown; props: { testID?: string } }) =>
          node.type === 'Ionicons' && node.props.testID === 'home-feed-visit-item-private-lock-item-1',
      ),
    ).toHaveLength(1);
    expect(
      renderer.root.findAll(
        (node: { type: unknown; props: { name?: string } }) =>
          node.type === 'Ionicons' && node.props.name === 'lock-closed-outline',
      ),
    ).toHaveLength(2);
  });

  it('does not mark non-private visits with lock icons', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <HomeFeedVisitEntryCard
          getPhotosForItem={() => []}
          visit={createVisitRecord()}
        />,
      );
    });

    expect(
      renderer.root.findAll(
        (node: { type: unknown; props: { testID?: string } }) =>
          node.type === 'Ionicons' && node.props.testID === 'home-feed-visit-private-lock',
      ),
    ).toHaveLength(0);
    expect(
      renderer.root.findAll(
        (node: { type: unknown; props: { testID?: string } }) =>
          node.type === 'Ionicons' && node.props.testID === 'home-feed-visit-item-private-lock-item-1',
      ),
    ).toHaveLength(0);
  });

  it('marks private selected menu items with lock icons on non-private visits', async () => {
    let renderer: any = null;
    const visit = {
      ...createVisitRecord(),
      visibility: 'friends' as const,
      items: [
        {
          ...createVisitRecord().items[0],
          menuItemId: 'menu-item-1',
          menuItemVisibility: 'private' as const,
        },
      ],
    };

    await act(async () => {
      renderer = create(
        <HomeFeedVisitEntryCard
          getPhotosForItem={() => []}
          visit={visit}
        />,
      );
    });

    expect(
      renderer.root.findAll(
        (node: { type: unknown; props: { testID?: string } }) =>
          node.type === 'Ionicons' && node.props.testID === 'home-feed-visit-private-lock',
      ),
    ).toHaveLength(0);
    expect(
      renderer.root.findAll(
        (node: { type: unknown; props: { testID?: string } }) =>
          node.type === 'Ionicons' && node.props.testID === 'home-feed-visit-item-private-lock-item-1',
      ),
    ).toHaveLength(1);
  });

  it('renders item ratings through the shared feed rating display', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <HomeFeedVisitEntryCard
          getPhotosForItem={() => []}
          visit={createVisitRecord()}
        />,
      );
    });

    const ratingDisplay = renderer.root.findByProps({
      testID: 'home-feed-visit-item-rating-item-1',
    });
    const ratingDot = ratingDisplay.findAllByType('View')[1];

    expect(getRatingColor).toHaveBeenCalledWith(theme, 4);
    expect(getRatingLabel).toHaveBeenCalledWith(4);
    expect(flattenStyle(ratingDot.props.style)).toMatchObject({
      backgroundColor: 'rating-color',
      height: 10,
      width: 10,
    });
    expect(
      ratingDisplay.findAll(
        (node: { type: unknown; props: { children?: React.ReactNode } }) =>
          node.type === 'Text' && node.props.children === 'Great',
      ),
    ).toHaveLength(1);
  });
});
