import { Image, StyleSheet, View } from 'react-native';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';

import { APP_NAME, BRAND_LOGO } from '../../lib/branding';
import { useTheme } from '../../theme';
import { Text } from '../../ui';
import type { TextProps } from '../../ui';

export interface TabBrandHeaderProps {
  title: string;
  subtitle?: string;
  showBrand?: boolean;
  brandLabel?: string;
  style?: StyleProp<ViewStyle>;
  titleStyle?: StyleProp<TextStyle>;
  subtitleStyle?: StyleProp<TextStyle>;
  brandLabelStyle?: StyleProp<TextStyle>;
  titleVariant?: TextProps['variant'];
  testID?: string;
}

/**
 * Shared header for top-level tabs that should match the profile tab structure.
 */
export function TabBrandHeader({
  title,
  subtitle,
  showBrand = true,
  brandLabel = APP_NAME,
  style,
  titleStyle,
  subtitleStyle,
  brandLabelStyle,
  titleVariant = 'titleMd',
  testID,
}: TabBrandHeaderProps) {
  const theme = useTheme();

  const styles = StyleSheet.create({
    container: {
      backgroundColor: theme.colors.background.surface,
      borderBottomColor: theme.colors.border.subtle,
      borderBottomWidth: 1,
      gap: theme.spacing.xs,
      paddingBottom: theme.spacing.md,
      paddingHorizontal: theme.spacing.md,
      paddingTop: theme.spacing.sm,
    },
    brandRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: theme.spacing.xs,
    },
    logoBadge: {
      height: 32,
      overflow: 'hidden',
      borderRadius: theme.radii.md,
      width: 32,
    },
    logoImage: {
      height: '100%',
      width: '100%',
    },
    brandLabel: {
      color: theme.colors.text.secondary,
    },
    subtitle: {
      color: theme.colors.text.muted,
    },
  });

  return (
    <View style={[styles.container, style]} testID={testID}>
      {showBrand ? (
        <View style={styles.brandRow}>
          <View style={styles.logoBadge}>
            <Image resizeMode="contain" source={BRAND_LOGO} style={styles.logoImage} />
          </View>
          <Text style={[styles.brandLabel, brandLabelStyle]} variant="displayMd">
            {brandLabel}
          </Text>
        </View>
      ) : null}
      <Text style={titleStyle} variant={titleVariant}>
        {title}
      </Text>
      {subtitle ? <Text style={[styles.subtitle, subtitleStyle]}>{subtitle}</Text> : null}
    </View>
  );
}
