import PocketBase from 'pocketbase';

import { env } from '../config/env';
import { authStore } from './pocketbaseAuthStore';

export const pb = new PocketBase(env.pocketbaseUrl, authStore);

// Keep request lifecycle explicit and predictable across React renders.
pb.autoCancellation(false);
