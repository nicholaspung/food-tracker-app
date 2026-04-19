import React from 'react';
import { act, create } from 'react-test-renderer';
import { PixelRatio, Share } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { VisitShareCustomizationScreen } from '../screens/VisitShareCustomizationScreen';

const mockReact = React;

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

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

jest.mock('../theme', () => ({
  createThemedStyles: () => () => ({}),
  getVisitSharePalette: () => ({
    brandFooterBackground: 'rgba(15, 23, 40, 0.72)',
    brandFooterBorder: 'transparent',
    brandFooterText: 'white',
    canvasBackground: 'white',
    canvasBorder: 'transparent',
    chipActiveBackground: 'dimgray',
    chipActiveBorder: 'gray',
    chipBorder: 'slategray',
    chipLabel: 'gainsboro',
    closeButtonBackground: 'darkslategray',
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
    primaryText: 'white',
    screenBackground: 'black',
    secondaryText: 'whitesmoke',
    statusText: 'gainsboro',
  }),
  useTheme: () => ({
    colors: {
      background: {
        muted: 'whitesmoke',
        surface: 'white',
      },
      text: {
        danger: 'firebrick',
        inverse: 'white',
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
  }),
}));

jest.mock('../ui', () => ({
  Button: (props: Record<string, unknown>) => mockReact.createElement('Button', props),
  Text: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Text', props, children),
}));

const mockedCaptureRef = captureRef as jest.MockedFunction<typeof captureRef>;

describe('VisitShareCustomizationScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders a single Yummy Recs footer inside the captured share canvas', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <VisitShareCustomizationScreen
          navigation={{
            goBack: jest.fn(),
          } as never}
          route={{
            params: {
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
              ],
              restaurantName: 'Noodle House',
              visitDate: '2026-04-18T12:00:00.000Z',
            },
          } as never}
        />,
      );
    });

    const brandLabels = renderer.root.findAll(
      (node: any) => node.type === 'Text' && node.children.includes('Yummy Recs'),
    );

    expect(brandLabels).toHaveLength(1);

    const shareCanvas = renderer.root.findByProps({ testID: 'visit-share-canvas' });
    const brandFootersInCanvas = shareCanvas.findAll(
      (node: any) => node.props.testID === 'visit-share-brand-footer',
    );
    const brandLabelsInCanvas = shareCanvas.findAll(
      (node: any) => node.type === 'Text' && node.children.includes('Yummy Recs'),
    );

    expect(brandFootersInCanvas.length).toBeGreaterThanOrEqual(1);
    expect(brandLabelsInCanvas).toHaveLength(1);
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
            params: {
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
              ],
              restaurantName: 'Noodle House',
              visitDate: '2026-04-18T12:00:00.000Z',
            },
          } as never}
        />,
      );
    });

    const sharePhotoNode = renderer.root.find(
      (node: any) => node.type === 'Image' && typeof node.props.onLoad === 'function',
    );

    await act(async () => {
      sharePhotoNode.props.onLoad();
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
});
