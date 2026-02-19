import type { ReactNode, RefObject } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { useTheme } from '../../theme';
import { Button, Screen } from '../../ui';
import { ScreenHeader } from './ScreenHeader';

interface FeatureFormAction {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary';
}

export interface FeatureFormScreenScaffoldProps {
  title: string;
  subtitle?: string;
  onBackPress: () => void;
  rightAccessory?: ReactNode;
  headerBottomContent?: ReactNode;
  headerBottomCompact?: boolean;
  backAccessibilityLabel?: string;
  keyboardAware?: boolean;
  scrollViewRef?: RefObject<ScrollView | null>;
  bodyStyle?: StyleProp<ViewStyle>;
  children: ReactNode;
  primaryAction: FeatureFormAction;
  secondaryAction?: FeatureFormAction;
  testID?: string;
}

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
  backAccessibilityLabel,
  keyboardAware = true,
  scrollViewRef,
  bodyStyle,
  children,
  primaryAction,
  secondaryAction,
  testID,
}: FeatureFormScreenScaffoldProps) {
  const theme = useTheme();

  const styles = StyleSheet.create({
    screenContent: {
      backgroundColor: theme.colors.background.muted,
      gap: 0,
      paddingHorizontal: 0,
      paddingVertical: 0,
    },
    bodyContainer: {
      flex: 1,
    },
    headerBottom: {
      backgroundColor: theme.colors.background.muted,
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
      paddingBottom: theme.spacing.lg,
      paddingHorizontal: theme.spacing.md,
      paddingTop: theme.spacing.sm,
    },
    footer: {
      backgroundColor: theme.colors.background.surface,
      borderTopColor: theme.colors.border.subtle,
      borderTopWidth: 1,
      flexDirection: 'row',
      gap: theme.spacing.sm,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
    },
    footerAction: {
      flex: 1,
    },
  });

  return (
    <Screen
      background="surface"
      contentStyle={styles.screenContent}
      edges={['top']}
      keyboardAware={keyboardAware}
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
        <ScrollView
          contentContainerStyle={[styles.bodyContent, bodyStyle]}
          keyboardShouldPersistTaps="handled"
          ref={scrollViewRef}
          style={styles.bodyScroll}
        >
          {children}
        </ScrollView>

        <View style={styles.footer}>
          {secondaryAction ? (
            <Button
              disabled={secondaryAction.disabled}
              label={secondaryAction.label}
              loading={secondaryAction.loading}
              onPress={secondaryAction.onPress}
              style={styles.footerAction}
              variant={secondaryAction.variant ?? 'secondary'}
            />
          ) : null}
          <Button
            disabled={primaryAction.disabled}
            label={primaryAction.label}
            loading={primaryAction.loading}
            onPress={primaryAction.onPress}
            style={styles.footerAction}
            variant={primaryAction.variant ?? 'primary'}
          />
        </View>
      </View>
    </Screen>
  );
}
