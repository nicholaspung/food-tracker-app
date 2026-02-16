import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StyleSheet, View } from 'react-native';

import type { RootStackParamList } from '../navigation/RootNavigator';
import { useAuth } from '../providers/AuthProvider';
import { useTheme } from '../theme';
import { Button, Card, Screen, Text } from '../ui';

type InviteScreenProps = NativeStackScreenProps<RootStackParamList, 'Invite'>;

function generateFriendCode(userId: string | undefined): string {
  if (!userId) {
    return 'LOCAL000';
  }

  const cleanId = userId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return cleanId.slice(0, 8).padEnd(8, 'X');
}

export function InviteScreen({ navigation }: InviteScreenProps) {
  const theme = useTheme();
  const { user } = useAuth();
  const inviteCode = generateFriendCode(user?.id);

  const styles = StyleSheet.create({
    codeBox: {
      alignItems: 'center',
      backgroundColor: theme.colors.status.infoBg,
      borderColor: theme.colors.border.info,
      borderRadius: theme.radii.md,
      borderWidth: 2,
      gap: theme.spacing.xxs,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: theme.spacing.md,
    },
    codeLabel: {
      color: theme.colors.text.info,
      fontSize: 12,
      fontWeight: '600',
      lineHeight: 16,
      letterSpacing: 0.4,
      textTransform: 'uppercase',
    },
    codeText: {
      color: theme.colors.text.info,
      fontSize: 26,
      fontWeight: '700',
      letterSpacing: 3,
      lineHeight: 30,
    },
    actions: {
      flexDirection: 'row',
      gap: theme.spacing.xs,
    },
    action: {
      flex: 1,
    },
  });

  return (
    <Screen>
      <Text variant="titleMd">Invite Friends</Text>
      <Card>
        <Text variant="label">Your friend code</Text>
        <View style={styles.codeBox}>
          <Text style={styles.codeLabel}>Friend Code</Text>
          <Text style={styles.codeText}>{inviteCode}</Text>
        </View>
        <Text tone="secondary">Share your code directly, or let friends scan your QR flow.</Text>
      </Card>

      <View style={styles.actions}>
        <Button
          label="Open QR Scanner"
          onPress={() => {
            navigation.navigate('QRScanner');
          }}
          style={styles.action}
        />
        <Button
          label="Back to Friends"
          onPress={() => {
            navigation.navigate('Friends');
          }}
          style={styles.action}
          variant="secondary"
        />
      </View>
    </Screen>
  );
}
