import type { PropsWithChildren } from 'react';
import { Platform, RefreshControl, StyleSheet, View } from 'react-native';
import {
  KeyboardAvoidingView,
  KeyboardAwareScrollView,
} from 'react-native-keyboard-controller';
import type { Edge } from 'react-native-safe-area-context';
import { SafeAreaView } from 'react-native-safe-area-context';
import type {
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleProp,
  ViewStyle,
} from 'react-native';

import { useTheme } from '../theme';

interface ScreenProps {
  edges?: Edge[];
  background?: 'app' | 'surface';
  padded?: boolean;
  scroll?: boolean;
  keyboardAware?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  scrollStyle?: StyleProp<ViewStyle>;
  scrollUnderlayColor?: string;
  scrollUnderlayTopInset?: number;
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onRefresh?: () => void | Promise<void>;
  refreshing?: boolean;
  scrollEventThrottle?: number;
  testID?: string;
}

const DEFAULT_EDGES: Edge[] = ['top', 'bottom'];

export function Screen({
  children,
  edges = DEFAULT_EDGES,
  background = 'app',
  padded = true,
  scroll = false,
  keyboardAware = true,
  style,
  contentStyle,
  scrollStyle,
  scrollUnderlayColor,
  scrollUnderlayTopInset = 0,
  onScroll,
  onRefresh,
  refreshing = false,
  scrollEventThrottle = 16,
  testID,
}: PropsWithChildren<ScreenProps>) {
  const theme = useTheme();

  const styles = StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: background === 'surface' ? theme.colors.background.surface : theme.colors.background.app,
    },
    keyboardContainer: {
      flex: 1,
    },
    content: {
      paddingHorizontal: padded ? theme.spacing.lg : theme.spacing.none,
      paddingVertical: padded ? theme.spacing.md : theme.spacing.none,
      gap: theme.spacing.md,
    },
    nonScrollContent: {
      flex: 1,
    },
    scrollContent: {
      flexGrow: 1,
    },
  });

  const body = scroll ? (
    <KeyboardAwareScrollView
      automaticallyAdjustKeyboardInsets={false}
      bottomOffset={theme.spacing.sm}
      contentContainerStyle={[styles.scrollContent, styles.content, contentStyle]}
      enabled={keyboardAware}
      keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      keyboardShouldPersistTaps="handled"
      onScroll={onScroll}
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
      scrollEventThrottle={scrollEventThrottle}
      style={[styles.keyboardContainer, scrollStyle]}
    >
      {children}
    </KeyboardAwareScrollView>
  ) : (
    <View style={[styles.nonScrollContent, styles.content, contentStyle]}>{children}</View>
  );

  return (
    <SafeAreaView edges={edges} style={[styles.safeArea, style]} testID={testID}>
      {scroll && scrollUnderlayColor ? (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            {
              top: scrollUnderlayTopInset,
              backgroundColor: scrollUnderlayColor,
            },
          ]}
        />
      ) : null}
      {!scroll && keyboardAware ? (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardContainer}
        >
          {body}
        </KeyboardAvoidingView>
      ) : (
        body
      )}
    </SafeAreaView>
  );
}
