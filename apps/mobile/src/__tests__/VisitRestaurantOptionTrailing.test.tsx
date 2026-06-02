import React from 'react';
import { act, create } from 'react-test-renderer';

import type { RestaurantRecord } from '../features/models';
import { VisitRestaurantOptionTrailing } from '../components/shared/VisitRestaurantOptionTrailing';

const mockReact = React;
const theme = {
  colors: {
    text: {
      info: 'info',
      muted: 'muted',
      secondary: 'secondary',
      success: 'success',
    },
  },
  spacing: {
    xs: 8,
  },
} as const;

jest.mock('react-native', () => ({
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
  Ionicons: ({ name, ...props }: Record<string, unknown>) =>
    mockReact.createElement('Ionicons', { name, ...props }),
}));

function buildRestaurant(overrides: Partial<RestaurantRecord>): RestaurantRecord {
  return {
    id: 'restaurant-1',
    name: 'Cafe',
    ...overrides,
  };
}

describe('VisitRestaurantOptionTrailing', () => {
  it('does not render a visibility icon for public restaurants', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <VisitRestaurantOptionTrailing
          restaurant={buildRestaurant({ visibility: 'public' })}
          selected={false}
        />,
      );
    });

    expect(renderer.toJSON()).toBeNull();
  });

  it('treats Google Places restaurants as public and omits the visibility icon', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <VisitRestaurantOptionTrailing
          restaurant={buildRestaurant({ isGooglePlace: true })}
          selected={false}
        />,
      );
    });

    expect(renderer.toJSON()).toBeNull();
  });

  it('keeps private and friends visibility icons', async () => {
    let privateRenderer: any = null;
    let friendsRenderer: any = null;

    await act(async () => {
      privateRenderer = create(
        <VisitRestaurantOptionTrailing
          restaurant={buildRestaurant({ visibility: 'private' })}
          selected={false}
        />,
      );
      friendsRenderer = create(
        <VisitRestaurantOptionTrailing
          restaurant={buildRestaurant({ visibility: 'friends' })}
          selected={false}
        />,
      );
    });

    expect(privateRenderer.root.findByProps({ name: 'lock-closed-outline' })).toBeDefined();
    expect(friendsRenderer.root.findByProps({ name: 'people-outline' })).toBeDefined();
  });
});
