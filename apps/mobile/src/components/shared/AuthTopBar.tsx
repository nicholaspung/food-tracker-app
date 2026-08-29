import { Ionicons } from '../../ui/AppIcon';
import { Pressable, View } from 'react-native';

import { createThemedStyles, useTheme } from '../../theme';
import { AuthBrandMark } from './AuthBrandMark';

interface AuthTopBarProps {
  onBackPress?: () => void;
  backAccessibilityLabel?: string;
}

const useStyles = createThemedStyles((theme) => ({
  container: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  backButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  backButtonVisual: {
    alignItems: 'center',
    backgroundColor: theme.colors.background.muted,
    borderColor: theme.colors.border.subtle,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
}));

export function AuthTopBar({ onBackPress, backAccessibilityLabel = 'Back' }: AuthTopBarProps) {
  const theme = useTheme();
  const styles = useStyles();

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
          <View style={styles.backButtonVisual} testID="screen-back-button-visual">
            <Ionicons color={theme.colors.text.primary} name="chevron-back" size={18} />
          </View>
        </Pressable>
      ) : null}
      <AuthBrandMark size="large" />
    </View>
  );
}
