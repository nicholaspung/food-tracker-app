import React from 'react';
import { act, create } from 'react-test-renderer';

import { PhotoViewerModal } from '../components/shared/PhotoViewerModal';

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
    Image: (props: Record<string, unknown>) => React.createElement('Image', props),
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

describe('PhotoViewerModal', () => {
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

    const previewImage = renderer.root.findByProps({ testID: 'photo-viewer-preview-image' });
    const fullImage = renderer.root.findByProps({ testID: 'photo-viewer-full-image' });

    expect(previewImage.props.source).toEqual({ uri: 'thumb://photo' });
    expect(extractOpacity(fullImage)).toBe(0);

    await act(async () => {
      fullImage.props.onLoad();
    });

    expect(extractOpacity(fullImage)).toBe(1);
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

  it('keeps the preview visible when the full image fails to load', async () => {
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

    const fullImage = renderer.root.findByProps({ testID: 'photo-viewer-full-image' });

    await act(async () => {
      fullImage.props.onError();
    });

    expect(renderer.root.findAllByProps({ testID: 'photo-viewer-preview-image' }).length).toBeGreaterThan(0);
    expect(extractOpacity(fullImage)).toBe(0);
  });
});
