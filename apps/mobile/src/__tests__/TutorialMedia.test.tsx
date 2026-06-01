import React from 'react';
import { Image, StyleSheet } from 'react-native';
import type { ImageStyle, StyleProp, ViewStyle } from 'react-native';
import { act, create } from 'react-test-renderer';

import { TutorialMedia } from '../components/shared/TutorialMedia';

const mockReact = React;
const mockUseVideoPlayer = jest.fn((source: string, setup?: (player: any) => void) => {
  const player = {
    loop: false,
    muted: false,
    play: jest.fn(),
    source,
  };
  setup?.(player);
  return player;
});

jest.mock('expo-video', () => ({
  VideoView: (props: Record<string, unknown>) => mockReact.createElement('VideoView', props),
  useVideoPlayer: (...args: unknown[]) => (mockUseVideoPlayer as (...input: unknown[]) => unknown)(...args),
}));

const styles: {
  frame: StyleProp<ViewStyle>;
  iconFrame: StyleProp<ViewStyle>;
  image: StyleProp<ImageStyle>;
  video: StyleProp<ViewStyle>;
} = {
  frame: { height: 200, width: 120 },
  iconFrame: { height: 80, width: 80 },
  image: { height: '100%', width: '100%' },
  video: { ...StyleSheet.absoluteFill },
};

describe('TutorialMedia', () => {
  beforeEach(() => {
    mockUseVideoPlayer.mockClear();
  });

  it('renders the icon fallback when no media is configured', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <TutorialMedia
          iconColor="brand"
          iconName="play-circle-outline"
          imageResizeMode="contain"
          isActive
          playbackKey="fallback"
          styles={styles}
        />,
      );
    });

    expect(renderer.root.findAllByType(Image)).toHaveLength(0);
    expect(renderer.root.findAllByType('VideoView')).toHaveLength(0);
    expect(renderer.root.findByType('Ionicons').props.name).toBe('play-circle-outline');
  });

  it('renders poster media without mounting video while inactive', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <TutorialMedia
          iconColor="brand"
          iconName="play-circle-outline"
          imageResizeMode="cover"
          isActive={false}
          media={{
            posterSource: { uri: 'asset://poster' },
            videoUri: 'https://yummyrecs.com/tutorials/poster.mp4',
          }}
          playbackKey="poster"
          styles={styles}
        />,
      );
    });

    const image = renderer.root.findByType(Image);
    expect(image.props.source).toEqual({ uri: 'asset://poster' });
    expect(image.props.resizeMode).toBe('cover');
    expect(renderer.root.findAllByType('VideoView')).toHaveLength(0);
    expect(mockUseVideoPlayer).not.toHaveBeenCalled();
  });

  it('renders muted looping remote video with poster while active', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <TutorialMedia
          iconColor="brand"
          iconName="play-circle-outline"
          imageResizeMode="cover"
          isActive
          media={{
            posterSource: { uri: 'asset://poster' },
            videoUri: 'https://yummyrecs.com/tutorials/poster.mp4',
          }}
          playbackKey="video"
          styles={styles}
        />,
      );
    });

    const video = renderer.root.findByType('VideoView');
    const player = video.props.player;

    expect(video.props.contentFit).toBe('cover');
    expect(video.props.nativeControls).toBe(false);
    expect(video.props.playsInline).toBe(true);
    expect(player.loop).toBe(true);
    expect(player.muted).toBe(true);
    expect(player.play).toHaveBeenCalledTimes(1);
    expect(renderer.root.findByType(Image).props.source).toEqual({ uri: 'asset://poster' });
  });

  it('hides the poster after the first video frame renders', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(
        <TutorialMedia
          iconColor="brand"
          iconName="play-circle-outline"
          imageResizeMode="contain"
          isActive
          media={{
            posterSource: { uri: 'asset://poster' },
            videoUri: 'https://yummyrecs.com/tutorials/poster.mp4',
          }}
          playbackKey="video"
          styles={styles}
        />,
      );
    });

    expect(renderer.root.findAllByType(Image)).toHaveLength(1);

    await act(async () => {
      renderer.root.findByType('VideoView').props.onFirstFrameRender();
    });

    expect(renderer.root.findAllByType(Image)).toHaveLength(0);
  });
});
