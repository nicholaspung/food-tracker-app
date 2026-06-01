import React from 'react';
import { act, create } from 'react-test-renderer';

import type { HomeFeedMapPoint } from '../features';
import { RestaurantMapView } from '../components/maps/RestaurantMapView';
import { useForegroundLocationCapture } from '../hooks/useForegroundLocationCapture';
import { HomeFeedMapView } from '../screens/home/HomeFeedMapView';

const mockReact = React;
const mockAnimateToRegion = jest.fn();
const mockCaptureLocation = jest.fn();

jest.mock('react-native', () => {
  const react = jest.requireActual<typeof import('react')>('react');

  return {
    ActivityIndicator: (props: Record<string, unknown>) => react.createElement('ActivityIndicator', props),
    Pressable: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
      react.createElement('Pressable', props, children),
    View: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
      react.createElement('View', props, children),
  };
});

jest.mock('react-native-maps', () => {
  const react = jest.requireActual<typeof import('react')>('react');

  return {
    __esModule: true,
    default: react.forwardRef(function MockMapView(
      { children, ...props }: Record<string, unknown> & { children?: React.ReactNode },
      ref: React.ForwardedRef<{ animateToRegion: jest.Mock }>,
    ) {
      react.useImperativeHandle(ref, () => ({
        animateToRegion: mockAnimateToRegion,
      }));

      return react.createElement('MapView', props, children);
    }),
    Marker: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
      react.createElement('Marker', props, children),
  };
});

jest.mock('../components/shared', () => ({
  CurrentLocationButton: (props: Record<string, unknown>) => mockReact.createElement('CurrentLocationButton', props),
  EmptyState: (props: Record<string, unknown>) => mockReact.createElement('EmptyState', props),
  ErrorState: (props: Record<string, unknown>) => mockReact.createElement('ErrorState', props),
  LoadingOverlay: (props: Record<string, unknown>) => mockReact.createElement('LoadingOverlay', props),
}));

jest.mock('../hooks/useForegroundLocationCapture', () => ({
  useForegroundLocationCapture: jest.fn(),
}));

jest.mock('../lib/photoUrls', () => ({
  buildPhotoThumbnailUrl: () => 'photo-thumbnail-url',
}));

jest.mock('../components/maps/RestaurantMapSheet', () => ({
  RestaurantMapSheet: (props: Record<string, unknown>) =>
    mockReact.createElement('RestaurantMapSheet', props),
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
          danger: 'danger-border',
          default: 'default-border',
        },
        text: {
          brand: 'brand-text',
          danger: 'danger-text',
          secondary: 'secondary-text',
        },
      },
      radii: {
        md: 10,
        pill: 999,
      },
      sizes: {
        inputMinHeight: 48,
      },
      spacing: {
        lg: 24,
        sm: 12,
        xs: 8,
        xxl: 40,
      },
    }),
  useTheme: () => ({
    colors: {
      rating: {
        three: 'rating-three',
        five: 'rating-five',
      },
      text: {
        muted: 'muted-text',
        secondary: 'secondary-text',
      },
    },
    spacing: {
      lg: 24,
      sm: 12,
      xxl: 40,
    },
  }),
}));

jest.mock('../ui', () => ({
  Text: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Text', props, children),
}));

const mockedUseForegroundLocationCapture = useForegroundLocationCapture as jest.MockedFunction<
  typeof useForegroundLocationCapture
>;

function buildPoint(): HomeFeedMapPoint {
  return {
    eventAt: '2026-05-01T00:00:00.000Z',
    id: 'visit_visit-1',
    latitude: 34.05,
    longitude: -118.24,
    ratingSummaryLabel: '3.0 avg',
    restaurantId: 'restaurant-1',
    restaurantLocation: 'Los Angeles',
    restaurantName: 'CCB Snack Bar',
    source: 'visit',
    visit: {
      createdAt: '2026-05-01T00:00:00.000Z',
      id: 'visit-1',
      items: [
        {
          id: 'item-1',
          name: 'Karaage',
          rating: 3,
        },
      ],
      restaurantId: 'restaurant-1',
      restaurantLocation: 'Los Angeles',
      restaurantName: 'CCB Snack Bar',
      source: 'visit',
      updatedAt: '2026-05-01T00:00:00.000Z',
      visitedAt: '2026-05-01T00:00:00.000Z',
    },
  };
}

function renderMapView(
  props: Partial<React.ComponentProps<typeof HomeFeedMapView>> = {},
) {
  let renderer: any = null;

  act(() => {
    renderer = create(
      <HomeFeedMapView
        errorMessage={null}
        feedMode="mine"
        loading={false}
        omittedWithoutCoordinates={0}
        onRetry={jest.fn()}
        onSelectedGroupChange={jest.fn()}
        points={[buildPoint()]}
        selectedGroupId={null}
        {...props}
      />,
    );
  });

  return renderer;
}

function renderRestaurantMapView(
  props: Partial<React.ComponentProps<typeof RestaurantMapView>> = {},
) {
  let renderer: any = null;

  act(() => {
    renderer = create(
      <RestaurantMapView
        analyticsSource="TestMapView"
        emptyDescription="No restaurants."
        emptyTitle="No restaurants"
        errorMessage={null}
        groups={[
          {
            id: 'restaurant-1',
            items: [{ id: 'restaurant-1', meta: [], name: 'Restaurant' }],
            latitude: 34.05,
            longitude: -118.24,
            restaurantName: 'CCB Snack Bar',
            summary: 'Restaurant',
          },
        ]}
        loading={false}
        mapTestID="test-map"
        omittedWithoutCoordinates={0}
        onRetry={jest.fn()}
        onSelectedGroupChange={jest.fn()}
        selectedGroupId={null}
        testID="test-map-view"
        {...props}
      />,
    );
  });

  return renderer;
}

const secondMapGroup = {
  id: 'restaurant-2',
  items: [{ id: 'restaurant-2', meta: [], name: 'Restaurant' }],
  latitude: 34.1,
  longitude: -118.3,
  restaurantName: 'Second Restaurant',
  summary: 'Restaurant',
};

describe('HomeFeedMapView', () => {
  beforeEach(() => {
    mockAnimateToRegion.mockClear();
    mockCaptureLocation.mockReset();
    mockedUseForegroundLocationCapture.mockReturnValue({
      captureLocation: mockCaptureLocation,
      isCapturing: false,
      permissionNeedsSettings: false,
      resetPermissionNeedsSettings: jest.fn(),
    });
  });

  it('selects a restaurant marker without relying on a native marker callout', () => {
    const onSelectedGroupChange = jest.fn();
    const renderer = renderMapView({
      onSelectedGroupChange,
    });

    const marker = renderer.root.findByType('Marker');
    const stopPropagation = jest.fn();
    expect(marker.props.title).toBeUndefined();

    act(() => {
      marker.props.onPress({
        stopPropagation,
      });
    });

    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(onSelectedGroupChange).toHaveBeenCalledWith('restaurant-1');
    expect(mockAnimateToRegion).toHaveBeenCalledWith(
      expect.objectContaining({
        latitude: 34.05,
        latitudeDelta: 0.035,
        longitude: -118.24,
        longitudeDelta: 0.035,
      }),
      300,
    );
  });

  it('clears selected restaurant when the map background is pressed', () => {
    const onSelectedGroupChange = jest.fn();
    const renderer = renderMapView({
      onSelectedGroupChange,
      selectedGroupId: 'restaurant-1',
    });

    act(() => {
      renderer.root.findByType('MapView').props.onPress();
    });

    expect(onSelectedGroupChange).toHaveBeenCalledWith(null);
  });

  it('passes the selected restaurant group to the bottom sheet', () => {
    const onOpenPhotoViewer = jest.fn();
    const renderer = renderMapView({
      onOpenPhotoViewer,
      selectedGroupId: 'restaurant-1',
    });

    const sheet = renderer.root.findByType('RestaurantMapSheet');
    expect(sheet.props.group).toMatchObject({
      id: 'restaurant-1',
      restaurantName: 'CCB Snack Bar',
    });
    expect(sheet.props.group.items[0].onOpenPhotos).toBeUndefined();
  });

  it('formats selected restaurant item dates from the active feed mode', () => {
    const renderer = renderMapView({
      feedMode: 'friends',
      selectedGroupId: 'restaurant-1',
    });

    const sheet = renderer.root.findByType('RestaurantMapSheet');
    expect(sheet.props.group.items[0].meta[0].dateLabel).toBe('May 2026');
  });

  it('resets the map camera to the initial region when reset signal changes', () => {
    const renderer = renderMapView({
      resetSignal: 0,
    });
    mockAnimateToRegion.mockClear();

    act(() => {
      renderer.update(
        <HomeFeedMapView
          errorMessage={null}
          feedMode="mine"
          loading={false}
          omittedWithoutCoordinates={0}
          onRetry={jest.fn()}
          onSelectedGroupChange={jest.fn()}
          points={[buildPoint()]}
          resetSignal={1}
          selectedGroupId={null}
        />,
      );
    });

    expect(mockAnimateToRegion).toHaveBeenCalledWith(
      expect.objectContaining({
        latitude: 34.05,
        latitudeDelta: 0.045,
        longitude: -118.24,
        longitudeDelta: 0.045,
      }),
      0,
    );
  });

  it('resets selected restaurant and camera when the reset button is pressed', () => {
    const onSelectedGroupChange = jest.fn();
    const renderer = renderMapView({
      onSelectedGroupChange,
      selectedGroupId: 'restaurant-1',
    });
    mockAnimateToRegion.mockClear();

    act(() => {
      renderer.root.findByProps({ accessibilityLabel: 'Reset map view' }).props.onPress();
    });

    expect(onSelectedGroupChange).toHaveBeenCalledWith(null);
    expect(mockAnimateToRegion).toHaveBeenCalledWith(
      expect.objectContaining({
        latitude: 34.05,
        latitudeDelta: 0.045,
        longitude: -118.24,
        longitudeDelta: 0.045,
      }),
      300,
    );
  });

  it('dismisses the hidden-location helper banner', () => {
    const renderer = renderMapView({
      omittedWithoutCoordinates: 22,
    });

    const dismissButtons = renderer.root.findAllByProps({ accessibilityLabel: 'Hide hidden-location message' });
    expect(dismissButtons.length).toBeGreaterThan(0);

    act(() => {
      dismissButtons[0].props.onPress();
    });

    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Hide hidden-location message' })).toHaveLength(0);
  });

  it('recenters to a 50 mile current-location viewport on GPS success', async () => {
    mockCaptureLocation.mockResolvedValue({
      coordinates: {
        latitude: 34.05,
        longitude: -118.24,
      },
      label: '34.050000, 118.240000W',
      status: 'success',
    });
    const renderer = renderMapView();

    await act(async () => {
      await renderer.root.findByType('CurrentLocationButton').props.onPress();
    });

    expect(mockAnimateToRegion).toHaveBeenCalledWith(
      expect.objectContaining({
        latitude: 34.05,
        latitudeDelta: expect.closeTo(1.6667, 3),
        longitude: -118.24,
      }),
      350,
    );
  });

  it('shows the user location when initial user coordinates are provided', () => {
    const renderer = renderRestaurantMapView({
      initialUserCoordinates: {
        latitude: 34.05,
        longitude: -118.24,
      },
    });

    expect(renderer.root.findByType('MapView').props.showsUserLocation).toBe(true);
  });

  it('does not show the user location before coordinates are available', () => {
    const renderer = renderRestaurantMapView();

    expect(renderer.root.findByType('MapView').props.showsUserLocation).toBe(false);
  });

  it('keeps default map control offset without an external inset', () => {
    const renderer = renderRestaurantMapView();

    const controls = renderer.root.findByProps({ testID: 'test-map-view-controls' });
    expect(controls.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ top: 12 }),
      ]),
    );
  });

  it('applies an external top inset to map controls', () => {
    const renderer = renderRestaurantMapView({
      externalTopInset: 80,
    });

    const controls = renderer.root.findByProps({ testID: 'test-map-view-controls' });
    expect(controls.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ top: 92 }),
      ]),
    );
  });

  it('can hide the GPS control while keeping reset visible', () => {
    const renderer = renderRestaurantMapView({
      showCurrentLocationControl: false,
    });

    expect(renderer.root.findAllByType('CurrentLocationButton')).toHaveLength(0);
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Reset map view' }).length).toBeGreaterThan(0);
  });

  it('does not report region changes until the user pans the map', () => {
    const onUserRegionChangeComplete = jest.fn();
    const renderer = renderRestaurantMapView({
      onUserRegionChangeComplete,
    });
    const region = {
      latitude: 34.05,
      latitudeDelta: 0.1,
      longitude: -118.24,
      longitudeDelta: 0.1,
    };

    act(() => {
      renderer.root.findByType('MapView').props.onRegionChangeComplete(region);
    });

    expect(onUserRegionChangeComplete).not.toHaveBeenCalled();
  });

  it('reports completed regions after a user pan', () => {
    const onUserRegionChangeComplete = jest.fn();
    const renderer = renderRestaurantMapView({
      onUserRegionChangeComplete,
    });
    const region = {
      latitude: 34.05,
      latitudeDelta: 0.1,
      longitude: -118.24,
      longitudeDelta: 0.1,
    };

    act(() => {
      const map = renderer.root.findByType('MapView');
      map.props.onPanDrag();
      map.props.onRegionChangeComplete(region);
    });

    expect(onUserRegionChangeComplete).toHaveBeenCalledWith(region);
  });

  it('keeps default group-change camera fitting behavior', () => {
    const renderer = renderRestaurantMapView();
    mockAnimateToRegion.mockClear();

    act(() => {
      renderer.update(
        <RestaurantMapView
          analyticsSource="TestMapView"
          emptyDescription="No restaurants."
          emptyTitle="No restaurants"
          errorMessage={null}
          groups={[
            {
              id: 'restaurant-1',
              items: [{ id: 'restaurant-1', meta: [], name: 'Restaurant' }],
              latitude: 34.05,
              longitude: -118.24,
              restaurantName: 'CCB Snack Bar',
              summary: 'Restaurant',
            },
            secondMapGroup,
          ]}
          loading={false}
          mapTestID="test-map"
          omittedWithoutCoordinates={0}
          onRetry={jest.fn()}
          onSelectedGroupChange={jest.fn()}
          selectedGroupId={null}
          testID="test-map-view"
        />,
      );
    });

    expect(mockAnimateToRegion).toHaveBeenCalledWith(
      expect.objectContaining({
        latitude: 34.075,
        longitude: -118.27,
      }),
      0,
    );
  });

  it('preserves the current camera when groups change and preservation is enabled', () => {
    const renderer = renderRestaurantMapView({
      preserveRegionOnGroupsChange: true,
    });
    mockAnimateToRegion.mockClear();

    act(() => {
      renderer.update(
        <RestaurantMapView
          analyticsSource="TestMapView"
          emptyDescription="No restaurants."
          emptyTitle="No restaurants"
          errorMessage={null}
          groups={[
            {
              id: 'restaurant-1',
              items: [{ id: 'restaurant-1', meta: [], name: 'Restaurant' }],
              latitude: 34.05,
              longitude: -118.24,
              restaurantName: 'CCB Snack Bar',
              summary: 'Restaurant',
            },
            secondMapGroup,
          ]}
          loading={false}
          mapTestID="test-map"
          omittedWithoutCoordinates={0}
          onRetry={jest.fn()}
          onSelectedGroupChange={jest.fn()}
          preserveRegionOnGroupsChange
          selectedGroupId={null}
          testID="test-map-view"
        />,
      );
    });

    expect(mockAnimateToRegion).not.toHaveBeenCalled();
  });

  it('still resets the camera when reset signal changes while preserving group changes', () => {
    const renderer = renderRestaurantMapView({
      preserveRegionOnGroupsChange: true,
      resetSignal: 0,
    });
    mockAnimateToRegion.mockClear();

    act(() => {
      renderer.update(
        <RestaurantMapView
          analyticsSource="TestMapView"
          emptyDescription="No restaurants."
          emptyTitle="No restaurants"
          errorMessage={null}
          groups={[
            {
              id: 'restaurant-1',
              items: [{ id: 'restaurant-1', meta: [], name: 'Restaurant' }],
              latitude: 34.05,
              longitude: -118.24,
              restaurantName: 'CCB Snack Bar',
              summary: 'Restaurant',
            },
          ]}
          loading={false}
          mapTestID="test-map"
          omittedWithoutCoordinates={0}
          onRetry={jest.fn()}
          onSelectedGroupChange={jest.fn()}
          preserveRegionOnGroupsChange
          resetSignal={1}
          selectedGroupId={null}
          testID="test-map-view"
        />,
      );
    });

    expect(mockAnimateToRegion).toHaveBeenCalledWith(
      expect.objectContaining({
        latitude: 34.05,
        longitude: -118.24,
      }),
      300,
    );
  });

  it('shows a non-blocking GPS permission error', async () => {
    mockCaptureLocation.mockResolvedValue({
      canAskAgain: true,
      message: 'Location permission is required to recenter the map.',
      status: 'permission_denied',
    });
    const renderer = renderMapView();

    await act(async () => {
      await renderer.root.findByType('CurrentLocationButton').props.onPress();
    });

    expect(
      renderer.root.findAll(
        (node: { children: unknown[]; type: unknown }) =>
          node.type === 'Text' && node.children.includes('Location permission is required to recenter the map.'),
      ),
    ).toHaveLength(1);
  });
});
