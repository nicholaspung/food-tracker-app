import React from 'react';
import { act, create } from 'react-test-renderer';

import { HomeQuickTrackEntryCard } from '../components/shared/HomeQuickTrackEntryCard';

const mockReact = React;

jest.mock('@expo/vector-icons', () => ({
  Ionicons: (props: Record<string, unknown>) => mockReact.createElement('Ionicons', props),
}));

jest.mock('react-native', () => ({
  Image: (props: Record<string, unknown>) => mockReact.createElement('Image', props),
  Pressable: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Pressable', props, children),
  View: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('View', props, children),
}));

jest.mock('../features', () => ({
  buildPocketBaseFileUrl: jest.fn(() => 'pb://photo-thumb'),
}));

jest.mock('../lib/ratingConstants', () => ({
  getRatingColor: jest.fn(() => 'success'),
  getRatingLabel: jest.fn(() => 'Great'),
}));

jest.mock('../theme', () => ({
  createThemedStyles: () => () => ({}),
  useTheme: () => ({
    colors: {
      text: {
        secondary: 'secondary',
        danger: 'danger',
        info: 'info',
        brand: 'brand',
      },
    },
  }),
}));

jest.mock('../ui', () => ({
  Text: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Text', props, children),
}));

jest.mock('../components/shared/StatusPill', () => ({
  StatusPill: (props: Record<string, unknown>) => mockReact.createElement('StatusPill', props),
}));

describe('HomeQuickTrackEntryCard', () => {
  it('renders location, notes, and rating metadata when location text exists', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <HomeQuickTrackEntryCard
          entryMeta="FRI APR 18"
          photos={[]}
          quickTrack={{
            id: 'quick-track-1',
            restaurantName: 'Quick Track',
            itemName: 'Iced Coffee',
            locationText: 'Mission District',
            rating: 4,
            notes: 'Smooth and sweet',
            createdAt: '2026-04-18T07:00:00.000Z',
            updatedAt: '2026-04-18T07:00:00.000Z',
          }}
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
    expect(
      renderer.root.findAll(
        (node: { type: unknown; props: { name?: string } }) =>
          node.type === 'Ionicons' && node.props.name === 'location-outline',
      ),
    ).toHaveLength(1);
  });

  it('omits the location row when location text is absent', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <HomeQuickTrackEntryCard
          entryMeta="FRI APR 18"
          photos={[]}
          quickTrack={{
            id: 'quick-track-2',
            restaurantName: 'Quick Track',
            itemName: 'Tea',
            rating: 3,
            createdAt: '2026-04-18T07:00:00.000Z',
            updatedAt: '2026-04-18T07:00:00.000Z',
          }}
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
});
