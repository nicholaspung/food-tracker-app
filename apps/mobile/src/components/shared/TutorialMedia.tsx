import { Ionicons } from '../../ui/AppIcon';
import { VideoView, useVideoPlayer, type VideoContentFit } from 'expo-video';
import type { ComponentProps } from 'react';
import { useLayoutEffect, useRef, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import type { ImageProps, ImageSourcePropType, ImageStyle, StyleProp, ViewStyle } from 'react-native';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

export interface TutorialMediaSource {
  posterSource?: ImageSourcePropType;
  videoUri?: string;
}

interface TutorialMediaProps {
  iconColor: string;
  iconName: IoniconName;
  imageResizeMode: NonNullable<ImageProps['resizeMode']>;
  isActive: boolean;
  media?: TutorialMediaSource;
  playbackKey: string;
  styles: {
    frame: StyleProp<ViewStyle>;
    iconFrame: StyleProp<ViewStyle>;
    image: StyleProp<ImageStyle>;
    video?: StyleProp<ViewStyle>;
  };
}

interface TutorialVideoProps {
  contentFit: VideoContentFit;
  playbackKey: string;
  posterResizeMode: NonNullable<ImageProps['resizeMode']>;
  posterSource?: ImageSourcePropType;
  posterStyle: StyleProp<ImageStyle>;
  videoStyle: StyleProp<ViewStyle>;
  videoUri: string;
}

function TutorialVideo({
  contentFit,
  playbackKey,
  posterResizeMode,
  posterSource,
  posterStyle,
  videoStyle,
  videoUri,
}: TutorialVideoProps) {
  const [hasRenderedFirstFrame, setHasRenderedFirstFrame] = useState(false);
  const player = useVideoPlayer(videoUri, (videoPlayer) => {
    videoPlayer.loop = true;
    videoPlayer.muted = true;
    videoPlayer.play();
  });

  return (
    <>
      <VideoView
        key={playbackKey}
        allowsVideoFrameAnalysis={false}
        contentFit={contentFit}
        nativeControls={false}
        onFirstFrameRender={() => {
          setHasRenderedFirstFrame(true);
        }}
        player={player}
        playsInline
        style={videoStyle}
        useExoShutter={false}
      />
      {!hasRenderedFirstFrame && posterSource ? (
        <Image resizeMode={posterResizeMode} source={posterSource} style={posterStyle} />
      ) : null}
    </>
  );
}

export function TutorialMedia({
  iconColor,
  iconName,
  imageResizeMode,
  isActive,
  media,
  playbackKey,
  styles,
}: TutorialMediaProps) {
  const previousIsActiveRef = useRef(isActive);
  const previousPlaybackKeyRef = useRef(playbackKey);
  const [activationCount, setActivationCount] = useState(() => (isActive ? 1 : 0));

  useLayoutEffect(() => {
    if (previousPlaybackKeyRef.current !== playbackKey) {
      previousPlaybackKeyRef.current = playbackKey;
      previousIsActiveRef.current = isActive;
      setActivationCount(isActive ? 1 : 0);
      return;
    }

    if (!previousIsActiveRef.current && isActive) {
      setActivationCount((currentCount) => currentCount + 1);
    }

    previousIsActiveRef.current = isActive;
  }, [isActive, playbackKey]);

  const posterSource = media?.posterSource;
  const videoUri = media?.videoUri;
  const hasMedia = Boolean(posterSource || videoUri);
  const videoContentFit: VideoContentFit = imageResizeMode === 'cover' ? 'cover' : 'contain';
  const videoStyle = styles.video ?? [styles.image as StyleProp<ViewStyle>, StyleSheet.absoluteFill];

  if (!hasMedia) {
    return (
      <View style={styles.frame}>
        <View style={styles.iconFrame}>
          <Ionicons color={iconColor} name={iconName} size={44} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.frame}>
      {posterSource && (!isActive || !videoUri) ? (
        <Image
          key={`${playbackKey}:${activationCount}`}
          resizeMode={imageResizeMode}
          source={posterSource}
          style={styles.image}
        />
      ) : null}
      {isActive && videoUri ? (
        <TutorialVideo
          key={`${playbackKey}:${activationCount}`}
          contentFit={videoContentFit}
          playbackKey={`${playbackKey}:${activationCount}`}
          posterResizeMode={imageResizeMode}
          posterSource={posterSource}
          posterStyle={styles.image}
          videoStyle={videoStyle}
          videoUri={videoUri}
        />
      ) : null}
    </View>
  );
}
