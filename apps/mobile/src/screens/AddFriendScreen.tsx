import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { FeatureFormScreenScaffold, PageErrorToast } from '../components/shared';
import { inviteFriend } from '../features';
import { useFeatureOutboxQueue } from '../features/store/useFeatureOutboxQueue';
import { useQueuedWrite } from '../features/store/useQueuedWrite';
import { showQueuedOfflineAlert } from '../lib/offlineAlerts';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useConnectivity } from '../providers/ConnectivityProvider';
import { useAuth } from '../providers/AuthProvider';
import { createThemedStyles } from '../theme';
import { Button, Card, Input, Text } from '../ui';

type AddFriendScreenProps = NativeStackScreenProps<RootStackParamList, 'AddFriend'>;

const useStyles = createThemedStyles((theme) => ({
  body: {
    gap: theme.spacing.md,
  },
  formCard: {
    gap: theme.spacing.sm,
  },
  scanAction: {
    marginTop: theme.spacing.xxs,
  },
  helperCard: {
    gap: theme.spacing.xs,
  },
}));

function sanitizeFriendCode(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 8);
}

function generateFriendCode(userId: string | undefined): string {
  if (!userId) {
    return 'LOCAL000';
  }

  const cleanId = userId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return cleanId.slice(0, 8).padEnd(8, 'X');
}

export function AddFriendScreen({ navigation }: AddFriendScreenProps) {
  const styles = useStyles();
  const queryClient = useQueryClient();
  const queueWrite = useQueuedWrite();
  const queueFeatureOutbox = useFeatureOutboxQueue();
  const { isOnline } = useConnectivity();
  const { user } = useAuth();

  const [friendCode, setFriendCode] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const myFriendCode = useMemo(() => generateFriendCode(user?.id), [user?.id]);

  const handleBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    navigation.navigate('Friends');
  };

  const handleRequestComplete = () => {
    navigation.navigate('Friends', {
      initialFriendsSubTab: 'sent',
      initialSection: 'friends-list',
    });
  };

  const handleSubmit = async () => {
    const normalizedCode = sanitizeFriendCode(friendCode);

    if (!normalizedCode) {
      setErrorMessage('Friend code is required.');
      return;
    }

    if (normalizedCode === myFriendCode) {
      setErrorMessage('You cannot add yourself as a friend.');
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      if (!isOnline) {
        await queueFeatureOutbox('friend.request.send', { code: normalizedCode });
        await queryClient.invalidateQueries({ queryKey: ['feature', 'friends'] });
        showQueuedOfflineAlert('Friend request');
        handleRequestComplete();
        return;
      }

      await queueWrite('friend.request.send');
      await inviteFriend({ code: normalizedCode });
      await queryClient.invalidateQueries({ queryKey: ['feature', 'friends'] });
      handleRequestComplete();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not send friend request.';
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const canSubmit = friendCode.length === 8 && !isSubmitting;

  return (
    <FeatureFormScreenScaffold
      keyboardAware
      onBackPress={handleBack}
      primaryAction={{
        disabled: !canSubmit,
        label: 'Send Request',
        loading: isSubmitting,
        onPress: () => {
          void handleSubmit();
        },
      }}
      subtitle="Enter a friend code or scan a QR code to send a request."
      testID="add-friend-screen"
      title="Add Friend"
    >
      <View style={styles.body}>
        <PageErrorToast errorMessage={errorMessage} title="Could not send friend request" />

        <Card style={styles.formCard}>
          <Input
            autoCapitalize="characters"
            autoCorrect={false}
            keyboardType="ascii-capable"
            label="Friend Code"
            maxLength={8}
            onChangeText={(value) => {
              setErrorMessage(null);
              setFriendCode(sanitizeFriendCode(value));
            }}
            placeholder="Enter 8-character code"
            value={friendCode}
          />
          <Button
            disabled={isSubmitting}
            label="Scan QR"
            onPress={() => {
              navigation.navigate('QRScanner');
            }}
            style={styles.scanAction}
            variant="secondary"
          />
        </Card>

        <Card style={styles.helperCard}>
          <Text variant="label">Need a code?</Text>
          <Text tone="secondary">
            Ask your friend to open the Friends tab and share their 8-character friend code or QR invite.
          </Text>
        </Card>
      </View>
    </FeatureFormScreenScaffold>
  );
}
