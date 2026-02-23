import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '../../theme';
import { Text } from '../../ui';

type AuthBrandMarkSize = 'default' | 'large';

interface AuthBrandMarkProps {
  size?: AuthBrandMarkSize;
}

export function AuthBrandMark({ size = 'default' }: AuthBrandMarkProps) {
  const theme = useTheme();
  const isLarge = size === 'large';
  const badgeSize = isLarge ? 40 : 28;
  const iconSize = isLarge ? 20 : 14;

  const styles = StyleSheet.create({
    container: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: theme.spacing.xs,
    },
    logoBadge: {
      alignItems: 'center',
      borderColor: theme.colors.text.brand,
      borderRadius: theme.radii.pill,
      borderWidth: 2,
      height: badgeSize,
      justifyContent: 'center',
      width: badgeSize,
    },
  });

  return (
    <View style={styles.container}>
      <View style={styles.logoBadge}>
        <Ionicons color={theme.colors.text.brand} name="restaurant-outline" size={iconSize} />
      </View>
      <Text tone="secondary" variant={isLarge ? 'titleMd' : 'label'}>
        Yummy Recs
      </Text>
    </View>
  );
}
