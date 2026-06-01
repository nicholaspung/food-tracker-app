import { useEffect, useRef } from 'react';
import { Animated, Easing, Platform } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { createThemedStyles, useTheme } from '../../theme';

const SHOULD_USE_NATIVE_ANIMATION_DRIVER = Platform.OS !== 'web';

export interface SkeletonProps {
  width?: number | `${number}%`;
  height?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

const useStyles = createThemedStyles(
  (theme, width: number | `${number}%`, height: number, borderRadius?: number) => ({
    skeleton: {
      width,
      height,
      borderRadius: borderRadius ?? theme.radii.sm,
      backgroundColor: theme.colors.border.subtle,
    },
  }),
);

export function Skeleton({ width = '100%', height = 16, borderRadius, style }: SkeletonProps) {
  const theme = useTheme();
  const opacity = useRef(new Animated.Value(0.35)).current;
  const styles = useStyles(width, height, borderRadius);

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: theme.sizes.skeletonPulseMs,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: SHOULD_USE_NATIVE_ANIMATION_DRIVER,
        }),
        Animated.timing(opacity, {
          toValue: 0.35,
          duration: theme.sizes.skeletonPulseMs,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: SHOULD_USE_NATIVE_ANIMATION_DRIVER,
        }),
      ]),
    );

    animation.start();
    return () => {
      animation.stop();
    };
  }, [opacity, theme.sizes.skeletonPulseMs]);

  return <Animated.View style={[styles.skeleton, { opacity }, style]} />;
}
