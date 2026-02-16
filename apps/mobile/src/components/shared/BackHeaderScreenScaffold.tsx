import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { useTheme } from '../../theme';
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
  keyboardAware?: boolean;
  contentBackgroundTone?: ContentBackgroundTone;
  contentStyle?: StyleProp<ViewStyle>;
  bodyStyle?: StyleProp<ViewStyle>;
  children: ReactNode;
  testID?: string;
}

export function BackHeaderScreenScaffold({
  title,
  subtitle,
  onBackPress,
  rightAccessory,
  backAccessibilityLabel,
  headerVariant = 'large',
  keyboardAware = false,
  contentBackgroundTone = 'muted',
  contentStyle,
  bodyStyle,
  children,
  testID,
}: BackHeaderScreenScaffoldProps) {
  const theme = useTheme();

  const backgroundColor =
    contentBackgroundTone === 'app'
      ? theme.colors.background.app
      : contentBackgroundTone === 'surface'
        ? theme.colors.background.surface
        : theme.colors.background.muted;

  const styles = StyleSheet.create({
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
  });

  return (
    <Screen
      background="surface"
      contentStyle={[styles.screenContent, contentStyle]}
      edges={['top']}
      keyboardAware={keyboardAware}
      padded={false}
      scrollUnderlayColor={backgroundColor}
      scrollUnderlayTopInset={220}
      scroll
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
