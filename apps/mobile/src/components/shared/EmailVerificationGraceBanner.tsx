import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatEmailVerificationRemainingTime } from '../../lib/emailVerificationAccess';
import { createThemedStyles } from '../../theme';
import { Button, Card, Text } from '../../ui';

interface EmailVerificationGraceBannerProps {
  graceEndsAt: string;
  onVerifyPress: () => void;
}

const useStyles = createThemedStyles((theme) => ({
  container: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  card: {
    gap: theme.spacing.sm,
  },
  copy: {
    gap: theme.spacing.xs,
  },
}));

export function EmailVerificationGraceBanner({
  graceEndsAt,
  onVerifyPress,
}: EmailVerificationGraceBannerProps) {
  const insets = useSafeAreaInsets();
  const styles = useStyles();

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, 12) }]}>
      <Card style={styles.card} tone="warning">
        <View style={styles.copy}>
          <Text tone="warning" variant="label">
            Verify Your Email
          </Text>
          <Text>
            Verify within 3 days of signup to keep using the app.
          </Text>
          <Text tone="warning" variant="bodySm">
            {formatEmailVerificationRemainingTime(graceEndsAt)}
          </Text>
        </View>
        <Button label="Verify Email" onPress={onVerifyPress} variant="secondary" />
      </Card>
    </View>
  );
}
