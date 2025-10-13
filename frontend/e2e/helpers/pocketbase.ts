import PocketBase from 'pocketbase';

// Create PocketBase instance for E2E tests
export const pb = new PocketBase('http://127.0.0.1:8090');

// Disable auto-cancellation for E2E tests
pb.autoCancellation(false);
