import React from 'react';
import { act, create } from 'react-test-renderer';
import { PixelRatio, Share } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { VisitShareCustomizationScreen } from '../screens/VisitShareCustomizationScreen';

const mockReact = React;

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({
    bottom: 0,
    left: 0,
    right: 0,
    top: 0,
  }),
}));

jest.mock('react-native-view-shot', () => ({
  captureRef: jest.fn(),
}));

jest.mock('../components/shared', () => ({
  CachedRemoteImage: (props: Record<string, unknown>) => mockReact.createElement('CachedRemoteImage', props),
  LoadingState: (props: Record<string, unknown>) => mockReact.createElement('LoadingState', props),
  SectionHeader: (props: Record<string, unknown>) => mockReact.createElement('SectionHeader', props),
}));

jest.mock('../features', () => ({
  buildPocketBaseFileUrl: jest.fn(() => 'https://example.com/photo.jpg'),
}));

jest.mock('../lib/branding', () => ({
  APP_NAME: 'Yummy Recs',
  BRAND_LOGO: 1,
}));

jest.mock('../lib/ratingConstants', () => ({
  getRatingColor: jest.fn(() => 'green'),
  getRatingLabel: jest.fn(() => 'Loved it'),
}));

jest.mock('../observability', () => ({
  trackObservabilityEvent: jest.fn(),
}));

const mockTheme = {
  colors: {
    background: {
      muted: 'whitesmoke',
      surface: 'white',
    },
    text: {
      danger: 'firebrick',
      inverse: 'black',
      primary: 'midnightblue',
      secondary: 'slategray',
    },
  },
  radii: {
    pill: 999,
  },
  spacing: {
    lg: 24,
    md: 16,
    sm: 12,
    xs: 8,
    xxs: 4,
  },
  typography: {
    bodyBase: { lineHeight: 20 },
    bodyMdTight: { lineHeight: 18 },
    label: { lineHeight: 18 },
    metaTight: { lineHeight: 17 },
  },
};

const mockSharePalette = {
    brandFooterBackground: 'rgba(15, 23, 40, 0.72)',
    brandFooterBorder: 'transparent',
    brandFooterText: 'overlay-white',
    canvasBackground: 'white',
    canvasBorder: 'transparent',
    chipActiveBackground: 'dimgray',
    chipActiveBorder: 'gray',
    chipBorder: 'slategray',
    chipLabel: 'gainsboro',
    chipLabelActive: 'overlay-active',
    closeIcon: 'overlay-close',
    closeButtonBackground: 'darkslategray',
    headerTitle: 'overlay-title',
    headerSubtitle: 'gainsboro',
    itemBackground: 'white',
    itemBorder: 'silver',
    metaRightBackground: 'transparent',
    metaRightBorderColor: 'transparent',
    optionPanelBackground: 'black',
    optionPanelBorder: 'darkgray',
    overlayBackground: 'rgba(15, 23, 40, 0.72)',
    overlayBottomBorderColor: 'transparent',
    overlayTopBorderColor: 'transparent',
    primaryText: 'overlay-primary',
    screenBackground: 'black',
    secondaryText: 'overlay-secondary',
    statusText: 'gainsboro',
};

jest.mock('../theme', () => ({
  createThemedStyles:
    (factory: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) =>
      factory(mockTheme, ...args),
  getVisitSharePalette: () => mockSharePalette,
  useTheme: () => mockTheme,
}));

jest.mock('../ui', () => ({
  Button: (props: Record<string, unknown>) => mockReact.createElement('Button', props),
  Text: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Text', props, children),
}));

const mockedCaptureRef = captureRef as jest.MockedFunction<typeof captureRef>;
const expectedVisitDate = 'Apr 18, 2026';

function buildRouteParams() {
  return {
    items: [
      {
        itemId: 'item-1',
        itemName: 'Miso ramen',
        photoCollectionId: 'collection-1',
        photoCollectionName: 'visit_photos',
        photoFilename: 'ramen.jpg',
        photoId: 'photo-1',
        rating: 5,
      },
      {
        itemId: 'item-2',
        itemName: 'Pork gyoza',
        photoCollectionId: 'collection-1',
        photoCollectionName: 'visit_photos',
        photoFilename: 'gyoza.jpg',
        photoId: 'photo-2',
        rating: 4,
      },
    ],
    restaurantName: 'Noodle House',
    visitDate: '2026-04-18T12:00:00.000Z',
  };
}

function flattenStyle(style: any): Record<string, unknown> {
  if (Array.isArray(style)) {
    return style.reduce<Record<string, unknown>>((combined, entry) => ({
      ...combined,
      ...flattenStyle(entry),
    }), {});
  }

  if (style && typeof style === 'object') {
    return style;
  }

  return {};
}

function findTextMatches(root: any, text: string) {
  return root.findAll((node: any) => node.type === 'Text' && node.children.includes(text));
}

function findPressableByLabel(root: any, label: string) {
  return root.find(
    (node: any) =>
      typeof node.props.onPress === 'function'
      && node.findAll((child: any) => child.type === 'Text' && child.children.includes(label)).length > 0,
  );
}

describe('VisitShareCustomizationScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders restaurant and date once in the captured footer for multi-item shares', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <VisitShareCustomizationScreen
          navigation={{
            goBack: jest.fn(),
          } as never}
          route={{
            params: buildRouteParams(),
          } as never}
        />,
      );
    });

    const brandLabels = findTextMatches(renderer.root, 'Yummy Recs');

    expect(brandLabels).toHaveLength(1);

    const shareCanvas = renderer.root.findByProps({ testID: 'visit-share-canvas' });
    const brandFootersInCanvas = shareCanvas.findAll((node: any) => node.props.testID === 'visit-share-brand-footer');
    const brandLabelsInCanvas = findTextMatches(shareCanvas, 'Yummy Recs');
    const restaurantLabelsInCanvas = findTextMatches(shareCanvas, 'Noodle House');
    const visitDateLabelsInCanvas = findTextMatches(shareCanvas, expectedVisitDate);

    expect(brandFootersInCanvas.length).toBeGreaterThanOrEqual(1);
    expect(brandLabelsInCanvas).toHaveLength(1);
    expect(restaurantLabelsInCanvas).toHaveLength(1);
    expect(visitDateLabelsInCanvas).toHaveLength(1);
  });

  it('keeps footer metadata toggles independent', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <VisitShareCustomizationScreen
          navigation={{
            goBack: jest.fn(),
          } as never}
          route={{
            params: buildRouteParams(),
          } as never}
        />,
      );
    });

    const shareCanvas = () => renderer.root.findByProps({ testID: 'visit-share-canvas' });

    expect(findTextMatches(shareCanvas(), 'Noodle House')).toHaveLength(1);
    expect(findTextMatches(shareCanvas(), expectedVisitDate)).toHaveLength(1);

    await act(async () => {
      findPressableByLabel(renderer.root, 'Restaurant').props.onPress();
    });

    expect(findTextMatches(shareCanvas(), 'Noodle House')).toHaveLength(0);
    expect(findTextMatches(shareCanvas(), expectedVisitDate)).toHaveLength(1);

    await act(async () => {
      findPressableByLabel(renderer.root, 'Date').props.onPress();
    });

    expect(findTextMatches(shareCanvas(), 'Noodle House')).toHaveLength(0);
    expect(findTextMatches(shareCanvas(), expectedVisitDate)).toHaveLength(0);
  });

  it('announces selected state for customization chips', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <VisitShareCustomizationScreen
          navigation={{
            goBack: jest.fn(),
          } as never}
          route={{
            params: buildRouteParams(),
          } as never}
        />,
      );
    });

    const modernChip = renderer.root.findByProps({ accessibilityLabel: 'Overlay style Modern' });
    const rusticChip = renderer.root.findByProps({ accessibilityLabel: 'Overlay style Rustic' });
    const dishChip = renderer.root.findByProps({ accessibilityLabel: 'Show Dish Name on photos' });
    const ratingChip = renderer.root.findByProps({ accessibilityLabel: 'Show Rating on photos' });
    const restaurantChip = renderer.root.findByProps({ accessibilityLabel: 'Show Restaurant in footer' });
    const dateChip = renderer.root.findByProps({ accessibilityLabel: 'Show Date in footer' });

    expect(modernChip.props.accessibilityRole).toBe('button');
    expect(modernChip.props.accessibilityState).toEqual({ selected: true });
    expect(rusticChip.props.accessibilityState).toEqual({ selected: false });
    expect(dishChip.props.accessibilityState).toEqual({ selected: true });
    expect(ratingChip.props.accessibilityState).toEqual({ selected: true });
    expect(restaurantChip.props.accessibilityState).toEqual({ selected: true });
    expect(dateChip.props.accessibilityState).toEqual({ selected: true });

    await act(async () => {
      rusticChip.props.onPress();
      dishChip.props.onPress();
      restaurantChip.props.onPress();
    });

    expect(renderer.root.findByProps({ accessibilityLabel: 'Overlay style Modern' }).props.accessibilityState).toEqual({
      selected: false,
    });
    expect(renderer.root.findByProps({ accessibilityLabel: 'Overlay style Rustic' }).props.accessibilityState).toEqual({
      selected: true,
    });
    expect(renderer.root.findByProps({ accessibilityLabel: 'Show Dish Name on photos' }).props.accessibilityState).toEqual({
      selected: false,
    });
    expect(renderer.root.findByProps({ accessibilityLabel: 'Show Restaurant in footer' }).props.accessibilityState).toEqual({
      selected: false,
    });
  });

  it('shrinks the footer reservation when footer metadata rows are hidden', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <VisitShareCustomizationScreen
          navigation={{
            goBack: jest.fn(),
          } as never}
          route={{
            params: buildRouteParams(),
          } as never}
        />,
      );
    });

    const getFooterHeight = () =>
      flattenStyle(renderer.root.findByProps({ testID: 'visit-share-brand-footer' }).props.style).height;
    const getCanvasPaddingBottom = () =>
      flattenStyle(renderer.root.findByProps({ testID: 'visit-share-canvas-content' }).props.style).paddingBottom;

    expect(getFooterHeight()).toBe(80);
    expect(getCanvasPaddingBottom()).toBe(80);

    await act(async () => {
      findPressableByLabel(renderer.root, 'Restaurant').props.onPress();
    });

    expect(getFooterHeight()).toBe(58);
    expect(getCanvasPaddingBottom()).toBe(58);

    await act(async () => {
      findPressableByLabel(renderer.root, 'Date').props.onPress();
    });

    expect(getFooterHeight()).toBe(34);
    expect(getCanvasPaddingBottom()).toBe(34);
  });

  it('captures a fixed 1080x1920 story-sized export', async () => {
    let renderer: any = null;
    const pixelRatioSpy = jest.spyOn(PixelRatio, 'get').mockReturnValue(3);
    const shareSpy = jest.spyOn(Share, 'share').mockResolvedValue({
      action: Share.sharedAction,
    } as Awaited<ReturnType<typeof Share.share>>);

    mockedCaptureRef.mockResolvedValue('file:///tmp/share.jpg');

    await act(async () => {
      renderer = create(
        <VisitShareCustomizationScreen
          navigation={{
            goBack: jest.fn(),
          } as never}
          route={{
            params: buildRouteParams(),
          } as never}
        />,
      );
    });

    const sharePhotoNodes = renderer.root.findAll(
      (node: any) => node.type === 'Image' && typeof node.props.onLoad === 'function',
    );

    await act(async () => {
      sharePhotoNodes.forEach((node: any) => {
        node.props.onLoad();
      });
    });

    await act(async () => {
      renderer.root.findByType('Button').props.onPress();
    });

    expect(mockedCaptureRef).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        format: 'jpg',
        height: 640,
        quality: 0.95,
        result: 'tmpfile',
        width: 360,
      }),
    );
    expect(shareSpy).toHaveBeenCalled();

    pixelRatioSpy.mockRestore();
    shareSpy.mockRestore();
  });

  it('keeps share modal chrome and exported modern overlay text readable in dark mode', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <VisitShareCustomizationScreen
          navigation={{
            goBack: jest.fn(),
          } as never}
          route={{
            params: buildRouteParams(),
          } as never}
        />,
      );
    });

    const shareCanvas = renderer.root.findByProps({ testID: 'visit-share-canvas' });
    const title = findTextMatches(renderer.root, 'Share Visit')[0];
    const itemName = findTextMatches(shareCanvas, 'Miso ramen')[0];
    const ratingLabel = findTextMatches(shareCanvas, 'Loved it')[0];
    const restaurantLabel = findTextMatches(shareCanvas, 'Noodle House')[0];
    const activeModernChip = findTextMatches(renderer.root, 'Modern')[0];

    const closeIcon = renderer.root.find(
      (node: any) => node.type === 'Ionicons' && node.props.name === 'close',
    );

    expect(flattenStyle(title.props.style).color).toBe('overlay-title');
    expect(closeIcon.props.color).toBe('overlay-close');
    expect(flattenStyle(itemName.props.style).color).toBe('overlay-primary');
    expect(flattenStyle(ratingLabel.props.style).color).toBe('overlay-secondary');
    expect(flattenStyle(restaurantLabel.props.style).color).toBe('overlay-white');
    expect(flattenStyle(activeModernChip.props.style).color).toBe('overlay-active');
  });
});
