import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { useWindowDimensions } from 'react-native';

import { Screen } from '../../ui';

export interface TabRootScreenScaffoldProps {
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  scrollUnderlayColor: string;
  scrollUnderlayTopInset?: number;
  keyboardAware?: boolean;
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
      padded={false}
      scroll
      scrollUnderlayColor={scrollUnderlayColor}
      scrollUnderlayTopInset={resolvedScrollUnderlayTopInset}
      testID={testID}
    >
      {children}
    </Screen>
  );
}
