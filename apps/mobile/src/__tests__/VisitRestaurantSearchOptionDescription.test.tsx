import React from 'react';
import { act, create } from 'react-test-renderer';

import { VisitRestaurantSearchOptionDescription } from '../components/shared/VisitRestaurantSearchOptionDescription';

const mockReact = React;

jest.mock('react-native', () => ({
  View: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('View', props, children),
  Text: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Text', props, children),
  StyleSheet: {
    create: (styles: unknown) => styles,
  },
}));

jest.mock('../lib/visitRestaurantSearch', () => ({
  buildVisitRestaurantDescription: jest.fn((restaurant) => [restaurant.location, restaurant.cuisineType].filter(Boolean).join(' • ')),
}));

jest.mock('../ui', () => ({
  Text: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Text', props, children),
}));

jest.mock('../theme', () => ({
  createThemedStyles:
    (factory: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) =>
      factory(
        {
          colors: {
            status: {
              infoBg: 'info-bg',
              infoBorder: 'info-border',
              successBg: 'success-bg',
              successBorder: 'success-border',
            },
            text: {
              info: 'info-text',
              secondary: 'secondary-text',
              success: 'success-text',
            },
          },
          radii: {
            pill: 999,
          },
          spacing: {
            xxs: 2,
            xs: 4,
          },
        },
        ...args,
      ),
  useTheme: () => ({
    colors: {
      text: {
        info: 'info-text',
        secondary: 'secondary-text',
        success: 'success-text',
      },
    },
    typography: {
      bodyMd: {},
      bodySm: {},
    },
  }),
}));

describe('VisitRestaurantSearchOptionDescription', () => {
  it('renders the same location and visit-count content used by restaurant search rows', () => {
    let renderer: any;
    act(() => {
      renderer = create(
        <VisitRestaurantSearchOptionDescription
          distance={null}
          restaurant={{
            cuisineType: 'Cafe',
            friendCount: 2,
            id: 'restaurant-1',
            location: 'West Hollywood, CA',
            name: 'Erewhon West Hollywood',
            userVisitCount: 1,
          }}
        />,
      );
    });

    const text = renderer.root
      .findAllByType('Text')
      .flatMap((node: any) => node.props.children)
      .join('');

    expect(text).toContain('West Hollywood, CA • Cafe');
    expect(text).toContain('You: 1 visit');
    expect(text).toContain('Friends: 2 friends');
  });
});
