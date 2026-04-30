import { useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { Platform, View } from 'react-native';
import type { ScrollViewProps, StyleProp, ViewStyle } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import type { KeyboardAwareScrollViewRef } from 'react-native-keyboard-controller';

import { createThemedStyles, useTheme } from '../../theme';
import { Screen } from '../../ui';
import { ScreenHeader } from './ScreenHeader';
import { StickyActionFooter, type StickyActionFooterAction } from './StickyActionFooter';

export interface FeatureFormScreenScaffoldProps {
  title: string;
  subtitle?: string;
  onBackPress: () => void;
  rightAccessory?: ReactNode;
  headerBottomContent?: ReactNode;
  headerBottomCompact?: boolean;
  splitBackground?: boolean;
  backAccessibilityLabel?: string;
  keyboardAware?: boolean;
  scrollViewRef?: RefObject<KeyboardAwareScrollViewRef | null>;
  scrollViewProps?: Omit<ScrollViewProps, 'ref' | 'contentContainerStyle' | 'style'>;
  bodyStyle?: StyleProp<ViewStyle>;
  children: ReactNode;
  primaryAction: StickyActionFooterAction;
  secondaryAction?: StickyActionFooterAction;
  testID?: string;
}

const useStyles = createThemedStyles((theme, headerBottomCompact: boolean) => ({
  screenContent: {
    gap: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  bodyContainer: {
    flex: 1,
    backgroundColor: theme.colors.background.app,
  },
  headerBottom: {
    backgroundColor: theme.colors.background.app,
    borderBottomColor: theme.colors.border.subtle,
    borderBottomWidth: 1,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: headerBottomCompact ? theme.spacing.xs : theme.spacing.sm,
  },
  bodyScroll: {
    flex: 1,
  },
  bodyContent: {
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
  },
}));

/**
 * Shared scaffold for compact-header form screens with a sticky action bar.
 * Useful for create/edit flows where Save/Cancel should remain visible above tabs.
 */
export function FeatureFormScreenScaffold({
  title,
  subtitle,
  onBackPress,
  rightAccessory,
  headerBottomContent,
  headerBottomCompact = false,
  splitBackground = true,
  backAccessibilityLabel,
  keyboardAware = true,
  scrollViewRef,
  scrollViewProps,
  bodyStyle,
  children,
  primaryAction,
  secondaryAction,
  testID,
}: FeatureFormScreenScaffoldProps) {
  const theme = useTheme();
  const internalScrollViewRef = useRef<KeyboardAwareScrollViewRef | null>(null);
  const resolvedScrollViewRef = scrollViewRef ?? internalScrollViewRef;
  const [footerHeight, setFooterHeight] = useState(theme.sizes.buttonHeight + theme.spacing.xl);
  const styles = useStyles(headerBottomCompact);

  return (
    <Screen
      background={splitBackground ? 'surface' : 'app'}
      contentStyle={styles.screenContent}
      edges={['top']}
      keyboardAware={false}
      padded={false}
      scroll={false}
      testID={testID}
    >
      <ScreenHeader
        backAccessibilityLabel={backAccessibilityLabel}
        onBackPress={onBackPress}
        rightAccessory={rightAccessory}
        subtitle={subtitle}
        title={title}
        variant="compact"
      />
      {headerBottomContent ? <View style={styles.headerBottom}>{headerBottomContent}</View> : null}
      <View style={styles.bodyContainer}>
        <KeyboardAwareScrollView
          automaticallyAdjustKeyboardInsets={false}
          bottomOffset={keyboardAware ? footerHeight + theme.spacing.sm : 0}
          contentContainerStyle={[
            styles.bodyContent,
            {
              paddingBottom: theme.spacing.sm,
            },
            bodyStyle,
          ]}
          enabled={keyboardAware}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
          {...scrollViewProps}
          ref={resolvedScrollViewRef}
          style={styles.bodyScroll}
        >
          {children}
        </KeyboardAwareScrollView>

        <StickyActionFooter
          onLayout={(event) => {
            const nextFooterHeight = event.nativeEvent.layout.height;

            setFooterHeight((currentFooterHeight) =>
              currentFooterHeight === nextFooterHeight ? currentFooterHeight : nextFooterHeight,
            );
          }}
          primaryAction={primaryAction}
          secondaryAction={secondaryAction}
        />
      </View>
    </Screen>
  );
}
