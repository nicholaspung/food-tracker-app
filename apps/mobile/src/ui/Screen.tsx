import type { PropsWithChildren } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TouchableWithoutFeedback, View } from 'react-native';
import { useRef } from 'react';
import type { Edge } from 'react-native-safe-area-context';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { StyleProp, ViewStyle } from 'react-native';

import { useTheme } from '../theme';
import { KeyboardAwareScrollProvider } from './KeyboardAwareScrollContext';

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
  testID,
}: PropsWithChildren<ScreenProps>) {
  const theme = useTheme();
  const scrollViewRef = useRef<ScrollView | null>(null);

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
    <KeyboardAwareScrollProvider extraKeyboardOffset={theme.spacing.xl} scrollViewRef={scrollViewRef}>
      <ScrollView
        automaticallyAdjustKeyboardInsets={keyboardAware}
        contentContainerStyle={[styles.scrollContent, styles.content, contentStyle]}
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        keyboardShouldPersistTaps="handled"
        ref={scrollViewRef}
        style={[styles.keyboardContainer, scrollStyle]}
      >
        {children}
      </ScrollView>
    </KeyboardAwareScrollProvider>
  ) : (
    <TouchableWithoutFeedback
      accessible={false}
      onPress={() => {
        Keyboard.dismiss();
      }}
    >
      <View style={[styles.nonScrollContent, styles.content, contentStyle]}>{children}</View>
    </TouchableWithoutFeedback>
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
      {keyboardAware ? (
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
