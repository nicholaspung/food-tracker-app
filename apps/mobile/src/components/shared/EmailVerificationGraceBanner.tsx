import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatEmailVerificationRemainingTime } from '../../lib/emailVerificationAccess';
import { createThemedStyles } from '../../theme';
import { Button, Card, Text } from '../../ui';

interface EmailVerificationGraceBannerProps {
  graceEndsAt: string;
  onVerifyPress: () => void;
}

const useStyles = createThemedStyles((theme) => ({
  safeArea: {
    backgroundColor: theme.colors.background.surface,
  },
  container: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  card: {
    backgroundColor: theme.colors.background.surface,
    borderColor: theme.colors.status.warningBorder,
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
  const styles = useStyles();
  const remainingTimeMessage = formatEmailVerificationRemainingTime(graceEndsAt).replace(
    ' to verify.',
    ' to verify to keep using app.',
  );

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <View style={styles.container}>
        <Card style={styles.card}>
          <View style={styles.copy}>
            <Text tone="warning" variant="label">
              Verify Your Email
            </Text>
            <Text tone="warning" variant="bodySm">
              {remainingTimeMessage}
            </Text>
          </View>
          <Button label="Verify Email" onPress={onVerifyPress} variant="secondary" />
        </Card>
      </View>
    </SafeAreaView>
  );
}
