import PocketBase from 'pocketbase';

// Create a single PocketBase instance for the entire application
// The backend runs on port 8090 by default
export const pb = new PocketBase('http://127.0.0.1:8090');

// Enable auto cancellation for pending requests
pb.autoCancellation(false);

// Export types for user authentication
export interface AuthData {
  email: string;
  password: string;
}

export interface SignUpData extends AuthData {
  passwordConfirm: string;
}

export interface User {
  id: string;
  email: string;
  verified: boolean;
  created: string;
  updated: string;
}
