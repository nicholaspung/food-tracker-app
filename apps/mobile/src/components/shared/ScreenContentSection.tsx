import type { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { getPlatformPointerEventsProps, getPlatformPointerEventsStyle } from '../../lib/platformPointerEvents';
import { createThemedStyles } from '../../theme';

interface OverscrollBackgroundSplit {
  topColor: string;
  bottomColor: string;
  topRatio: number;
}

export interface ScreenContentSectionProps {
  fill?: boolean;
  overscrollBackgroundSplit?: OverscrollBackgroundSplit;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const useStyles = createThemedStyles((theme, fill: boolean) => ({
  container: {
    backgroundColor: theme.colors.background.app,
    ...(fill ? { flex: 1 } : {}),
  },
  splitBackdrop: {
    ...StyleSheet.absoluteFill,
  },
  splitBackdropSegment: {
    width: '100%',
  },
}));

export function ScreenContentSection({
  children,
  fill = false,
  overscrollBackgroundSplit,
  style,
  testID,
}: PropsWithChildren<ScreenContentSectionProps>) {
  const styles = useStyles(fill);
  const clampedTopRatio = Math.max(0, Math.min(1, overscrollBackgroundSplit?.topRatio ?? 0));

  return (
    <View style={[styles.container, style]} testID={testID}>
      {overscrollBackgroundSplit ? (
        <View
          {...getPlatformPointerEventsProps('none')}
          style={[styles.splitBackdrop, getPlatformPointerEventsStyle('none')]}
          testID={testID ? `${testID}-overscroll-backdrop` : undefined}
        >
          <View
            style={[
              styles.splitBackdropSegment,
              {
                backgroundColor: overscrollBackgroundSplit.topColor,
                flex: clampedTopRatio,
              },
            ]}
            testID={testID ? `${testID}-overscroll-top` : undefined}
          />
          <View
            style={[
              styles.splitBackdropSegment,
              {
                backgroundColor: overscrollBackgroundSplit.bottomColor,
                flex: 1 - clampedTopRatio,
              },
            ]}
            testID={testID ? `${testID}-overscroll-bottom` : undefined}
          />
        </View>
      ) : null}
      {children}
    </View>
  );
}
