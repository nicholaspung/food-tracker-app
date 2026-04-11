import type { ReactNode } from 'react';
import type {
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { useWindowDimensions } from 'react-native';

import { Screen } from '../../ui';

export interface TabRootScreenScaffoldProps {
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  scrollUnderlayColor: string;
  scrollUnderlayTopInset?: number;
  keyboardAware?: boolean;
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onRefresh?: () => void | Promise<void>;
  refreshing?: boolean;
  scrollEventThrottle?: number;
  testID?: string;
}

/**
 * Shared scaffold for top-level tab screens that use a custom in-content header.
 * Keeps scroll and overscroll behavior consistent with the profile tab layout.
 */
export function TabRootScreenScaffold({
  children,
  contentStyle,
  scrollUnderlayColor,
  scrollUnderlayTopInset,
  keyboardAware = true,
  onScroll,
  onRefresh,
  refreshing = false,
  scrollEventThrottle,
  testID,
}: TabRootScreenScaffoldProps) {
  const { height } = useWindowDimensions();
  const resolvedScrollUnderlayTopInset = scrollUnderlayTopInset ?? Math.max(220, Math.round(height / 2));

  return (
    <Screen
      background="surface"
      contentStyle={contentStyle}
      edges={['top']}
      keyboardAware={keyboardAware}
      onScroll={onScroll}
      onRefresh={onRefresh}
      padded={false}
      refreshing={refreshing}
      scroll
      scrollEventThrottle={scrollEventThrottle}
      scrollUnderlayColor={scrollUnderlayColor}
      scrollUnderlayTopInset={resolvedScrollUnderlayTopInset}
      testID={testID}
    >
      {children}
    </Screen>
  );
}
