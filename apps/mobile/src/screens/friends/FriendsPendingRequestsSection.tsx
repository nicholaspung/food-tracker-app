import { View } from 'react-native';

import { PendingQueuedWriteRow } from '../../components/shared';
import type { QueuedFeatureWrite } from '../../features/store/queuedFeatureWrites';
import { Text } from '../../ui';

interface FriendsPendingRequestsSectionProps {
  pendingWrites: QueuedFeatureWrite<'friend.request.send'>[];
  styles: {
    pendingStack: object;
  };
}

export function FriendsPendingRequestsSection({
  pendingWrites,
  styles,
}: FriendsPendingRequestsSectionProps) {
  if (pendingWrites.length === 0) {
    return null;
  }

  return (
    <View style={styles.pendingStack}>
      <Text variant="label">Pending friend requests</Text>
      {pendingWrites.map((write) => {
        const payload = write.payload as { email?: string; friendCode?: string };
        return (
          <PendingQueuedWriteRow
            key={write.id}
            createdAt={write.createdAt}
            description={payload.email ?? payload.friendCode}
            idempotencyKey={write.idempotencyKey}
            lastError={write.lastError}
            status={write.status}
            title="Send friend request"
          />
        );
      })}
    </View>
  );
}
