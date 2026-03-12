import PocketBase from 'pocketbase';

import { env } from '@/lib/env';

export const pb = new PocketBase(env.apiUrl);

pb.autoCancellation(false);
