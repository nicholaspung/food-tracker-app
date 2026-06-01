import React from 'react';
import { act, create } from 'react-test-renderer';

import { HomeFoodProductEntryCard } from '../components/shared/HomeFoodProductEntryCard';
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
      info: 'info',
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
    bodySmTightSemiBold: {},
    captionStrong: {},
  },
} as const;

jest.mock('react-native', () => ({
  Image: (props: Record<string, unknown>) => mockReact.createElement('Image', props),
  Pressable: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Pressable', props, children),
  StyleSheet: {
    create: <T,>(styles: T) => styles,
  },
  View: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('View', props, children),
}));

jest.mock('../features', () => ({
  buildPocketBaseFileUrl: jest.fn(() => 'pb://photo-thumb'),
}));

jest.mock('../features/store/pocketbaseGateway', () => ({
  buildPocketBaseFileUrl: jest.fn(() => 'pb://photo-thumb'),
}));

jest.mock('../lib/ratingConstants', () => ({
  getRatingColor: jest.fn(() => 'success'),
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
  Text: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Text', props, children),
}));

jest.mock('../components/shared/StatusPill', () => ({
  StatusPill: (props: Record<string, unknown>) => mockReact.createElement('StatusPill', props),
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

function findTextNode(renderer: any, content: string, numberOfLines?: number) {
  return renderer.root.findAll(
    (node: { type: unknown; props: { children?: React.ReactNode; numberOfLines?: number } }) =>
      node.type === 'Text' &&
      (Array.isArray(node.props.children)
        ? node.props.children.join('')
        : String(node.props.children ?? '')) === content &&
      (numberOfLines === undefined || node.props.numberOfLines === numberOfLines),
  )[0];
}

describe('HomeFoodProductEntryCard', () => {
  it('renders location, notes, and rating metadata when location text exists', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <HomeFoodProductEntryCard
          entryMeta="FRI APR 18"
          foodProduct={{
            id: 'food-product-1',
            restaurantName: 'Food Product',
            itemName: 'Iced Coffee',
            locationText: 'Mission District',
            rating: 4,
            notes: 'Smooth and sweet',
            createdAt: '2026-04-18T07:00:00.000Z',
            updatedAt: '2026-04-18T07:00:00.000Z',
          }}
          photos={[]}
        />,
      );
    });

    const textNodes = renderer.root.findAllByType('Text');
    const flattenedText = textNodes
      .map((node: { props: { children?: React.ReactNode } }) =>
        Array.isArray(node.props.children) ? node.props.children.join('') : String(node.props.children ?? ''),
      );

    expect(flattenedText).toContain('Mission District');
    expect(flattenedText).toContain('"Smooth and sweet"');
    expect(flattenedText).toContain('Great');
    expect(getRatingColor).toHaveBeenCalledWith(theme, 4);
    expect(getRatingLabel).toHaveBeenCalledWith(4);
    const ratingDisplay = renderer.root.findByProps({
      testID: 'home-food-product-entry-rating',
    });
    const ratingDot = ratingDisplay.findAllByType('View')[1];

    expect(
      flattenStyle(ratingDot.props.style),
    ).toMatchObject({
      backgroundColor: 'success',
      height: 10,
      width: 10,
    });
    expect(
      renderer.root.findAll(
        (node: { type: unknown; props: { name?: string } }) =>
          node.type === 'Ionicons' && node.props.name === 'location-outline',
      ),
    ).toHaveLength(1);
  });

  it('expands long notes inline while preserving the quoted note text', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <HomeFoodProductEntryCard
          entryMeta="FRI APR 18"
          foodProduct={{
            id: 'food-product-1',
            restaurantName: 'Food Product',
            itemName: 'Iced Coffee',
            locationText: 'Mission District',
            rating: 4,
            notes: 'Smooth and sweet',
            createdAt: '2026-04-18T07:00:00.000Z',
            updatedAt: '2026-04-18T07:00:00.000Z',
          }}
          photos={[]}
        />,
      );
    });

    const previewText = findTextNode(renderer, '"Smooth and sweet"', 2);

    await act(async () => {
      previewText.props.onTextLayout({
        nativeEvent: {
          lines: [{}, {}, {}],
        },
      });
    });

    const expandButton = renderer.root.findByProps({
      accessibilityHint: 'Shows the full text',
    });

    await act(async () => {
      expandButton.props.onPress();
    });

    const expandedText = findTextNode(renderer, '"Smooth and sweet"');

    expect(expandedText).toBeDefined();
    expect(
      renderer.root.findAll(
        (node: { type: unknown; props: { children?: React.ReactNode } }) =>
          node.type === 'Text' &&
          (Array.isArray(node.props.children)
            ? node.props.children.join('')
            : String(node.props.children ?? '')) === '"Smooth and sweet"',
      ),
    ).toHaveLength(1);
    expect(
      renderer.root.findAll(
        (node: { type: unknown; props: { children?: React.ReactNode } }) =>
          node.type === 'Text' &&
          (Array.isArray(node.props.children)
            ? node.props.children.join('')
            : String(node.props.children ?? '')) === 'Mission District',
      ),
    ).toHaveLength(1);
    expect(
      renderer.root.findAll(
        (node: { type: unknown; props: { children?: React.ReactNode } }) =>
          node.type === 'Text' &&
          (Array.isArray(node.props.children)
            ? node.props.children.join('')
            : String(node.props.children ?? '')) === 'Great',
      ),
    ).toHaveLength(1);
  });

  it('omits the location row when location text is absent', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <HomeFoodProductEntryCard
          entryMeta="FRI APR 18"
          foodProduct={{
            id: 'food-product-2',
            restaurantName: 'Food Product',
            itemName: 'Tea',
            rating: 3,
            createdAt: '2026-04-18T07:00:00.000Z',
            updatedAt: '2026-04-18T07:00:00.000Z',
          }}
          photos={[]}
        />,
      );
    });

    expect(
      renderer.root.findAll(
        (node: { type: unknown; props: { name?: string } }) =>
          node.type === 'Ionicons' && node.props.name === 'location-outline',
      ),
    ).toHaveLength(0);
    expect(
      renderer.root.findAll(
        (node: { type: unknown; props: { children?: React.ReactNode } }) =>
          node.type === 'Text' && node.props.children === 'Mission District',
      ),
    ).toHaveLength(0);
  });

  it('uses compact layout styles when the food product has no photo', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <HomeFoodProductEntryCard
          entryMeta="FRI APR 18"
          foodProduct={{
            id: 'food-product-3',
            restaurantName: 'Food Product',
            itemName: 'Sparkling Water',
            locationText: 'Corner Store',
            rating: 3,
            createdAt: '2026-04-18T07:00:00.000Z',
            updatedAt: '2026-04-18T07:00:00.000Z',
          }}
          photos={[]}
        />,
      );
    });

    expect(
      flattenStyle(renderer.root.findByProps({ testID: 'home-food-product-entry-content' }).props.style),
    ).toMatchObject({
      flex: 1,
      minHeight: 0,
    });
    expect(
      flattenStyle(renderer.root.findByProps({ testID: 'home-food-product-entry-right' }).props.style),
    ).toMatchObject({
      minHeight: 0,
    });
  });

  it('keeps the default layout height when the food product has a photo', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <HomeFoodProductEntryCard
          entryMeta="FRI APR 18"
          foodProduct={{
            id: 'food-product-4',
            restaurantName: 'Food Product',
            itemName: 'Chocolate Milk',
            locationText: 'Market Hall',
            rating: 5,
            createdAt: '2026-04-18T07:00:00.000Z',
            updatedAt: '2026-04-18T07:00:00.000Z',
          }}
          photos={[
            {
              id: 'photo-1',
              photo: 'milk.jpg',
              created: '2026-04-18T07:00:00.000Z',
            },
          ]}
        />,
      );
    });

    expect(
      flattenStyle(renderer.root.findByProps({ testID: 'home-food-product-entry-content' }).props.style),
    ).toMatchObject({
      flex: 1,
      minHeight: 56,
    });
    expect(
      flattenStyle(renderer.root.findByProps({ testID: 'home-food-product-entry-right' }).props.style),
    ).toMatchObject({
      minHeight: 56,
    });
  });
});
