import React from 'react';
import { act, create } from 'react-test-renderer';

import { PhotoViewerModal } from '../components/shared/PhotoViewerModal';
import {
  __resetPhotoImageCacheForTests,
  markPhotoImageLoaded,
  markPhotoImagePrefetched,
} from '../lib/photoImageCache';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: (props: Record<string, unknown>) => {
    const React = jest.requireActual<typeof import('react')>('react');
    return React.createElement('Ionicons', props);
  },
}));

jest.mock('react-native', () => {
  const React = jest.requireActual<typeof import('react')>('react');

  class MockAnimatedValue {
    private value: number;

    constructor(value: number) {
      this.value = value;
    }

    setValue(nextValue: number) {
      this.value = nextValue;
    }

    stopAnimation() {}

    __getValue() {
      return this.value;
    }
  }

  const FlatList = React.forwardRef(function MockFlatList(
    inputProps: unknown,
    ref: React.ForwardedRef<{ scrollToIndex: () => void }>,
  ) {
    const { data, renderItem, ...props } = inputProps as {
      data: string[];
      renderItem: (item: { item: string; index: number }) => React.ReactNode;
    } & Record<string, unknown>;

    React.useImperativeHandle(ref, () => ({
      scrollToIndex: () => undefined,
    }));

    return React.createElement(
      'FlatList',
      props,
      data.map((item, index) =>
        React.createElement(React.Fragment, { key: `${item}-${index}` }, renderItem({ item, index })),
      ),
    );
  });
  FlatList.displayName = 'MockFlatList';

  return {
    Animated: {
      Image: (props: Record<string, unknown>) => React.createElement('AnimatedImage', props),
      Value: MockAnimatedValue,
      timing: (value: MockAnimatedValue, config: { toValue: number }) => ({
        start: () => {
          value.setValue(config.toValue);
        },
      }),
    },
    FlatList,
    Image: Object.assign(
      (props: Record<string, unknown>) => React.createElement('Image', props),
      {
        prefetch: jest.fn().mockResolvedValue(true),
      },
    ),
    Modal: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
      React.createElement('Modal', props, children),
    Pressable: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
      React.createElement('Pressable', props, children),
    StyleSheet: {
      absoluteFillObject: {
        bottom: 0,
        left: 0,
        position: 'absolute',
        right: 0,
        top: 0,
      },
      create: <T,>(styles: T) => styles,
    },
    View: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
      React.createElement('View', props, children),
    useWindowDimensions: () => ({ height: 640, width: 320 }),
  };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({
    bottom: 0,
    top: 0,
  }),
}));

jest.mock('../theme', () => ({
  createThemedStyles:
    (factory: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) =>
      factory(
        {
          colors: {
            text: {
              inverse: 'white',
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
          },
        },
        ...args,
      ),
  getPhotoViewerPalette: () => ({
    background: 'black',
    controlBackground: 'gray',
    text: 'white',
  }),
  useTheme: () => ({
    colors: {
      text: {
        inverse: 'white',
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
    },
  }),
}));

jest.mock('../ui', () => ({
  Text: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) => {
    const React = jest.requireActual<typeof import('react')>('react');
    return React.createElement('Text', props, children);
  },
}));

function extractOpacity(node: { props: { style?: unknown } }): number | undefined {
  const styles = Array.isArray(node.props.style) ? node.props.style : [node.props.style];
  const opacityEntry = styles.find(
    (style): style is { opacity?: number | { __getValue: () => number } } =>
      Boolean(style) && typeof style === 'object' && 'opacity' in style,
  );

  if (!opacityEntry || typeof opacityEntry.opacity === 'undefined') {
    return undefined;
  }

  return typeof opacityEntry.opacity === 'object' &&
    opacityEntry.opacity !== null &&
    '__getValue' in opacityEntry.opacity
    ? opacityEntry.opacity.__getValue()
    : opacityEntry.opacity;
}

function findImageByTestID(renderer: any, testID: string) {
  return renderer.root.find(
    (node: any) =>
      (node.type === 'Image' || node.type === 'AnimatedImage') && node.props.testID === testID,
  );
}

describe('PhotoViewerModal', () => {
  beforeEach(() => {
    const { Image } = jest.requireMock('react-native') as {
      Image: { prefetch: jest.Mock };
    };
    __resetPhotoImageCacheForTests();
    Image.prefetch.mockClear();
  });

  it('renders the preview immediately and fades in the full image after load', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <PhotoViewerModal
          onRequestClose={jest.fn()}
          previewUrls={['thumb://photo']}
          urls={['full://photo']}
          visible
        />,
      );
    });

    const previewImage = findImageByTestID(renderer, 'photo-viewer-preview-image');
    const fullImage = findImageByTestID(renderer, 'photo-viewer-full-image');

    expect(previewImage.props.source).toEqual({ cache: 'force-cache', uri: 'thumb://photo' });
    expect(extractOpacity(fullImage)).toBe(0);

    await act(async () => {
      fullImage.props.onLoad();
    });

    expect(extractOpacity(fullImage)).toBe(1);
    expect(renderer.root.findAllByProps({ testID: 'photo-viewer-preview-image' })).toHaveLength(0);
  });

  it('shows the full image immediately when the preview uri matches the full uri', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <PhotoViewerModal
          onRequestClose={jest.fn()}
          previewUrls={['same://photo']}
          urls={['same://photo']}
          visible
        />,
      );
    });

    expect(renderer.root.findAllByProps({ testID: 'photo-viewer-preview-image' })).toHaveLength(0);
    expect(extractOpacity(renderer.root.findByProps({ testID: 'photo-viewer-full-image' }))).toBe(1);
  });

  it('shows a previously loaded full image immediately even when a preview uri exists', async () => {
    markPhotoImageLoaded('full://already-loaded-photo');
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <PhotoViewerModal
          onRequestClose={jest.fn()}
          previewUrls={['thumb://already-loaded-photo']}
          urls={['full://already-loaded-photo']}
          visible
        />,
      );
    });

    expect(renderer.root.findAllByProps({ testID: 'photo-viewer-preview-image' })).toHaveLength(0);
    expect(extractOpacity(renderer.root.findByProps({ testID: 'photo-viewer-full-image' }))).toBe(1);
  });

  it('shows a full image immediately after closing and reopening once it has loaded', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <PhotoViewerModal
          onRequestClose={jest.fn()}
          previewUrls={['thumb://reopened-photo']}
          urls={['full://reopened-photo']}
          visible
        />,
      );
    });

    let fullImage = renderer.root.findByProps({ testID: 'photo-viewer-full-image' });

    await act(async () => {
      fullImage.props.onLoad();
    });

    await act(async () => {
      renderer.update(
        <PhotoViewerModal
          onRequestClose={jest.fn()}
          previewUrls={['thumb://reopened-photo']}
          urls={['full://reopened-photo']}
          visible={false}
        />,
      );
    });

    await act(async () => {
      renderer.update(
        <PhotoViewerModal
          onRequestClose={jest.fn()}
          previewUrls={['thumb://reopened-photo']}
          urls={['full://reopened-photo']}
          visible
        />,
      );
    });

    fullImage = renderer.root.findByProps({ testID: 'photo-viewer-full-image' });

    expect(renderer.root.findAllByProps({ testID: 'photo-viewer-preview-image' })).toHaveLength(0);
    expect(extractOpacity(fullImage)).toBe(1);
  });

  it('keeps the preview under a prefetched full image until that image loads in the slide', async () => {
    markPhotoImagePrefetched('full://prefetched-photo');
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <PhotoViewerModal
          onRequestClose={jest.fn()}
          previewUrls={['thumb://prefetched-photo']}
          urls={['full://prefetched-photo']}
          visible
        />,
      );
    });

    const fullImage = renderer.root.findByProps({ testID: 'photo-viewer-full-image' });

    expect(renderer.root.findAllByProps({ testID: 'photo-viewer-preview-image' }).length).toBeGreaterThan(0);
    expect(extractOpacity(fullImage)).toBe(1);

    await act(async () => {
      fullImage.props.onLoad();
    });

    expect(renderer.root.findAllByProps({ testID: 'photo-viewer-preview-image' })).toHaveLength(0);
    expect(extractOpacity(fullImage)).toBe(1);
  });

  it('keeps the preview visible when the full image fails to load', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <PhotoViewerModal
          onRequestClose={jest.fn()}
          previewUrls={['thumb://photo-error']}
          urls={['full://photo-error']}
          visible
        />,
      );
    });

    const fullImage = renderer.root.findByProps({ testID: 'photo-viewer-full-image' });

    await act(async () => {
      fullImage.props.onError();
    });

    expect(renderer.root.findAllByProps({ testID: 'photo-viewer-preview-image' }).length).toBeGreaterThan(0);
    expect(extractOpacity(fullImage)).toBe(0);
  });

  it('keeps a loaded full image visible when the preview input changes', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <PhotoViewerModal
          onRequestClose={jest.fn()}
          previewUrls={['thumb://photo-1-reset']}
          urls={['full://photo-reset']}
          visible
        />,
      );
    });

    let fullImage = renderer.root.findByProps({ testID: 'photo-viewer-full-image' });

    await act(async () => {
      fullImage.props.onLoad();
    });

    expect(renderer.root.findAllByProps({ testID: 'photo-viewer-preview-image' })).toHaveLength(0);

    await act(async () => {
      renderer.update(
        <PhotoViewerModal
          onRequestClose={jest.fn()}
          previewUrls={['thumb://photo-2-reset']}
          urls={['full://photo-reset']}
          visible
        />,
      );
    });

    fullImage = renderer.root.findByProps({ testID: 'photo-viewer-full-image' });

    expect(renderer.root.findAllByProps({ testID: 'photo-viewer-preview-image' })).toHaveLength(0);
    expect(extractOpacity(fullImage)).toBe(1);
  });

  it('prefetches the current and adjacent full-size images while visible', async () => {
    const { Image } = jest.requireMock('react-native') as {
      Image: { prefetch: jest.Mock };
    };

    await act(async () => {
      create(
        <PhotoViewerModal
          initialIndex={1}
          onRequestClose={jest.fn()}
          previewUrls={['thumb://one', 'thumb://two', 'thumb://three']}
          urls={['full://one', 'full://two', 'full://three']}
          visible
        />,
      );
    });

    expect(Image.prefetch).toHaveBeenCalledWith('full://one');
    expect(Image.prefetch).toHaveBeenCalledWith('full://two');
    expect(Image.prefetch).toHaveBeenCalledWith('full://three');
  });
});
