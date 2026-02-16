import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { useTheme } from '../../theme';

export interface SkeletonProps {
  width?: number | `${number}%`;
  height?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

export function Skeleton({ width = '100%', height = 16, borderRadius, style }: SkeletonProps) {
  const theme = useTheme();
  const opacity = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: theme.sizes.skeletonPulseMs,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.35,
          duration: theme.sizes.skeletonPulseMs,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();
    return () => {
      animation.stop();
    };
  }, [opacity, theme.sizes.skeletonPulseMs]);

  const styles = StyleSheet.create({
    skeleton: {
      width,
      height,
      borderRadius: borderRadius ?? theme.radii.sm,
      backgroundColor: theme.colors.border.subtle,
    },
  });

  return <Animated.View style={[styles.skeleton, { opacity }, style]} />;
}
