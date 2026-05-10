import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { useLayoutEffect, useRef, useState } from 'react';
import { Image, View } from 'react-native';
import type { ImageProps, ImageSourcePropType, ImageStyle, StyleProp, ViewStyle } from 'react-native';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

interface TutorialMediaProps {
  iconColor: string;
  iconName: IoniconName;
  imageResizeMode: NonNullable<ImageProps['resizeMode']>;
  imageSource?: ImageSourcePropType;
  isActive: boolean;
  playbackKey: string;
  styles: {
    frame: StyleProp<ViewStyle>;
    iconFrame: StyleProp<ViewStyle>;
    image: StyleProp<ImageStyle>;
  };
}

export function TutorialMedia({
  iconColor,
  iconName,
  imageResizeMode,
  imageSource,
  isActive,
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

  if (!imageSource) {
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
      {isActive ? (
        <Image
          key={`${playbackKey}:${activationCount}`}
          resizeMode={imageResizeMode}
          source={imageSource}
          style={styles.image}
        />
      ) : null}
    </View>
  );
}
