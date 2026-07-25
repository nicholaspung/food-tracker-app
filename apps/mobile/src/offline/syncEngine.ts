import { pb } from '../lib/pocketbase';
import { MutationReplayService } from './MutationReplayService';
import { SQLiteMutationQueueStore } from './SQLiteMutationQueueStore';
import { createFetchMutationTransport } from './fetchMutationTransport';

const queueStore = new SQLiteMutationQueueStore();
const transport = createFetchMutationTransport({
  cancelPendingRequests: () => pb.cancelAllRequests(),
  getActiveAccountId: () => pb.authStore.record?.id ?? null,
  getAuthToken: () => pb.authStore.token || null,
});

export const syncEngine = new MutationReplayService(queueStore, transport);
