import PocketBase from 'pocketbase';

import { env } from '../config/env';
import { authStore } from './pocketbaseAuthStore';

export const pb = new PocketBase(env.pocketbaseUrl, authStore);

// Keep global auto-cancellation disabled because some overlapping request flows are legitimate.
// Search-heavy React Query reads should opt into cancellation with AbortSignal instead.
pb.autoCancellation(false);
