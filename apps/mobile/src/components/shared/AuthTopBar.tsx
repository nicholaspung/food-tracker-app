import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '../../theme';
import { AuthBrandMark } from './AuthBrandMark';

interface AuthTopBarProps {
  onBackPress?: () => void;
  backAccessibilityLabel?: string;
}

export function AuthTopBar({ onBackPress, backAccessibilityLabel = 'Back' }: AuthTopBarProps) {
  const theme = useTheme();

  const styles = StyleSheet.create({
    container: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: theme.spacing.sm,
    },
    backButton: {
      alignItems: 'center',
      backgroundColor: theme.colors.background.muted,
      borderColor: theme.colors.border.subtle,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      height: 36,
      justifyContent: 'center',
      width: 36,
    },
  });

  return (
    <View style={styles.container}>
      {onBackPress ? (
        <Pressable
          accessibilityLabel={backAccessibilityLabel}
          accessibilityRole="button"
          onPress={onBackPress}
          style={styles.backButton}
          testID="screen-back-button"
        >
          <Ionicons color={theme.colors.text.primary} name="chevron-back" size={18} />
        </Pressable>
      ) : null}
      <AuthBrandMark size="large" />
    </View>
  );
}
