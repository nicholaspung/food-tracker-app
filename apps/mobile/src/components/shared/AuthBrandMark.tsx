import { Image, View } from 'react-native';

import { APP_NAME, BRAND_LOGO } from '../../lib/branding';
import { createThemedStyles } from '../../theme';
import { Text } from '../../ui';

type AuthBrandMarkSize = 'default' | 'large';

interface AuthBrandMarkProps {
  size?: AuthBrandMarkSize;
}

const useStyles = createThemedStyles((theme, badgeSize: number) => ({
  container: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  logoBadge: {
    height: badgeSize,
    overflow: 'hidden',
    borderRadius: theme.radii.md,
    width: badgeSize,
  },
  logoImage: {
    height: '100%',
    width: '100%',
  },
}));

export function AuthBrandMark({ size = 'default' }: AuthBrandMarkProps) {
  const isLarge = size === 'large';
  const badgeSize = isLarge ? 40 : 28;
  const styles = useStyles(badgeSize);

  return (
    <View style={styles.container}>
      <View style={styles.logoBadge}>
        <Image resizeMode="contain" source={BRAND_LOGO} style={styles.logoImage} />
      </View>
      <Text tone="secondary" variant={isLarge ? 'titleMd' : 'label'}>
        {APP_NAME}
      </Text>
    </View>
  );
}
