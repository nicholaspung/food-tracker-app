import { useState, type ReactNode } from 'react';
import { Platform, RefreshControl, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useWindowDimensions } from 'react-native';

import { createThemedStyles, useTheme } from '../../theme';
import { Screen } from '../../ui';
import { ScreenHeader } from './ScreenHeader';
import { StickyActionFooter, type StickyActionFooterAction } from './StickyActionFooter';

type ContentBackgroundTone = 'app' | 'surface' | 'muted';
type OverscrollBackgroundStrategy = 'measured-header' | 'legacy-midpoint';
type HeaderScrollMode = 'attached' | 'fixed';

/**
 * Shared screen scaffold for any page that uses the custom header with a back button.
 * Keep stack headers hidden and route these screens through this scaffold for consistent
 * safe-area handling, header chrome, and body spacing.
 */
export interface BackHeaderScreenScaffoldProps {
  title: string;
  subtitle?: ReactNode;
  onBackPress: () => void;
  rightAccessory?: ReactNode;
  headerBottomContent?: ReactNode;
  headerBottomCompact?: boolean;
  backAccessibilityLabel?: string;
  headerVariant?: 'large' | 'compact';
  scroll?: boolean;
  keyboardAware?: boolean;
  onRefresh?: () => void | Promise<void>;
  refreshing?: boolean;
  contentBackgroundTone?: ContentBackgroundTone;
  overscrollBackgroundStrategy?: OverscrollBackgroundStrategy;
  headerScrollMode?: HeaderScrollMode;
  adjustKeyboardSpaceForFixedHeader?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  bodyStyle?: StyleProp<ViewStyle>;
  stickyHeaderIndices?: number[];
  primaryAction?: StickyActionFooterAction;
  secondaryAction?: StickyActionFooterAction;
  children: ReactNode;
  testID?: string;
}

const useStyles = createThemedStyles((
  theme,
  screenContentBackgroundColor: string,
  bodyBackgroundColor: string,
  growBody: boolean,
  headerBottomCompact: boolean,
) => ({
  screenContent: {
    backgroundColor: screenContentBackgroundColor,
    gap: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  scrollBody: {
    backgroundColor: bodyBackgroundColor,
    flex: 1,
  },
  body: {
    backgroundColor: bodyBackgroundColor,
    ...(growBody ? { flexGrow: 1 } : {}),
    gap: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
  },
  headerBottom: {
    backgroundColor: theme.colors.background.app,
    borderBottomColor: theme.colors.border.subtle,
    borderBottomWidth: 1,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: headerBottomCompact ? theme.spacing.xs : theme.spacing.sm,
  },
}));

export function BackHeaderScreenScaffold({
  title,
  subtitle,
  onBackPress,
  rightAccessory,
  headerBottomContent,
  headerBottomCompact = false,
  backAccessibilityLabel,
  headerVariant = 'large',
  scroll = true,
  keyboardAware = true,
  onRefresh,
  refreshing = false,
  contentBackgroundTone = 'app',
  overscrollBackgroundStrategy = 'measured-header',
  headerScrollMode = 'attached',
  adjustKeyboardSpaceForFixedHeader = false,
  contentStyle,
  bodyStyle,
  stickyHeaderIndices,
  primaryAction,
  secondaryAction,
  children,
  testID,
}: BackHeaderScreenScaffoldProps) {
  const theme = useTheme();
  const { height } = useWindowDimensions();
  const [headerHeight, setHeaderHeight] = useState(0);

  const backgroundColor =
    contentBackgroundTone === 'app'
      ? theme.colors.background.app
      : contentBackgroundTone === 'surface'
        ? theme.colors.background.surface
        : theme.colors.background.muted;
  const usesFixedHeaderScroll = scroll && headerScrollMode === 'fixed';
  const legacyMidpointInset = Math.max(220, Math.round(height / 2));
  const scrollUnderlayTopInset =
    overscrollBackgroundStrategy === 'legacy-midpoint'
      ? legacyMidpointInset
      : headerHeight;
  const styles = useStyles(
    usesFixedHeaderScroll ? theme.colors.background.surface : backgroundColor,
    backgroundColor,
    usesFixedHeaderScroll,
    headerBottomCompact,
  );
  const footerContent = primaryAction ? (
    <StickyActionFooter primaryAction={primaryAction} secondaryAction={secondaryAction} />
  ) : null;

  return (
    <Screen
      background={scroll ? 'surface' : contentBackgroundTone === 'app' ? 'app' : 'surface'}
      contentStyle={[styles.screenContent, contentStyle]}
      edges={['top']}
      keyboardAware={usesFixedHeaderScroll ? false : keyboardAware}
      onRefresh={usesFixedHeaderScroll ? undefined : onRefresh}
      padded={false}
      refreshing={usesFixedHeaderScroll ? false : refreshing}
      scroll={usesFixedHeaderScroll ? false : scroll}
      scrollUnderlayColor={usesFixedHeaderScroll ? undefined : scroll ? backgroundColor : undefined}
      scrollUnderlayTopInset={usesFixedHeaderScroll ? undefined : scroll ? scrollUnderlayTopInset : undefined}
      testID={testID}
    >
      <View
        onLayout={(event) => {
          const nextHeaderHeight = event.nativeEvent.layout.height;

          setHeaderHeight((currentHeaderHeight) =>
            currentHeaderHeight === nextHeaderHeight ? currentHeaderHeight : nextHeaderHeight,
          );
        }}
      >
        <ScreenHeader
          backAccessibilityLabel={backAccessibilityLabel}
          onBackPress={onBackPress}
          rightAccessory={rightAccessory}
          subtitle={subtitle}
          title={title}
          variant={headerVariant}
        />
        {headerBottomContent ? <View style={styles.headerBottom}>{headerBottomContent}</View> : null}
      </View>
      {usesFixedHeaderScroll ? (
        <>
          <KeyboardAwareScrollView
            automaticallyAdjustKeyboardInsets={false}
            bottomOffset={theme.spacing.sm}
            contentContainerStyle={[styles.body, bodyStyle]}
            enabled={keyboardAware}
            extraKeyboardSpace={adjustKeyboardSpaceForFixedHeader ? -headerHeight : 0}
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              onRefresh ? (
                <RefreshControl
                  colors={[theme.colors.text.brand]}
                  onRefresh={onRefresh}
                  progressBackgroundColor={theme.colors.background.surface}
                  refreshing={refreshing}
                  tintColor={theme.colors.text.brand}
                />
              ) : undefined
            }
            stickyHeaderIndices={stickyHeaderIndices}
            style={styles.scrollBody}
          >
            {children}
          </KeyboardAwareScrollView>
          {footerContent}
        </>
      ) : (
        <>
          <View style={[styles.body, bodyStyle]}>{children}</View>
          {footerContent}
        </>
      )}
    </Screen>
  );
}
