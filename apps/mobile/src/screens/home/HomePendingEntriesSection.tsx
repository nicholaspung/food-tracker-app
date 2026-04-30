import { View } from 'react-native';

import { PendingQueuedWriteRow } from '../../components/shared';
import type { QueuedFeatureWrite } from '../../features/store/queuedFeatureWrites';
import { Text } from '../../ui';

type HomeCreateWrite = QueuedFeatureWrite<'visit.create' | 'food-product.create'>;

interface HomePendingEntriesSectionProps {
  pendingWrites: HomeCreateWrite[];
  styles: {
    pendingStack: object;
    infoTitle: object;
  };
}

export function HomePendingEntriesSection({
  pendingWrites,
  styles,
}: HomePendingEntriesSectionProps) {
  if (pendingWrites.length === 0) {
    return null;
  }

  return (
    <View style={styles.pendingStack}>
      <Text style={styles.infoTitle} variant="bodyLgBold">
        Pending entries
      </Text>
      {pendingWrites.map((write) => {
        if (write.operationName === 'visit.create') {
          const payload = write.payload as { restaurantName: string; items?: unknown[] };
          const itemCount = Array.isArray(payload.items) ? payload.items.length : 0;
          return (
            <PendingQueuedWriteRow
              key={write.id}
              createdAt={write.createdAt}
              description={
                itemCount > 0
                  ? `${itemCount} item${itemCount === 1 ? '' : 's'}`
                  : undefined
              }
              idempotencyKey={write.idempotencyKey}
              lastError={write.lastError}
              status={write.status}
              title={`Visit at ${payload.restaurantName}`}
            />
          );
        }

        const payload = write.payload as { itemName: string; locationText?: string };
        return (
          <PendingQueuedWriteRow
            key={write.id}
            createdAt={write.createdAt}
            description={payload.locationText}
            idempotencyKey={write.idempotencyKey}
            lastError={write.lastError}
            status={write.status}
            title={payload.itemName}
          />
        );
      })}
    </View>
  );
}
