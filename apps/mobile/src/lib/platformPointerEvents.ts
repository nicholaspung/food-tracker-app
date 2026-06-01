import { Platform } from 'react-native';
import type { ViewProps, ViewStyle } from 'react-native';

type PointerEventsValue = NonNullable<ViewProps['pointerEvents']>;

function isWebPlatform(): boolean {
  return Platform?.OS === 'web';
}

export function getPlatformPointerEventsProps(
  pointerEvents: PointerEventsValue,
): Pick<ViewProps, 'pointerEvents'> | { style: ViewStyle } {
  if (isWebPlatform()) {
    return { style: { pointerEvents } as ViewStyle };
  }

  return { pointerEvents };
}

export function getPlatformPointerEventsStyle(pointerEvents: PointerEventsValue): ViewStyle | null {
  return isWebPlatform() ? ({ pointerEvents } as ViewStyle) : null;
}
