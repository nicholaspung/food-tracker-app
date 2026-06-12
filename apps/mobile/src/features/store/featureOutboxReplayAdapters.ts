import { FEATURE_OUTBOX_REPLAY_ADAPTERS } from './featureOutboxRegistry';
import type { FeatureOutboxOperationName } from './featureOutboxOperations';
import type { FeatureWriteRequestOptions } from './featureStoreShared';

export async function replayRegisteredFeatureOutboxOperation(
  operationName: FeatureOutboxOperationName,
  payload: unknown,
  requestOptions: FeatureWriteRequestOptions,
): Promise<boolean> {
  const adapter = FEATURE_OUTBOX_REPLAY_ADAPTERS[operationName];
  if (!adapter) {
    return false;
  }

  await adapter(payload, requestOptions);
  return true;
}
