import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { useWindowDimensions } from 'react-native';

import { createThemedStyles, useTheme } from '../../theme';
import { Screen } from '../../ui';
import { ScreenHeader } from './ScreenHeader';

type ContentBackgroundTone = 'app' | 'surface' | 'muted';

/**
 * Shared screen scaffold for any page that uses the custom header with a back button.
 * Keep stack headers hidden and route these screens through this scaffold for consistent
 * safe-area handling, header chrome, and body spacing.
 */
export interface BackHeaderScreenScaffoldProps {
  title: string;
  subtitle?: string;
  onBackPress: () => void;
  rightAccessory?: ReactNode;
  backAccessibilityLabel?: string;
  headerVariant?: 'large' | 'compact';
  scroll?: boolean;
  keyboardAware?: boolean;
  contentBackgroundTone?: ContentBackgroundTone;
  contentStyle?: StyleProp<ViewStyle>;
  bodyStyle?: StyleProp<ViewStyle>;
  children: ReactNode;
  testID?: string;
}

const useStyles = createThemedStyles((theme, backgroundColor: string) => ({
  screenContent: {
    backgroundColor,
    gap: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  body: {
    gap: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
  },
}));

export function BackHeaderScreenScaffold({
  title,
  subtitle,
  onBackPress,
  rightAccessory,
  backAccessibilityLabel,
  headerVariant = 'large',
  scroll = true,
  keyboardAware = true,
  contentBackgroundTone = 'muted',
  contentStyle,
  bodyStyle,
  children,
  testID,
}: BackHeaderScreenScaffoldProps) {
  const theme = useTheme();
  const { height } = useWindowDimensions();

  const backgroundColor =
    contentBackgroundTone === 'app'
      ? theme.colors.background.app
      : contentBackgroundTone === 'surface'
        ? theme.colors.background.surface
        : theme.colors.background.muted;
  const scrollUnderlayTopInset = Math.max(220, Math.round(height / 2));
  const styles = useStyles(backgroundColor);

  return (
    <Screen
      background="surface"
      contentStyle={[styles.screenContent, contentStyle]}
      edges={['top']}
      keyboardAware={keyboardAware}
      padded={false}
      scroll={scroll}
      scrollUnderlayColor={scroll ? backgroundColor : undefined}
      scrollUnderlayTopInset={scroll ? scrollUnderlayTopInset : undefined}
      testID={testID}
    >
      <ScreenHeader
        backAccessibilityLabel={backAccessibilityLabel}
        onBackPress={onBackPress}
        rightAccessory={rightAccessory}
        subtitle={subtitle}
        title={title}
        variant={headerVariant}
      />
      <View style={[styles.body, bodyStyle]}>{children}</View>
    </Screen>
  );
}
