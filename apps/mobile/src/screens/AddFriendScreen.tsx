import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { FeatureFormScreenScaffold, PageErrorToast } from '../components/shared';
import { friendsQueryKeys, inviteFriend } from '../features';
import { useOfflineAwareFeatureWrite } from '../features/store/useOfflineAwareFeatureWrite';
import { showQueuedOfflineAlert } from '../lib/offlineAlerts';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { trackObservabilityEvent } from '../observability';
import { trackProductEvent } from '../observability/productAnalytics';
import { useAuth } from '../providers/AuthProvider';
import { useConnectivity } from '../providers/ConnectivityProvider';
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
  const writeFeature = useOfflineAwareFeatureWrite();
  const { user } = useAuth();
  const { isOnline } = useConnectivity();

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
      trackObservabilityEvent('FRIEND_REQUEST_SEND_VALIDATION_FAILED', {
        source: 'AddFriendScreen',
        entryMethod: 'manual_code',
        reason: 'missing_code',
        isOnline,
      });
      setErrorMessage('Friend code is required.');
      return;
    }

    if (normalizedCode === myFriendCode) {
      trackObservabilityEvent('FRIEND_REQUEST_SEND_VALIDATION_FAILED', {
        source: 'AddFriendScreen',
        entryMethod: 'manual_code',
        reason: 'self_code',
        isOnline,
      });
      setErrorMessage('You cannot add yourself as a friend.');
      return;
    }

    setErrorMessage(null);
    trackObservabilityEvent('FRIEND_REQUEST_SEND_STARTED', {
      source: 'AddFriendScreen',
      entryMethod: 'manual_code',
      codeLength: normalizedCode.length,
      isOnline,
    });
    setIsSubmitting(true);

    try {
      const requestResult = await writeFeature({
        operationName: 'friend.request.send',
        offline: {
          strategy: 'outbox',
          payload: { code: normalizedCode },
        },
        execute: () => inviteFriend({ code: normalizedCode }),
      });

      if (requestResult.status === 'queued') {
        await queryClient.invalidateQueries({ queryKey: friendsQueryKeys.root });
        trackObservabilityEvent('FRIEND_REQUEST_SEND_SUCCEEDED', {
          source: 'AddFriendScreen',
          entryMethod: 'manual_code',
          queued: true,
        });
        trackProductEvent('social.friend_request_sent', {
          source: 'AddFriendScreen',
          entryMethod: 'manual_code',
          queued: true,
        });
        showQueuedOfflineAlert('Friend request');
        handleRequestComplete();
        return;
      }

      await queryClient.invalidateQueries({ queryKey: friendsQueryKeys.root });
      trackObservabilityEvent('FRIEND_REQUEST_SEND_SUCCEEDED', {
        source: 'AddFriendScreen',
        entryMethod: 'manual_code',
        queued: false,
      });
      trackProductEvent('social.friend_request_sent', {
        source: 'AddFriendScreen',
        entryMethod: 'manual_code',
        queued: false,
      });
      handleRequestComplete();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not send friend request.';
      trackObservabilityEvent('FRIEND_REQUEST_SEND_FAILED', {
        source: 'AddFriendScreen',
        entryMethod: 'manual_code',
        errorMessage: message,
        errorType: error instanceof Error ? error.name : 'unknown_error',
        isOnline,
      });
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
              trackObservabilityEvent('ADD_FRIEND_SCAN_QR_TAPPED', {
                source: 'AddFriendScreen',
              });
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
