import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Keyboard, Platform, Pressable, StyleSheet, View } from 'react-native';
import type { KeyboardEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../../theme';
import { Text } from '../../ui';

interface KeyboardFrameState {
  height: number;
  visible: boolean;
}

const HIDDEN_KEYBOARD_STATE: KeyboardFrameState = {
  height: 0,
  visible: false,
};

export function KeyboardDismissOverlay() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [keyboardFrame, setKeyboardFrame] = useState<KeyboardFrameState>(HIDDEN_KEYBOARD_STATE);

  useEffect(() => {
    const handleKeyboardShow = (event: KeyboardEvent) => {
      const nextHeight = Math.max(0, event.endCoordinates.height);

      setKeyboardFrame({
        height: nextHeight,
        visible: nextHeight > 0,
      });
    };

    const handleKeyboardHide = () => {
      setKeyboardFrame(HIDDEN_KEYBOARD_STATE);
    };

    const showEventName = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEventName = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const frameChangeEventName = Platform.OS === 'ios' ? 'keyboardWillChangeFrame' : null;

    const showSubscription = Keyboard.addListener(showEventName, handleKeyboardShow);
    const hideSubscription = Keyboard.addListener(hideEventName, handleKeyboardHide);
    const frameChangeSubscription = frameChangeEventName
      ? Keyboard.addListener(frameChangeEventName, handleKeyboardShow)
      : null;

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
      frameChangeSubscription?.remove();
    };
  }, []);

  const bottomOffset = useMemo(() => {
    if (!keyboardFrame.visible || keyboardFrame.height <= 0) {
      return theme.spacing.none;
    }

    return Math.max(theme.spacing.md, keyboardFrame.height - insets.bottom + theme.spacing.sm);
  }, [insets.bottom, keyboardFrame.height, keyboardFrame.visible, theme.spacing]);

  if (!keyboardFrame.visible || keyboardFrame.height <= 0) {
    return null;
  }

  const styles = StyleSheet.create({
    container: {
      bottom: bottomOffset,
      left: 0,
      position: 'absolute',
      right: 0,
      zIndex: 100,
    },
    dismissButton: {
      alignItems: 'center',
      alignSelf: 'flex-end',
      backgroundColor: theme.colors.background.surface,
      borderColor: theme.colors.border.subtle,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      flexDirection: 'row',
      gap: theme.spacing.xs,
      marginRight: theme.spacing.md,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.xs,
    },
    dismissButtonPressed: {
      opacity: 0.72,
    },
  });

  return (
    <View pointerEvents="box-none" style={styles.container}>
      <Pressable
        accessibilityLabel="Dismiss keyboard"
        accessibilityRole="button"
        onPress={() => {
          Keyboard.dismiss();
        }}
        style={({ pressed }) => [styles.dismissButton, pressed ? styles.dismissButtonPressed : null]}
      >
        <Ionicons color={theme.colors.text.primary} name="chevron-down" size={16} />
        <Text variant="label">Done</Text>
      </Pressable>
    </View>
  );
}
