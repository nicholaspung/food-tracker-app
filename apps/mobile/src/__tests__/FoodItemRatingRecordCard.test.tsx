import React from 'react';
import { act, create } from 'react-test-renderer';

import { FoodItemRatingRecordCard } from '../components/shared/FoodItemRatingRecordCard';

const mockReact = React;
const theme = {
  colors: {
    background: {
      inverse: 'inverse-background',
      surface: 'surface-background',
    },
    border: {
      info: 'info-border',
      subtle: 'subtle-border',
    },
    status: {
      infoBg: 'info-background',
    },
    text: {
      info: 'info-text',
      inverse: 'inverse-text',
      muted: 'muted-text',
      primary: 'primary-text',
      secondary: 'secondary-text',
    },
  },
  radii: {
    md: 12,
    pill: 999,
    sm: 8,
  },
  spacing: {
    sm: 12,
    xs: 8,
    xxs: 4,
  },
  typography: {
    bodySm: {},
    bodySmTightBold: {},
    bodySmTightSemiBold: {},
    titleSm: {},
  },
} as const;

jest.mock('react-native', () => {
  const React = jest.requireActual<typeof import('react')>('react');

  return {
    Pressable: ({
      children,
      ...props
    }: Record<string, unknown> & {
      children?: React.ReactNode | ((state: { pressed: boolean }) => React.ReactNode);
    }) =>
      React.createElement(
        'Pressable',
        props,
        typeof children === 'function' ? children({ pressed: false }) : children,
      ),
    View: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
      React.createElement('View', props, children),
  };
});

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

jest.mock('../ui/AppIcon', () => ({
  Ionicons: (props: Record<string, unknown>) => mockReact.createElement('Ionicons', props),
}));

jest.mock('../components/shared/RatingPill', () => ({
  RatingPill: (props: Record<string, unknown>) => mockReact.createElement('RatingPill', props),
}));

jest.mock('../components/shared/RecordPhotoThumbnailButton', () => ({
  RecordPhotoThumbnailButton: (props: Record<string, unknown>) =>
    mockReact.createElement('RecordPhotoThumbnailButton', props),
}));

describe('FoodItemRatingRecordCard', () => {
  it('does not mark the long-press wrapper as a button when it contains photo actions', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <FoodItemRatingRecordCard
          itemName="Spicy Ramen"
          onLongPress={jest.fn()}
          onOpenPhotos={jest.fn()}
          photoAccessibilityLabel="View photos for Spicy Ramen"
          photoEntries={[
            {
              id: 'photo-1',
              ownerLabel: 'You',
              previewUrl: 'photo-preview-url',
              url: 'photo-url',
            },
          ]}
          photoTestID="list-detail-photo-button-0-0"
          rows={[
            {
              id: 'row-1',
              label: 'You',
              rating: 8,
              type: 'user',
            },
          ]}
        />,
      );
    });

    const longPressWrapper = renderer.root
      .findAllByType('Pressable')
      .find((node: any) => node.props.onLongPress);

    expect(longPressWrapper).toBeTruthy();
    expect(longPressWrapper.props.accessibilityRole).toBeUndefined();
    expect(renderer.root.findByType('RecordPhotoThumbnailButton').props.testID).toBe(
      'list-detail-photo-button-0-0',
    );
  });
});
