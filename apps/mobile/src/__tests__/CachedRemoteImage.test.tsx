import React from 'react';
import { act, create } from 'react-test-renderer';

import { CachedRemoteImage } from '../components/shared/CachedRemoteImage';
import {
  __resetPhotoImageCacheForTests,
  getPhotoImageCacheStatus,
  hasPhotoImageLoaded,
} from '../lib/photoImageCache';

jest.mock('react-native', () => {
  const React = jest.requireActual<typeof import('react')>('react');

  return {
    Image: Object.assign(
      (props: Record<string, unknown>) => React.createElement('Image', props),
      {
        prefetch: jest.fn().mockResolvedValue(true),
      },
    ),
  };
});

describe('CachedRemoteImage', () => {
  beforeEach(() => {
    const { Image } = jest.requireMock('react-native') as {
      Image: { prefetch: jest.Mock };
    };
    __resetPhotoImageCacheForTests();
    Image.prefetch.mockClear();
  });

  it('uses force-cache image sources and disables Android fade', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <CachedRemoteImage
          resizeMode="cover"
          style={{ width: 80 }}
          testID="cached-image"
          uri="photo://cached-source"
        />,
      );
    });

    const image = renderer.root.find(
      (node: any) => node.type === 'Image' && node.props.testID === 'cached-image',
    );

    expect(image.props.fadeDuration).toBe(0);
    expect(image.props.resizeMode).toBe('cover');
    expect(image.props.source).toEqual({
      cache: 'force-cache',
      uri: 'photo://cached-source',
    });
  });

  it('prefetches the uri and only marks it loaded on load', async () => {
    const { Image } = jest.requireMock('react-native') as {
      Image: { prefetch: jest.Mock };
    };
    const onLoad = jest.fn();
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <CachedRemoteImage
          onLoad={onLoad}
          testID="cached-image"
          uri="photo://loaded-from-component"
        />,
      );
    });

    expect(Image.prefetch).toHaveBeenCalledWith('photo://loaded-from-component');
    expect(hasPhotoImageLoaded('photo://loaded-from-component')).toBe(false);

    await act(async () => {
      await Promise.resolve();
    });

    expect(getPhotoImageCacheStatus('photo://loaded-from-component')).toBe('prefetched');
    expect(hasPhotoImageLoaded('photo://loaded-from-component')).toBe(false);

    await act(async () => {
      renderer.root
        .find((node: any) => node.type === 'Image' && node.props.testID === 'cached-image')
        .props.onLoad({ nativeEvent: {} });
    });

    expect(getPhotoImageCacheStatus('photo://loaded-from-component')).toBe('loaded');
    expect(hasPhotoImageLoaded('photo://loaded-from-component')).toBe(true);
    expect(onLoad).toHaveBeenCalledWith({ nativeEvent: {} });
  });
});
