import { Platform } from 'react-native';
import type { ViewStyle } from 'react-native';

interface ShadowStyleOptions {
  color: string;
  offset: {
    width: number;
    height: number;
  };
  opacity: number;
  radius: number;
  elevation?: number;
}

export function createPlatformShadow({
  color,
  elevation,
  offset,
  opacity,
  radius,
}: ShadowStyleOptions): ViewStyle {
  if (Platform?.OS === 'web') {
    return {
      boxShadow: `${offset.width}px ${offset.height}px ${radius}px color-mix(in srgb, ${color} ${opacity * 100}%, transparent)`,
    };
  }

  return {
    elevation,
    shadowColor: color,
    shadowOffset: offset,
    shadowOpacity: opacity,
    shadowRadius: radius,
  };
}
